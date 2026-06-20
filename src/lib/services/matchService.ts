import { sqliteService } from './sqliteService';
import { v4 as uuidv4 } from 'uuid';
import type { MatchSummary } from '@/components/MatchCard';
import { buildLocalMatchSummary } from './matchSummaryService';
import api from '../api';

export type MatchDetail = {
  m: any;
  teams: any[];
  innings: any[];
  players: any[];
  balls: any[];
  snapshot?: any;
  playerStats?: any[];
  bowlerStats?: any[];
  fieldingStats?: any[];
  matchAwards?: any;
  partnerships?: any[];
};

export type MatchSquadPlayer = {
  player_id: string;
  display_name: string;
  role?: string | null;
  jersey_number?: string | null;
  captain?: boolean;
  wicket_keeper?: boolean;
  is_guest?: boolean;
  nickname?: string | null;
};

export const matchService = {
  async getMatches(): Promise<MatchSummary[]> {
    const rows = await sqliteService.query(
      `SELECT m.*, 
              ta.name as team_a_name, 
              tb.name as team_b_name
       FROM v2_matches m
       JOIN teams ta ON m.team_a_id = ta.id
       JOIN teams tb ON m.team_b_id = tb.id
       ORDER BY m.match_date DESC;`
    );

    const summaries: MatchSummary[] = [];
    for (const r of rows) {
      summaries.push(await buildLocalMatchSummary(r));
    }
    return summaries;
  },

  async getMatch(id: string): Promise<MatchDetail> {
    const matches = await sqliteService.query("SELECT * FROM v2_matches WHERE id = ?;", [id]);
    if (matches.length === 0) {
      throw new Error("Match not found");
    }
    const match = matches[0];

    const teams = await sqliteService.query(
      "SELECT * FROM teams WHERE id IN (?, ?);",
      [match.team_a_id, match.team_b_id]
    );

    const innings = await sqliteService.query(
      "SELECT * FROM v2_innings WHERE match_id = ? ORDER BY innings_no ASC;",
      [id]
    );

    const meta = await sqliteService.getPlayerQueryMeta();
    const squadRows = await sqliteService.query(
      `SELECT ms.*, ${meta.photoExpr} as avatar
       FROM match_squads ms
       LEFT JOIN players p ON ms.player_id = p.id
       WHERE ms.match_id = ?;`,
      [id]
    );

    const players = squadRows.map(r => ({
      id: r.player_id,
      name: r.display_name,
      team_id: r.team_id,
      role: r.role,
      jersey_number: r.jersey_number,
      captain: r.captain === 1,
      wicket_keeper: r.wicket_keeper === 1,
      is_guest: r.is_guest === 1,
      nickname: r.nickname,
      avatar: r.avatar || null
    }));

    const ballRows = await sqliteService.query(
      "SELECT * FROM v2_ball_events WHERE match_id = ? AND is_superseded = 0 ORDER BY sequence_number ASC;",
      [id]
    );

    const balls = ballRows.map(r => {
      const meta = r.metadata ? JSON.parse(r.metadata) : {};
      const inn = innings.find(i => Number(i.innings_no) === Number(r.innings_no));
      return {
        id: r.event_uuid,
        innings_id: inn ? inn.id : `${id}_inn_${r.innings_no}`,
        innings_no: r.innings_no,
        match_id: r.match_id,
        ball_index: r.sequence_number,
        over_number: r.over_no,
        ball_in_over: r.ball_no,
        batter_id: r.striker_id,
        non_striker_id: r.non_striker_id,
        bowler_id: r.bowler_id,
        runs: r.runs_off_bat,
        extra_runs: r.extras,
        extra_type: r.extra_type,
        is_wicket: r.wicket === 1,
        wicket_type: r.wicket_type,
        is_legal: r.extra_type !== 'wide' && r.extra_type !== 'no_ball',
        caught_by_id: meta.caught_by_id || null,
        created_at: new Date(r.timestamp).toISOString()
      };
    });

    const snapshots = await sqliteService.query(
      "SELECT * FROM v2_match_snapshots WHERE match_id = ?;",
      [id]
    );
    const snapshot = snapshots[0] || null;

    const playerStats = await sqliteService.query(
      "SELECT * FROM v2_player_match_stats WHERE match_id = ?;",
      [id]
    );
    const bowlerStats = await sqliteService.query(
      "SELECT * FROM v2_bowler_match_stats WHERE match_id = ?;",
      [id]
    );
    const fieldingStats = await sqliteService.query(
      "SELECT * FROM v2_fielding_match_stats WHERE match_id = ?;",
      [id]
    );
    const matchAwards = await sqliteService.query(
      "SELECT * FROM v2_match_awards WHERE match_id = ?;",
      [id]
    );
    const partnerships = await sqliteService.query(
      "SELECT * FROM v2_partnerships WHERE match_id = ?;",
      [id]
    );

    // Keep legacy field compatibility for UI while returning extra pre-calculated V2 data
    const squadA = players.filter(p => p.team_id === match.team_a_id).map(p => p.id);
    const squadB = players.filter(p => p.team_id === match.team_b_id).map(p => p.id);

    return {
      m: {
        id: match.id,
        team_a_id: match.team_a_id,
        team_b_id: match.team_b_id,
        overs: match.overs,
        wide_run: match.wide_run,
        noball_run: match.noball_run,
        match_type: match.match_type,
        ground: match.ground,
        match_date: match.match_date,
        status: match.status,
        result: match.result,
        batting_first_id: match.batting_first_id,
        current_innings: match.current_innings,
        last_man_batting: match.last_man_batting === 1,
        squad_a_ids: squadA,
        squad_b_ids: squadB,
        man_of_the_match_id: matchAwards[0]?.player_of_match || match.man_of_the_match_id,
        created_by: match.created_by,
        created_at: match.created_at
      },
      teams,
      innings: innings.map(i => ({
        id: i.id,
        match_id: i.match_id,
        innings_no: i.innings_no,
        batting_team_id: i.batting_team_id,
        bowling_team_id: i.bowling_team_id,
        runs: i.runs,
        wickets: i.wickets,
        legal_balls: i.legal_balls,
        is_closed: i.is_closed === 1
      })),
      players,
      balls,
      snapshot,
      playerStats,
      bowlerStats,
      fieldingStats,
      matchAwards: matchAwards[0] || null,
      partnerships
    };
  },

  async createMatch(matchData: {
    team_a_id: string;
    team_b_id: string;
    overs: number;
    wide_run: number;
    noball_run: number;
    match_type: string;
    ground: string;
    match_date: string;
    last_man_batting?: boolean;
    batting_first_id?: string;
    squad_a_ids?: string[];
    squad_b_ids?: string[];
  }): Promise<{ id: string }> {
    const id = uuidv4();
    const matchDate = new Date(matchData.match_date).toISOString();
    const battingFirstId = matchData.batting_first_id || matchData.team_a_id;
    const bowlingFirstId = battingFirstId === matchData.team_a_id ? matchData.team_b_id : matchData.team_a_id;

    await sqliteService.executeTransaction(async (db) => {
      // 1a. Insert legacy match record (to satisfy foreign key constraint of match_squads)
      await db.run(
        `INSERT INTO matches (id, team_a_id, team_b_id, overs, wide_run, noball_run, match_type, ground, match_date, status, result, batting_first_id, current_innings, last_man_batting, squad_a_ids, squad_b_ids, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          id,
          matchData.team_a_id,
          matchData.team_b_id,
          matchData.overs,
          matchData.wide_run,
          matchData.noball_run,
          matchData.match_type,
          matchData.ground,
          matchDate,
          'live',
          null,
          battingFirstId,
          1,
          matchData.last_man_batting ? 1 : 0,
          matchData.squad_a_ids ? JSON.stringify(matchData.squad_a_ids) : null,
          matchData.squad_b_ids ? JSON.stringify(matchData.squad_b_ids) : null,
          null
        ]
      );

      // 1b. Insert CricEngine V2 match record
      await db.run(
        `INSERT INTO v2_matches (id, team_a_id, team_b_id, overs, wide_run, noball_run, match_type, ground, match_date, status, result, batting_first_id, current_innings, last_man_batting, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          id,
          matchData.team_a_id,
          matchData.team_b_id,
          matchData.overs,
          matchData.wide_run,
          matchData.noball_run,
          matchData.match_type,
          matchData.ground,
          matchDate,
          'live',
          null,
          battingFirstId,
          1,
          matchData.last_man_batting ? 1 : 0,
          null
        ]
      );

      // 2. Insert CricEngine V2 innings records
      await db.run(
        `INSERT INTO v2_innings (id, match_id, innings_no, batting_team_id, bowling_team_id, runs, wickets, legal_balls, is_closed)
         VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0);`,
        [`${id}_v2_inn_1`, id, 1, battingFirstId, bowlingFirstId]
      );

      await db.run(
        `INSERT INTO v2_innings (id, match_id, innings_no, batting_team_id, bowling_team_id, runs, wickets, legal_balls, is_closed)
         VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0);`,
        [`${id}_v2_inn_2`, id, 2, bowlingFirstId, battingFirstId]
      );

      // 5. Seed match squads
      if (matchData.squad_a_ids) {
        for (const pid of matchData.squad_a_ids) {
          const nameRow = await db.query("SELECT name FROM players WHERE id = ?;", [pid]);
          const displayName = nameRow.values?.[0]?.name || nameRow[0]?.name || 'Player';
          await db.run(
            `INSERT INTO match_squads (id, match_id, player_id, team_id, display_name, is_guest)
             VALUES (?, ?, ?, ?, ?, 0);`,
            [uuidv4(), id, pid, matchData.team_a_id, displayName]
          );
        }
      }

      if (matchData.squad_b_ids) {
        for (const pid of matchData.squad_b_ids) {
          const nameRow = await db.query("SELECT name FROM players WHERE id = ?;", [pid]);
          const displayName = nameRow.values?.[0]?.name || nameRow[0]?.name || 'Player';
          await db.run(
            `INSERT INTO match_squads (id, match_id, player_id, team_id, display_name, is_guest)
             VALUES (?, ?, ?, ?, ?, 0);`,
            [uuidv4(), id, pid, matchData.team_b_id, displayName]
          );
        }
      }
    });

    // 6. Initialize CricEngine V2 snapshot
    const { SnapshotRecoveryService } = await import('../../engine/v2/services/snapshotRecoveryService');
    await SnapshotRecoveryService.rebuildSnapshot(id);

    return { id };
  },

  async deleteMatch(id: string): Promise<void> {
    await sqliteService.executeTransaction(async (db) => {
      await db.run("DELETE FROM matches WHERE id = ?;", [id]);
      await db.run("DELETE FROM v2_matches WHERE id = ?;", [id]);
    });
  },

  async endMatch(id: string): Promise<{ result: string }> {
    const { MatchCompletionEngine } = await import('../../engine/v2/services/matchCompletionEngine');
    await sqliteService.executeTransaction(async (db) => {
      await MatchCompletionEngine.completeMatch(db, id);
    });
    const m = await sqliteService.query("SELECT result FROM v2_matches WHERE id = ?;", [id]);
    return { result: m[0]?.result || 'Match Ended' };
  },

  async updateMatch(
    id: string,
    matchData: {
      man_of_the_match_id?: string | null;
      result?: string;
      ground?: string;
      match_type?: string;
      overs?: number;
      status?: string;
    }
  ): Promise<any> {
    if (matchData.man_of_the_match_id !== undefined) {
      await sqliteService.run(
        `INSERT INTO v2_match_awards (match_id, player_of_match)
         VALUES (?, ?)
         ON CONFLICT(match_id) DO UPDATE SET player_of_match = excluded.player_of_match;`,
        [id, matchData.man_of_the_match_id]
      );
    }

    await sqliteService.run(
      `UPDATE v2_matches
       SET status = COALESCE(?, status),
           result = COALESCE(?, result),
           ground = COALESCE(?, ground),
           match_type = COALESCE(?, match_type),
           overs = COALESCE(?, overs)
       WHERE id = ?;`,
      [
        matchData.status !== undefined ? matchData.status : null,
        matchData.result !== undefined ? matchData.result : null,
        matchData.ground || null,
        matchData.match_type || null,
        matchData.overs || null,
        id
      ]
    );

    const { MatchRecoveryService } = await import('../../engine/v2/services/matchRecoveryService');
    await MatchRecoveryService.rebuildFinalSnapshot(id);
    return { message: "Match updated successfully" };
  },

  async replacePlayer(
    matchId: string,
    oldPlayerId: string,
    newPlayerId: string
  ): Promise<any> {
    const matches = await sqliteService.query("SELECT status FROM v2_matches WHERE id = ?;", [matchId]);
    if (matches.length > 0 && matches[0].status !== 'upcoming') {
      throw new Error("Match squad is locked because scoring has already started.");
    }

    await sqliteService.executeTransaction(async (db) => {
      // 1. Get the team_id of old player in match
      const squad = await db.query(
        "SELECT team_id, is_guest FROM match_squads WHERE match_id = ? AND player_id = ?;",
        [matchId, oldPlayerId]
      );
      if (squad.values && squad.values.length > 0) {
        const teamId = squad.values[0].team_id;
        
        // 2. Fetch new player name
        const nameRow = await db.query("SELECT name FROM players WHERE id = ?;", [newPlayerId]);
        const newName = nameRow.values?.[0]?.name || 'Player';

        // 3. Remove old player squad entry
        await db.run("DELETE FROM match_squads WHERE match_id = ? AND player_id = ?;", [matchId, oldPlayerId]);

        // 4. Insert new player squad entry
        await db.run(
          `INSERT INTO match_squads (id, match_id, player_id, team_id, display_name, is_guest)
           VALUES (?, ?, ?, ?, ?, 0);`,
          [uuidv4(), matchId, newPlayerId, teamId, newName]
        );
      }
    });

    return { message: "Player replaced successfully" };
  },

  async updateSquad(
    id: string,
    squadA: MatchSquadPlayer[],
    squadB: MatchSquadPlayer[]
  ): Promise<{ message: string }> {
    const matches = await sqliteService.query("SELECT status FROM v2_matches WHERE id = ?;", [id]);
    if (matches.length > 0 && matches[0].status !== 'upcoming') {
      throw new Error("Match squad is locked because scoring has already started.");
    }

    await sqliteService.executeTransaction(async (db) => {
      // 1. Delete previous squad records
      await db.run("DELETE FROM match_squads WHERE match_id = ?;", [id]);

      const matchRow = await db.query("SELECT team_a_id, team_b_id FROM v2_matches WHERE id = ?;", [id]);
      const teamAId = matchRow.values?.[0]?.team_a_id;
      const teamBId = matchRow.values?.[0]?.team_b_id;

      // 2. Insert Team A Squad
      for (const p of squadA) {
        await db.run(
          `INSERT INTO match_squads (id, match_id, player_id, team_id, display_name, role, jersey_number, captain, wicket_keeper, is_guest, nickname)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            uuidv4(),
            id,
            p.player_id,
            teamAId,
            p.display_name,
            p.role || null,
            p.jersey_number || null,
            p.captain ? 1 : 0,
            p.wicket_keeper ? 1 : 0,
            p.is_guest ? 1 : 0,
            p.nickname || null
          ]
        );
      }

      // 3. Insert Team B Squad
      for (const p of squadB) {
        await db.run(
          `INSERT INTO match_squads (id, match_id, player_id, team_id, display_name, role, jersey_number, captain, wicket_keeper, is_guest, nickname)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            uuidv4(),
            id,
            p.player_id,
            teamBId,
            p.display_name,
            p.role || null,
            p.jersey_number || null,
            p.captain ? 1 : 0,
            p.wicket_keeper ? 1 : 0,
            p.is_guest ? 1 : 0,
            p.nickname || null
          ]
        );
      }
    });

    return { message: "Squads updated successfully" };
  },

  async syncAuditLogs(matchId: string, logs: any[]): Promise<void> {
    // Mapped locally – no operations needed in local SQLite app
  },

  async getAuditLogs(matchId: string): Promise<any[]> {
    const logs = await sqliteService.query(
      "SELECT * FROM v2_audit_logs WHERE match_id = ? ORDER BY timestamp DESC;",
      [matchId]
    );
    return logs.map(l => {
      let desc = l.action;
      try {
        if (l.payload) {
          const p = typeof l.payload === 'string' ? JSON.parse(l.payload) : l.payload;
          if (l.action === 'Ball Added') {
            desc = `Ball Added: Sequence ${p.sequenceNumber}`;
          } else if (l.action === 'Ball Corrected') {
            desc = `Ball Corrected: Sequence ${p.sequenceNumber}`;
          } else if (l.action === 'Ball Deleted') {
            desc = `Ball Deleted: Event ${p.eventUuid}`;
          } else if (l.action === 'Ball Undone') {
            desc = `Ball Undone: Event ${p.eventUuid}`;
          } else {
            desc = `${l.action}: ${JSON.stringify(p)}`;
          }
        }
      } catch (e) {}

      return {
        id: l.id,
        match_id: l.match_id,
        action_type: l.action,
        description: desc,
        device_timestamp: l.timestamp
      };
    });
  },

  // Added service method for Guest Player Conversion
  async convertGuestPlayer(matchId: string, playerId: string, teamId: string): Promise<void> {
    const guests = await sqliteService.query(
      "SELECT display_name, role, jersey_number FROM match_squads WHERE match_id = ? AND player_id = ? AND is_guest = 1;",
      [matchId, playerId]
    );
    if (guests.length === 0) {
      throw new Error("Guest player not found in match squads");
    }
    const g = guests[0];

    await sqliteService.executeTransaction(async (db) => {
      // 1. Insert into global players table with the SAME ID
      const cols = await sqliteService.getTableColumns('players');
      const insertCols: string[] = ['id', 'name', 'created_at'];
      const insertVals: any[] = [playerId, g.display_name, new Date().toISOString()];
      const placeHolders: string[] = ['?', '?', '?'];

      const addFieldIfExist = (colName: string, value: any) => {
        if (cols.includes(colName)) {
          insertCols.push(colName);
          insertVals.push(value);
          placeHolders.push('?');
        }
      };

      addFieldIfExist('preferred_team_id', teamId);
      addFieldIfExist('team_id', teamId);
      addFieldIfExist('primary_role', g.role || 'Player');
      addFieldIfExist('role', g.role || 'Player');
      addFieldIfExist('jersey_number', g.jersey_number || '');

      await db.run(
        `INSERT INTO players (${insertCols.join(', ')})
         VALUES (${placeHolders.join(', ')});`,
        insertVals
      );

      // 2. Set is_guest = 0 in match_squads table
      await db.run(
        "UPDATE match_squads SET is_guest = 0 WHERE match_id = ? AND player_id = ?;",
        [matchId, playerId]
      );
    });
  },

  async uploadMatchToServer(matchId: string): Promise<void> {
    try {
      const detail = await this.getMatch(matchId);
      if (!detail || !detail.m) {
        throw new Error("Match details not found in local SQLite database.");
      }

      // Convert V2 database fields into standard backup structure
      const backupData = {
        teams: detail.teams || [],
        players: detail.players || [],
        matches: [detail.m],
        innings: detail.innings || [],
        balls: detail.balls || []
      };

      const jsonStr = JSON.stringify(backupData);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const formData = new FormData();
      formData.append("backup_file", blob, `match_upload_${matchId}.json`);

      const response = await api.post("/backup/import", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      if (response.data?.status !== "success") {
        throw new Error(response.data?.message || "Server did not return success status.");
      }
    } catch (err: any) {
      console.error("[MatchService] Failed to upload match to server:", err);
      throw new Error(err.response?.data?.message || err.message || "Failed to upload match to server.");
    }
  }
};
