import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { V2_SCHEMA_QUERIES } from '../../engine/v2/database/schema';


function sqlVal(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return val.toString();
  if (typeof val === 'boolean') return val ? '1' : '0';
  const escaped = val.toString().replace(/'/g, "''");
  return `'${escaped}'`;
}

class SqliteService {
  private sqliteConnection: SQLiteConnection | null = null;
  private db: SQLiteDBConnection | null = null;
  private isInitialized = false;
  private transactionQueue: Promise<any> = Promise.resolve();
  private initPromise: Promise<void> | null = null;

  async initialize() {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      this.sqliteConnection = new SQLiteConnection(CapacitorSQLite);

      const isWeb = Capacitor.getPlatform() === 'web';
      if (isWeb) {
        const jeep = document.createElement('jeep-sqlite');
        document.body.appendChild(jeep);
        await customElements.whenDefined('jeep-sqlite');
        await this.sqliteConnection.initWebStore();
      }

      // Check if connection already exists in pool
      const isConnRes = await this.sqliteConnection.isConnection('criclab_db', false);
      if (isConnRes.result) {
        this.db = await this.sqliteConnection.retrieveConnection('criclab_db', false);
      } else {
        this.db = await this.sqliteConnection.createConnection(
          'criclab_db',
          false, // encrypted
          'no-encryption',
          1, // version
          false // readonly
        );
      }

      // Open database if it is not open
      const isOpenRes = await this.db.isDBOpen();
      if (!isOpenRes.result) {
        await this.db.open();
      }

      this.isInitialized = true;

      // Run schema creation
      await this.runMigrations();

      console.log('SQLite database initialized successfully');
    })();

    try {
      await this.initPromise;
    } catch (err) {
      this.isInitialized = false;
      this.initPromise = null;
      throw err;
    }
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

  async executeTransaction(
    runCallback: (db: SQLiteDBConnection) => Promise<void>,
    timeoutMs: number = 10000
  ) {
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

      const executionPromise = (async () => {
        await runCallback(dbWrapper);
        await this.db!.commitTransaction();
        if (Capacitor.getPlatform() === 'web') {
          await this.sqliteConnection!.saveToStore('criclab_db');
        }
      })();

      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(
          () => reject(new Error(`SQLite Transaction Timeout after ${Math.round(timeoutMs / 1000)}s`)),
          timeoutMs
        );
      });

      await Promise.race([executionPromise, timeoutPromise]);
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
        mobile TEXT,
        email TEXT,
        dob TEXT,
        city TEXT,
        state TEXT,
        country TEXT,
        profile_photo TEXT,
        bio TEXT,
        primary_role TEXT,
        batting_style TEXT,
        bowling_style TEXT,
        bowling_type TEXT,
        jersey_number TEXT,
        preferred_team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
        created_by TEXT,
        catches INTEGER DEFAULT 0,
        run_outs INTEGER DEFAULT 0,
        age INTEGER DEFAULT NULL,
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

    // Alter players table to add new columns if they are missing
    const playerCols = [
      { name: 'email', type: 'TEXT' },
      { name: 'dob', type: 'TEXT' },
      { name: 'state', type: 'TEXT' },
      { name: 'country', type: 'TEXT' },
      { name: 'profile_photo', type: 'TEXT' },
      { name: 'bio', type: 'TEXT' },
      { name: 'primary_role', type: 'TEXT' },
      { name: 'bowling_type', type: 'TEXT' },
      { name: 'preferred_team_id', type: 'TEXT REFERENCES teams(id) ON DELETE SET NULL' },
      { name: 'created_by', type: 'TEXT' }
    ];
    for (const col of playerCols) {
      try {
        await this.db!.execute(`ALTER TABLE players ADD COLUMN ${col.name} ${col.type};`);
        console.log(`[SQLite] Added ${col.name} column to players table successfully`);
      } catch (err) {
        // Column already exists, ignore error
      }
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

    // Auto-fix any matches that are marked 'live' but are actually completed (have a result or both innings closed)
    try {
      await this.db!.execute(`
        UPDATE matches
        SET status = 'past'
        WHERE status = 'live' AND (
          (result IS NOT NULL AND result != '') OR
          (SELECT COUNT(*) FROM innings WHERE match_id = matches.id AND is_closed = 1) >= 2
        );
      `);
      console.log("[SQLite] Auto-fixed inconsistent live matches to past status");
    } catch (err) {
      console.error("[SQLite] Failed to auto-fix legacy match statuses", err);
    }

    // Initialize CricEngine V2 schema
    try {
      console.log("[CricEngineV2] Initializing SQLite database schema...");
      for (const query of V2_SCHEMA_QUERIES) {
        await this.db!.execute(query);
      }
      console.log("[CricEngineV2] SQLite schema initialized successfully.");

      // Auto-fix inconsistent V2 live matches
      try {
        await this.db!.execute(`
          UPDATE v2_matches
          SET status = 'past'
          WHERE status = 'live' AND (
            (result IS NOT NULL AND result != '') OR
            (SELECT COUNT(*) FROM v2_innings WHERE match_id = v2_matches.id AND is_closed = 1) >= 2
          );
        `);
        console.log("[SQLite] Auto-fixed inconsistent V2 live matches to past status");
      } catch (err) {
        console.error("[SQLite] Failed to auto-fix V2 match statuses", err);
      }

      // Migrate legacy matches to CricEngine V2 on startup
      await this.migrateLegacyMatchesToV2();

      // Perform database maintenance (VACUUM / PRAGMA optimize) on startup
      await this.runDatabaseMaintenance();
    } catch (err) {
      console.error("[CricEngineV2] Failed to initialize database schema:", err);
    }
  }

  async migrateLegacyMatchesToV2() {
    try {
      console.log("[CricEngineV2] Starting legacy matches migration...");
      // Fetch all matches from legacy table
      const legacyMatches = await this.query("SELECT * FROM matches;");
      if (!legacyMatches || legacyMatches.length === 0) {
        console.log("[CricEngineV2] No legacy matches found to migrate.");
        return;
      }

      // Dynamically import MatchRecoveryService to prevent circular dependency
      const { MatchRecoveryService } = await import('../../engine/v2/services/matchRecoveryService');

      for (const m of legacyMatches) {
        // Check if it already exists in v2_matches
        const existing = await this.query("SELECT id FROM v2_matches WHERE id = ?;", [m.id]);
        if (existing.length === 0) {
          console.log(`[CricEngineV2] Migrating match ${m.id} to V2...`);
          // Insert into v2_matches
          await this.run(
            `INSERT INTO v2_matches (id, team_a_id, team_b_id, overs, wide_run, noball_run, match_type, ground, match_date, status, result, batting_first_id, current_innings, last_man_batting, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
              m.id,
              m.team_a_id,
              m.team_b_id,
              m.overs,
              m.wide_run,
              m.noball_run,
              m.match_type,
              m.ground,
              m.match_date,
              m.status,
              m.result,
              m.batting_first_id,
              m.current_innings,
              m.last_man_batting,
              m.created_by
            ]
          );

          // Get balls for this match
          const legacyBalls = await this.query("SELECT * FROM ball_events WHERE match_id = ? ORDER BY sequence_number ASC;", [m.id]);
          for (const b of legacyBalls) {
            await this.run(
              `INSERT INTO v2_ball_events (
                event_uuid, match_id, innings_no, over_no, ball_no, striker_id, non_striker_id, bowler_id,
                runs_off_bat, extras, extra_type, wicket, wicket_type, dismissed_player_id, timestamp, device_id,
                sequence_number, version, metadata, superseded_by, is_superseded
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
              [
                b.event_uuid,
                b.match_id,
                b.innings_no,
                b.over_no,
                b.ball_no,
                b.striker_id || '',
                b.non_striker_id || '',
                b.bowler_id || '',
                b.runs_off_bat ?? 0,
                b.extras ?? 0,
                b.extra_type || null,
                b.wicket ?? 0,
                b.wicket_type || null,
                b.dismissed_player_id || null,
                b.device_timestamp,
                b.scorer_id || 'legacy',
                b.sequence_number,
                1, // version
                b.metadata || null,
                null,
                0
              ]
            );
          }

          // Build snapshot, innings records, and stats for this match using MatchRecoveryService
          await MatchRecoveryService.rebuildFinalSnapshot(m.id);
          console.log(`[CricEngineV2] Rebuilt final snapshot for match ${m.id}`);
        }
      }
      console.log("[CricEngineV2] Legacy matches migration completed.");
    } catch (err) {
      console.error("[CricEngineV2] Error during legacy matches migration:", err);
    }
  }

  // Delegated Recalculation using CricEngine V2 Recovery Service
  async recalculateMatchStats(matchId: string, externalDb?: SQLiteDBConnection) {
    const { MatchRecoveryService } = await import('../../engine/v2/services/matchRecoveryService');
    if (externalDb) {
      // Rebuild stats inside the provided transactional connection
      await MatchRecoveryService.rebuildFinalSnapshot(matchId);
    } else {
      await this.executeTransaction(async () => {
        await MatchRecoveryService.rebuildFinalSnapshot(matchId);
      });
    }
    try {
      const { notifyLocalMatchUpdated } = await import('@/lib/match');
      notifyLocalMatchUpdated(matchId);
    } catch (e) {
      console.warn("Could not notify local match update:", e);
    }
  }

  private cachedColumns: Record<string, string[]> = {};

  async getTableColumns(tableName: string): Promise<string[]> {
    await this.ensureInitialized();
    if (this.cachedColumns[tableName]) {
      return this.cachedColumns[tableName];
    }
    try {
      const rows = await this.query(`PRAGMA table_info(${tableName});`);
      const cols = rows.map((r: any) => r.name);
      this.cachedColumns[tableName] = cols;
      return cols;
    } catch (err) {
      console.error(`Failed to get columns for table ${tableName}:`, err);
      return [];
    }
  }

  /**
   * Generates a schema-safe SELECT projection and filter parts for the players table.
   */
  async getPlayerQueryMeta() {
    const cols = await this.getTableColumns('players');

    // Choose dynamic name projection expression
    let nameExpr = 'p.name';
    if (cols.includes('name') && cols.includes('full_name')) {
      nameExpr = 'COALESCE(p.name, p.full_name)';
    } else if (cols.includes('full_name')) {
      nameExpr = 'p.full_name';
    } else if (cols.includes('name')) {
      nameExpr = 'p.name';
    } else {
      nameExpr = "''";
    }

    // Choose photo/avatar column
    let photoExpr = 'NULL';
    if (cols.includes('profile_photo') && cols.includes('avatar')) {
      photoExpr = 'COALESCE(p.profile_photo, p.avatar)';
    } else if (cols.includes('profile_photo')) {
      photoExpr = 'p.profile_photo';
    } else if (cols.includes('avatar')) {
      photoExpr = 'p.avatar';
    }

    // Choose preferred_team_id
    const teamIdExpr = cols.includes('preferred_team_id') ? 'p.preferred_team_id' : (cols.includes('team_id') ? 'p.team_id' : 'NULL');

    // Build filter expression list (for search)
    const filterFields: string[] = [];
    if (cols.includes('name')) filterFields.push('p.name LIKE ?');
    if (cols.includes('full_name')) filterFields.push('p.full_name LIKE ?');
    if (cols.includes('mobile')) filterFields.push('p.mobile LIKE ?');
    if (cols.includes('email')) filterFields.push('p.email LIKE ?');
    if (cols.includes('city')) filterFields.push('p.city LIKE ?');

    return {
      nameExpr,
      photoExpr,
      teamIdExpr,
      filterFields,
      columns: cols
    };
  }

  /**
   * Generates a schema-safe INSERT statement dynamically matching only columns existing in database.
   */
  async buildInsertSqlSchemaSafe(tableName: string, rowData: Record<string, any>): Promise<string> {
    const cols = await this.getTableColumns(tableName);
    const keys = Object.keys(rowData).filter(k => cols.includes(k));
    if (keys.length === 0) return '';

    const sqlVal = (val: any): string => {
      if (val === null || val === undefined) return 'NULL';
      if (typeof val === 'number') return val.toString();
      if (typeof val === 'boolean') return val ? '1' : '0';
      const escaped = val.toString().replace(/'/g, "''");
      return `'${escaped}'`;
    };

    const valuesStr = keys.map(k => sqlVal(rowData[k])).join(', ');
    return `INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${valuesStr});`;
  }

  // Database maintenance: VACUUM and ANALYZE/PRAGMA optimize
  async runDatabaseMaintenance() {
    try {
      console.log("[SQLite] Running database maintenance optimization...");
      await this.run("VACUUM;");
      await this.run("PRAGMA optimize;");
      console.log("[SQLite] Database maintenance completed successfully.");
    } catch (err) {
      console.error("[SQLite] Database maintenance failed:", err);
    }
  }
}

export const sqliteService = new SqliteService();
export type { SQLiteDBConnection };
