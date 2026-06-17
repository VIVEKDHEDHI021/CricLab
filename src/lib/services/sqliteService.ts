import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { matchEngine, BallEventData } from './matchEngine';

class SqliteService {
  private sqliteConnection: SQLiteConnection | null = null;
  private db: SQLiteDBConnection | null = null;
  private isInitialized = false;
  private transactionQueue: Promise<any> = Promise.resolve();

  async initialize() {
    if (this.isInitialized) return;
    this.sqliteConnection = new SQLiteConnection(CapacitorSQLite);
    
    const isWeb = Capacitor.getPlatform() === 'web';
    if (isWeb) {
      const jeep = document.createElement('jeep-sqlite');
      document.body.appendChild(jeep);
      await customElements.whenDefined('jeep-sqlite');
      await this.sqliteConnection.initWebStore();
    }

    this.db = await this.sqliteConnection.createConnection(
      'criclab_db',
      false, // encrypted
      'no-encryption',
      1, // version
      false // readonly
    );
    await this.db.open();

    // Run schema creation
    await this.runMigrations();

    this.isInitialized = true;
    console.log('SQLite database initialized successfully');
  }

  async run(query: string, values: any[] = []): Promise<any> {
    await this.ensureInitialized();

    let resolveQueue: () => void;
    const nextInQueue = new Promise<void>((resolve) => {
      resolveQueue = resolve;
    });

    const currentQueue = this.transactionQueue;
    this.transactionQueue = nextInQueue;

    try {
      await currentQueue;
      const res = await this.db!.run(query, values, false);
      if (Capacitor.getPlatform() === 'web') {
        await this.sqliteConnection!.saveToStore('criclab_db');
      }
      return res;
    } finally {
      await new Promise(resolve => setTimeout(resolve, 10));
      resolveQueue!();
    }
  }

  async query(query: string, values: any[] = []): Promise<any[]> {
    await this.ensureInitialized();
    const res = await this.db!.query(query, values);
    return res.values || [];
  }

  async execute(statements: string): Promise<any> {
    await this.ensureInitialized();

    let resolveQueue: () => void;
    const nextInQueue = new Promise<void>((resolve) => {
      resolveQueue = resolve;
    });

    const currentQueue = this.transactionQueue;
    this.transactionQueue = nextInQueue;

    try {
      await currentQueue;
      const res = await this.db!.execute(statements, false);
      if (Capacitor.getPlatform() === 'web') {
        await this.sqliteConnection!.saveToStore('criclab_db');
      }
      return res;
    } finally {
      await new Promise(resolve => setTimeout(resolve, 10));
      resolveQueue!();
    }
  }

  async executeTransaction(runCallback: (db: SQLiteDBConnection) => Promise<void>) {
    await this.ensureInitialized();

    let resolveQueue: () => void;
    const nextInQueue = new Promise<void>((resolve) => {
      resolveQueue = resolve;
    });

    const currentQueue = this.transactionQueue;
    this.transactionQueue = nextInQueue;

    try {
      // Wait for the preceding transaction (if any) to completely finish
      await currentQueue;

      // Auto-recover/clear any orphan or uncleared transaction state
      const activeRes = await this.db!.isTransactionActive();
      if (activeRes.result) {
        console.warn("Orphan transaction detected, rolling back before starting new one");
        try {
          await this.db!.rollbackTransaction();
        } catch (rollbackErr) {
          console.error("Auto-recovery rollback failed", rollbackErr);
        }
      }

      await this.db!.beginTransaction();

      const dbWrapper: SQLiteDBConnection = new Proxy(this.db!, {
        get(target, prop, receiver) {
          if (prop === 'run') {
            return async (statement: string, values?: any[], transaction?: boolean) => {
              return target.run(statement, values, false);
            };
          }
          const val = Reflect.get(target, prop, receiver);
          if (typeof val === 'function') {
            return val.bind(target);
          }
          return val;
        }
      });

      await runCallback(dbWrapper);
      await this.db!.commitTransaction();
      if (Capacitor.getPlatform() === 'web') {
        await this.sqliteConnection!.saveToStore('criclab_db');
      }
    } catch (e) {
      console.error("Transaction failed, rolling back:", e);
      try {
        const activeRes = await this.db!.isTransactionActive();
        if (activeRes.result) {
          await this.db!.rollbackTransaction();
        }
      } catch (rollbackErr) {
        console.error("Rollback failed or transaction wasn't started", rollbackErr);
      }
      throw e;
    } finally {
      // Yield to the event loop to allow native SQLite to settle and free connection state
      await new Promise(resolve => setTimeout(resolve, 30));
      resolveQueue!();
    }
  }

  private async ensureInitialized() {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  private async runMigrations() {
    const schema = `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT,
        username TEXT UNIQUE,
        mobile TEXT UNIQUE,
        role TEXT DEFAULT 'user',
        password TEXT,
        email TEXT UNIQUE,
        must_change_password INTEGER DEFAULT 0,
        is_profile_setup_completed INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT DEFAULT NULL
      );

      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
        mobile TEXT,
        avatar TEXT,
        role TEXT,
        batting_style TEXT,
        bowling_style TEXT,
        jersey_number TEXT,
        catches INTEGER DEFAULT 0,
        run_outs INTEGER DEFAULT 0,
        age INTEGER DEFAULT NULL,
        city TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT DEFAULT NULL
      );

      CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY,
        team_a_id TEXT REFERENCES teams(id) ON DELETE CASCADE,
        team_b_id TEXT REFERENCES teams(id) ON DELETE CASCADE,
        overs INTEGER DEFAULT 6,
        wide_run INTEGER DEFAULT 1,
        noball_run INTEGER DEFAULT 1,
        match_type TEXT,
        ground TEXT,
        match_date TEXT NOT NULL,
        status TEXT DEFAULT 'upcoming',
        result TEXT,
        batting_first_id TEXT REFERENCES teams(id),
        current_innings INTEGER DEFAULT 1,
        last_man_batting INTEGER DEFAULT 0,
        squad_a_ids TEXT,
        squad_b_ids TEXT,
        man_of_the_match_id TEXT REFERENCES players(id),
        created_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS match_squads (
        id TEXT PRIMARY KEY,
        match_id TEXT REFERENCES matches(id) ON DELETE CASCADE,
        player_id TEXT,
        team_id TEXT REFERENCES teams(id) ON DELETE CASCADE,
        display_name TEXT,
        role TEXT,
        jersey_number TEXT,
        captain INTEGER DEFAULT 0,
        wicket_keeper INTEGER DEFAULT 0,
        is_guest INTEGER DEFAULT 0,
        nickname TEXT,
        UNIQUE(match_id, player_id)
      );

      CREATE TABLE IF NOT EXISTS innings (
        id TEXT PRIMARY KEY,
        match_id TEXT REFERENCES matches(id) ON DELETE CASCADE,
        innings_no INTEGER NOT NULL,
        batting_team_id TEXT REFERENCES teams(id) ON DELETE CASCADE,
        bowling_team_id TEXT REFERENCES teams(id) ON DELETE CASCADE,
        runs INTEGER DEFAULT 0,
        wickets INTEGER DEFAULT 0,
        legal_balls INTEGER DEFAULT 0,
        is_closed INTEGER DEFAULT 0,
        UNIQUE(match_id, innings_no)
      );

      CREATE TABLE IF NOT EXISTS overs (
        id TEXT PRIMARY KEY,
        match_id TEXT REFERENCES matches(id) ON DELETE CASCADE,
        innings_no INTEGER NOT NULL,
        over_no INTEGER NOT NULL,
        status TEXT DEFAULT 'PENDING'
      );

      CREATE TABLE IF NOT EXISTS ball_events (
        event_uuid TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        sequence_number INTEGER NOT NULL,
        match_id TEXT REFERENCES matches(id) ON DELETE CASCADE,
        innings_no INTEGER NOT NULL,
        over_no INTEGER,
        ball_no INTEGER,
        striker_id TEXT,
        non_striker_id TEXT,
        bowler_id TEXT,
        batting_team_id TEXT,
        bowling_team_id TEXT,
        runs_off_bat INTEGER DEFAULT 0,
        extras INTEGER DEFAULT 0,
        extra_type TEXT,
        wicket INTEGER DEFAULT 0,
        wicket_type TEXT,
        dismissed_player_id TEXT,
        legal_delivery INTEGER DEFAULT 1,
        scorer_id TEXT,
        device_timestamp INTEGER NOT NULL,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS batting_stats (
        id TEXT PRIMARY KEY,
        match_id TEXT REFERENCES matches(id) ON DELETE CASCADE,
        player_id TEXT,
        runs INTEGER DEFAULT 0,
        balls INTEGER DEFAULT 0,
        fours INTEGER DEFAULT 0,
        sixes INTEGER DEFAULT 0,
        strike_rate REAL DEFAULT 0.0,
        is_out INTEGER DEFAULT 0,
        dismissal_type TEXT,
        bowler_id TEXT
      );

      CREATE TABLE IF NOT EXISTS bowling_stats (
        id TEXT PRIMARY KEY,
        match_id TEXT REFERENCES matches(id) ON DELETE CASCADE,
        player_id TEXT,
        overs TEXT,
        runs_conceded INTEGER DEFAULT 0,
        wickets INTEGER DEFAULT 0,
        economy REAL DEFAULT 0.0,
        maidens INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS fielding_stats (
        id TEXT PRIMARY KEY,
        match_id TEXT REFERENCES matches(id) ON DELETE CASCADE,
        player_id TEXT,
        catches INTEGER DEFAULT 0,
        run_outs INTEGER DEFAULT 0,
        stumpings INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS partnerships (
        id TEXT PRIMARY KEY,
        match_id TEXT REFERENCES matches(id) ON DELETE CASCADE,
        innings_no INTEGER NOT NULL,
        batsman1_id TEXT,
        batsman2_id TEXT,
        runs INTEGER DEFAULT 0,
        balls INTEGER DEFAULT 0,
        active INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS fall_of_wickets (
        id TEXT PRIMARY KEY,
        match_id TEXT REFERENCES matches(id) ON DELETE CASCADE,
        innings_no INTEGER NOT NULL,
        wicket_number INTEGER NOT NULL,
        runs INTEGER DEFAULT 0,
        over REAL DEFAULT 0.0,
        player_id TEXT
      );

      CREATE TABLE IF NOT EXISTS extras (
        id TEXT PRIMARY KEY,
        match_id TEXT REFERENCES matches(id) ON DELETE CASCADE,
        innings_no INTEGER NOT NULL,
        wides INTEGER DEFAULT 0,
        noballs INTEGER DEFAULT 0,
        byes INTEGER DEFAULT 0,
        legbyes INTEGER DEFAULT 0,
        total INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS match_results (
        match_id TEXT PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
        winner_id TEXT,
        margin TEXT,
        result_text TEXT
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `;
    await this.db!.execute(schema);

    // Alter table to add email column if it is missing (for upgrading existing local DBs)
    try {
      await this.db!.execute("ALTER TABLE users ADD COLUMN email TEXT;");
      console.log("[SQLite] Added email column to users table successfully");
    } catch (err) {
      // Column already exists, ignore error
    }

    // Seed admin user if it doesn't exist, or update to match the requested credentials
    const users = await this.db!.query("SELECT id FROM users WHERE username = 'admin';");
    if (!users.values || users.values.length === 0) {
      await this.db!.run(
        "INSERT INTO users (id, name, username, mobile, role, password, must_change_password, is_profile_setup_completed) VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
        ['admin-uuid-1111-2222-333333333333', 'Admin', 'admin', '9999999999', 'admin', 'admin123', 0, 1]
      );
    } else {
      await this.db!.run(
        "UPDATE users SET name = ?, mobile = ?, password = ?, role = ? WHERE username = 'admin';",
        ['Admin', '9999999999', 'admin123', 'admin']
      );
    }
  }

  // Pure DDL/DML Recalculation Engine
  async recalculateMatchStats(matchId: string) {
    const matches = await this.query("SELECT * FROM matches WHERE id = ?;", [matchId]);
    if (matches.length === 0) return;
    const match = matches[0];

    const squad = await this.query("SELECT player_id FROM match_squads WHERE match_id = ?;", [matchId]);
    const squadIds = squad.map(s => s.player_id);

    // Split squad players by team_id
    const squadA = await this.query("SELECT player_id FROM match_squads WHERE match_id = ? AND team_id = ?;", [matchId, match.team_a_id]);
    const squadB = await this.query("SELECT player_id FROM match_squads WHERE match_id = ? AND team_id = ?;", [matchId, match.team_b_id]);

    const rawEvents = await this.query("SELECT * FROM ball_events WHERE match_id = ? ORDER BY sequence_number ASC;", [matchId]);

    // Map DB rows to BallEventData interface format
    const events: BallEventData[] = rawEvents.map(e => ({
      event_uuid: e.event_uuid,
      event_type: e.event_type as any,
      sequence_number: e.sequence_number,
      match_id: e.match_id,
      innings_no: e.innings_no,
      over_no: e.over_no,
      ball_no: e.ball_no,
      striker_id: e.striker_id,
      non_striker_id: e.non_striker_id,
      bowler_id: e.bowler_id,
      batting_team_id: e.batting_team_id,
      bowling_team_id: e.bowling_team_id,
      runs_off_bat: e.runs_off_bat ?? 0,
      extras: e.extras ?? 0,
      extra_type: e.extra_type as any,
      wicket: e.wicket === 1,
      wicket_type: e.wicket_type,
      dismissed_player_id: e.dismissed_player_id,
      legal_delivery: e.legal_delivery === 1,
      scorer_id: e.scorer_id,
      device_timestamp: e.device_timestamp,
      metadata: e.metadata ? JSON.parse(e.metadata) : null
    }));

    // Reconstruct match state using the replay engine
    const derivedState = matchEngine.replay(events, {
      id: match.id,
      team_a_id: match.team_a_id,
      team_b_id: match.team_b_id,
      batting_first_id: match.batting_first_id || match.team_a_id,
      overs: match.overs ?? 6,
      wide_run: match.wide_run ?? 1,
      noball_run: match.noball_run ?? 1,
      last_man_batting: match.last_man_batting === 1,
      squad_a_ids: squadA.map(p => p.player_id),
      squad_b_ids: squadB.map(p => p.player_id)
    });

    // Run the persistence update inside a single transaction to ensure absolute consistency
    await this.executeTransaction(async (db) => {
      // Clear old calculated stats for this match
      await db.run("DELETE FROM batting_stats WHERE match_id = ?;", [matchId]);
      await db.run("DELETE FROM bowling_stats WHERE match_id = ?;", [matchId]);
      await db.run("DELETE FROM fielding_stats WHERE match_id = ?;", [matchId]);
      await db.run("DELETE FROM partnerships WHERE match_id = ?;", [matchId]);
      await db.run("DELETE FROM fall_of_wickets WHERE match_id = ?;", [matchId]);
      await db.run("DELETE FROM extras WHERE match_id = ?;", [matchId]);
      await db.run("DELETE FROM match_results WHERE match_id = ?;", [matchId]);

      // 1. Batting statistics
      for (const [playerId, s] of Object.entries(derivedState.batter_states)) {
        await db.run(
          `INSERT INTO batting_stats (id, match_id, player_id, runs, balls, fours, sixes, strike_rate, is_out, dismissal_type, bowler_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            `${matchId}_bat_${playerId}`,
            matchId,
            playerId,
            s.runs,
            s.balls,
            s.fours,
            s.sixes,
            s.balls > 0 ? (s.runs / s.balls) * 100 : 0.0,
            s.is_out ? 1 : 0,
            s.wicket_type || null,
            s.dismissed_by || null
          ]
        );
      }

      // 2. Bowling statistics
      for (const [playerId, s] of Object.entries(derivedState.bowler_states)) {
        const oversVal = `${Math.floor(s.legal_balls / 6)}.${s.legal_balls % 6}`;
        const oversFraction = s.legal_balls / 6;
        await db.run(
          `INSERT INTO bowling_stats (id, match_id, player_id, overs, runs_conceded, wickets, economy, maidens)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            `${matchId}_bowl_${playerId}`,
            matchId,
            playerId,
            oversVal,
            s.runs_conceded,
            s.wickets,
            oversFraction > 0 ? s.runs_conceded / oversFraction : 0.0,
            s.maidens
          ]
        );
      }

      // 3. Fielding statistics (catches, run outs, stumpings)
      const fieldingMap: Record<string, { catches: number; run_outs: number; stumpings: number }> = {};
      for (const b of derivedState.balls) {
        if (b.is_wicket && b.wicket_type) {
          if (b.wicket_type === 'caught' && b.caught_by_id) {
            const f = b.caught_by_id;
            fieldingMap[f] = fieldingMap[f] || { catches: 0, run_outs: 0, stumpings: 0 };
            fieldingMap[f].catches++;
          } else if (b.wicket_type === 'stumped' && b.caught_by_id) {
            // In CricLab engine, stumper ID is captured under caught_by_id for stumping
            const f = b.caught_by_id;
            fieldingMap[f] = fieldingMap[f] || { catches: 0, run_outs: 0, stumpings: 0 };
            fieldingMap[f].stumpings++;
          }
        }
      }

      // Read run outs from raw event metadata to compute run outs stats
      for (const ev of events) {
        if (ev.wicket && ev.wicket_type === 'run_out' && ev.metadata?.caught_by_id) {
          const f = ev.metadata.caught_by_id; // run_out_by is stored in caught_by_id / caught_by
          fieldingMap[f] = fieldingMap[f] || { catches: 0, run_outs: 0, stumpings: 0 };
          fieldingMap[f].run_outs++;
        }
      }

      for (const [playerId, f] of Object.entries(fieldingMap)) {
        await db.run(
          `INSERT INTO fielding_stats (id, match_id, player_id, catches, run_outs, stumpings)
           VALUES (?, ?, ?, ?, ?, ?);`,
          [`${matchId}_field_${playerId}`, matchId, playerId, f.catches, f.run_outs, f.stumpings]
        );
      }

      // 4. Partnerships
      for (const [inningsNo, list] of Object.entries(derivedState.partnerships)) {
        const innNo = parseInt(inningsNo);
        for (let idx = 0; idx < list.length; idx++) {
          const p = list[idx];
          await db.run(
            `INSERT INTO partnerships (id, match_id, innings_no, batsman1_id, batsman2_id, runs, balls, active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
            [`${matchId}_part_${innNo}_${idx}`, matchId, innNo, p.batsman1, p.batsman2, p.runs, p.balls, p.active ? 1 : 0]
          );
        }
      }

      // 5. Fall of Wickets
      const fowMap: Record<number, number> = {}; // keeps track of wicket count per innings
      for (const b of derivedState.balls) {
        if (b.is_wicket && b.wicket_type && b.wicket_type !== 'retired_hurt') {
          const innNo = b.innings_no;
          fowMap[innNo] = (fowMap[innNo] || 0) + 1;
          
          // Calculate score at the fall of this wicket
          // We can find the sum of runs in all balls of this innings up to this ball_index
          const innBallsUpto = derivedState.balls.filter(
            ob => ob.innings_no === innNo && ob.ball_index <= b.ball_index
          );
          let runsAtWicket = innBallsUpto.reduce((sum, ob) => sum + ob.runs + ob.extra_runs, 0);
          
          // Also check extras from events to be sure
          const overDecimal = `${Math.floor(b.ball_index / 6)}.${b.ball_index % 6}`;

          await db.run(
            `INSERT INTO fall_of_wickets (id, match_id, innings_no, wicket_number, runs, over, player_id)
             VALUES (?, ?, ?, ?, ?, ?, ?);`,
            [
              `${matchId}_fow_${innNo}_${fowMap[innNo]}`,
              matchId,
              innNo,
              fowMap[innNo],
              runsAtWicket,
              parseFloat(overDecimal),
              b.batter_id
            ]
          );
        }
      }

      // 6. Extras per innings
      for (const [inningsNo, inn] of Object.entries(derivedState.innings)) {
        const innNo = parseInt(inningsNo);
        await db.run(
          `INSERT INTO extras (id, match_id, innings_no, wides, noballs, byes, legbyes, total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            `${matchId}_ext_${innNo}`,
            matchId,
            innNo,
            inn.wides,
            inn.noballs,
            inn.byes,
            inn.legbyes,
            inn.wides + inn.noballs + inn.byes + inn.legbyes
          ]
        );

        // Also update innings runs/wickets/legal_balls/is_closed in the database
        const innRows = await db.query("SELECT id FROM innings WHERE match_id = ? AND innings_no = ?;", [matchId, innNo]);
        if (innRows.values && innRows.values.length > 0) {
          await db.run(
            `UPDATE innings SET runs = ?, wickets = ?, legal_balls = ?, is_closed = ?
             WHERE match_id = ? AND innings_no = ?;`,
            [inn.runs, inn.wickets, inn.legal_balls, inn.is_closed ? 1 : 0, matchId, innNo]
          );
        } else {
          await db.run(
            `INSERT INTO innings (id, match_id, innings_no, batting_team_id, bowling_team_id, runs, wickets, legal_balls, is_closed)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [`${matchId}_inn_${innNo}`, matchId, innNo, inn.batting_team_id, inn.bowling_team_id, inn.runs, inn.wickets, inn.legal_balls, inn.is_closed ? 1 : 0]
          );
        }
      }

      // 7. Match Result persistence
      const resultText = derivedState.result;
      const matchStatus = derivedState.status;

      await db.run(
        "UPDATE matches SET status = ?, result = ?, current_innings = ? WHERE id = ?;",
        [matchStatus, resultText || null, derivedState.current_innings, matchId]
      );

      if (resultText) {
        let winnerId = null;
        if (resultText.toLowerCase().includes("win") || resultText.toLowerCase().includes("won")) {
          // Attempt to extract winner team ID based on result text matching team names
          const teamAName = (await db.query("SELECT name FROM teams WHERE id = ?;", [match.team_a_id])).values?.[0]?.name;
          const teamBName = (await db.query("SELECT name FROM teams WHERE id = ?;", [match.team_b_id])).values?.[0]?.name;
          
          if (teamAName && resultText.includes(teamAName)) {
            winnerId = match.team_a_id;
          } else if (teamBName && resultText.includes(teamBName)) {
            winnerId = match.team_b_id;
          }
        }
        await db.run(
          `INSERT INTO match_results (match_id, winner_id, margin, result_text)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(match_id) DO UPDATE SET winner_id = excluded.winner_id, result_text = excluded.result_text;`,
          [matchId, winnerId, null, resultText]
        );
      }
    });
  }
}

export const sqliteService = new SqliteService();
export type { SQLiteDBConnection };
