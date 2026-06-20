import { sqliteService } from './sqliteService';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

export type MatchDetail = {
  m: any;
  teams: any[];
  innings: any[];
  players: any[];
  balls: any[];
};

export type BackupRegistryEntry = {
  matchId: string;
  date: string;
  teams: string;
  result: string;
  version: number;
  status: 'Exported' | 'Pending';
};

export const backupService = {
  async exportBackup(): Promise<any> {
    const matches = await sqliteService.query("SELECT * FROM v2_matches;");
    const teams = await sqliteService.query("SELECT * FROM teams;");
    const players = await sqliteService.query("SELECT * FROM players;");
    const innings = await sqliteService.query("SELECT * FROM v2_innings;");
    const balls = await sqliteService.query("SELECT * FROM v2_ball_events WHERE is_superseded = 0;");
    const snapshots = await sqliteService.query("SELECT * FROM v2_match_snapshots;");
    const playerStats = await sqliteService.query("SELECT * FROM v2_player_match_stats;");
    const bowlerStats = await sqliteService.query("SELECT * FROM v2_bowler_match_stats;");
    const fieldingStats = await sqliteService.query("SELECT * FROM v2_fielding_match_stats;");
    const partnerships = await sqliteService.query("SELECT * FROM v2_partnerships;");
    const awards = await sqliteService.query("SELECT * FROM v2_match_awards;");
    const milestones = await sqliteService.query("SELECT * FROM v2_milestone_events;");
    const auditLogs = await sqliteService.query("SELECT * FROM v2_audit_logs;");
    const matchSquads = await sqliteService.query("SELECT * FROM match_squads;");
    const appSettings = await sqliteService.query("SELECT * FROM app_settings;");
    const users = await sqliteService.query("SELECT id, name, username, mobile, role, must_change_password, is_profile_setup_completed, email FROM users;");

    return {
      version: 3, // V3 for V2 Offline Backup Schema
      generatedAt: new Date().toISOString(),
      matches,
      teams,
      players,
      innings,
      balls,
      snapshots,
      playerStats,
      bowlerStats,
      fieldingStats,
      partnerships,
      awards,
      milestones,
      auditLogs,
      matchSquads,
      appSettings,
      users
    };
  },

  async exportSingleMatchBackup(matchId: string): Promise<any> {
    const matches = await sqliteService.query("SELECT * FROM v2_matches WHERE id = ?;", [matchId]);
    const match = matches[0];
    if (!match) throw new Error("Match not found in local database.");

    const innings = await sqliteService.query("SELECT * FROM v2_innings WHERE match_id = ?;", [matchId]);
    const balls = await sqliteService.query("SELECT * FROM v2_ball_events WHERE match_id = ? AND is_superseded = 0;", [matchId]);
    const snapshots = await sqliteService.query("SELECT * FROM v2_match_snapshots WHERE match_id = ?;", [matchId]);
    const playerStats = await sqliteService.query("SELECT * FROM v2_player_match_stats WHERE match_id = ?;", [matchId]);
    const bowlerStats = await sqliteService.query("SELECT * FROM v2_bowler_match_stats WHERE match_id = ?;", [matchId]);
    const fieldingStats = await sqliteService.query("SELECT * FROM v2_fielding_match_stats WHERE match_id = ?;", [matchId]);
    const partnerships = await sqliteService.query("SELECT * FROM v2_partnerships WHERE match_id = ?;", [matchId]);
    const awards = await sqliteService.query("SELECT * FROM v2_match_awards WHERE match_id = ?;", [matchId]);
    const milestones = await sqliteService.query("SELECT * FROM v2_milestone_events WHERE match_id = ?;", [matchId]);
    const auditLogs = await sqliteService.query("SELECT * FROM v2_audit_logs WHERE match_id = ?;", [matchId]);

    // Query teams and players involved
    const teamIds = [match.team_a_id, match.team_b_id].filter(Boolean);
    let teams: any[] = [];
    if (teamIds.length > 0) {
      const placeHolders = teamIds.map(() => '?').join(',');
      teams = await sqliteService.query(`SELECT * FROM teams WHERE id IN (${placeHolders});`, teamIds);
    }

    // Query squads and players
    const matchSquads = await sqliteService.query("SELECT * FROM match_squads WHERE match_id = ?;", [matchId]);
    const playerIds = Array.from(new Set([
      ...matchSquads.map((s: any) => s.player_id),
      ...balls.map((b: any) => b.striker_id),
      ...balls.map((b: any) => b.non_striker_id),
      ...balls.map((b: any) => b.bowler_id),
      ...balls.map((b: any) => b.dismissed_player_id),
    ].filter(Boolean)));

    let players: any[] = [];
    if (playerIds.length > 0) {
      const placeHolders = playerIds.map(() => '?').join(',');
      players = await sqliteService.query(`SELECT * FROM players WHERE id IN (${placeHolders});`, playerIds);
    }

    return {
      version: 3,
      isSingleMatch: true,
      matchId,
      generatedAt: new Date().toISOString(),
      matches,
      teams,
      players,
      innings,
      balls,
      snapshots,
      playerStats,
      bowlerStats,
      fieldingStats,
      partnerships,
      awards,
      milestones,
      auditLogs,
      matchSquads
    };
  },

  generateSingleMatchBackupJSON(matchId: string, detail: any): any {
    return {
      version: 3,
      isSingleMatch: true,
      matchId,
      generatedAt: new Date().toISOString(),
      matches: detail.m ? [detail.m] : [],
      teams: detail.teams || [],
      players: detail.players || [],
      innings: detail.innings || [],
      balls: detail.balls || [],
      snapshots: detail.snapshots || [],
      playerStats: detail.playerStats || [],
      bowlerStats: detail.bowlerStats || [],
      fieldingStats: detail.fieldingStats || [],
      partnerships: detail.partnerships || [],
      awards: detail.awards ? [detail.awards] : [],
      milestones: detail.milestones || [],
      auditLogs: detail.auditLogs || [],
      matchSquads: detail.matchSquads || []
    };
  },

  markBackupPending(matchId: string, info: { date: string; teams: string; result: string; version: number }): void {
    const registry = this.getBackupRegistry();
    const existingIdx = registry.findIndex(e => e.matchId === matchId);
    const entry: BackupRegistryEntry = {
      matchId,
      date: info.date,
      teams: info.teams,
      result: info.result,
      version: info.version,
      status: 'Pending'
    };
    if (existingIdx > -1) {
      registry[existingIdx] = entry;
    } else {
      registry.push(entry);
    }
    localStorage.setItem('criclab_backup_registry', JSON.stringify(registry));
  },

  validateBackupJSON(data: any): { valid: boolean; error?: string } {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: "Backup file is not a valid JSON object" };
    }
    if (!Array.isArray(data.matches)) {
      return { valid: false, error: "Invalid backup: 'matches' must be an array" };
    }
    if (!Array.isArray(data.teams)) {
      return { valid: false, error: "Invalid backup: 'teams' must be an array" };
    }
    if (!Array.isArray(data.players)) {
      return { valid: false, error: "Invalid backup: 'players' must be an array" };
    }
    if (!Array.isArray(data.innings)) {
      return { valid: false, error: "Invalid backup: 'innings' must be an array" };
    }
    if (!Array.isArray(data.balls) && !Array.isArray(data.ball_events)) {
      return { valid: false, error: "Invalid backup: 'balls' or 'ball_events' must be an array" };
    }
    return { valid: true };
  },

  previewBackup(data: any): { matchCount: number; teamCount: number; playerCount: number; dateString: string } {
    const ballsList = data.balls || data.ball_events || [];
    return {
      matchCount: data.matches?.length || 0,
      teamCount: data.teams?.length || 0,
      playerCount: data.players?.length || 0,
      dateString: data.generatedAt ? new Date(data.generatedAt).toLocaleString() : 'Unknown Date'
    };
  },

  async importBackup(file: File, mode: 'merge' | 'replace' = 'merge'): Promise<{ status: string; message: string }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string;
          const data = JSON.parse(content);

          const validation = this.validateBackupJSON(data);
          if (!validation.valid) {
            throw new Error(validation.error);
          }

          await sqliteService.executeTransaction(async (db) => {
            if (mode === 'replace') {
              // Wipe out the database tables before restore
              const tablesToWipe = [
                'v2_matches', 'v2_innings', 'v2_ball_events', 'v2_match_snapshots',
                'v2_player_match_stats', 'v2_bowler_match_stats', 'v2_fielding_match_stats',
                'v2_partnerships', 'v2_match_awards', 'v2_milestone_events', 'v2_audit_logs',
                'teams', 'players', 'match_squads', 'app_settings'
              ];
              for (const tbl of tablesToWipe) {
                await db.run(`DELETE FROM ${tbl};`);
              }
              // Wipe non-admin users
              await db.run("DELETE FROM users WHERE username != 'admin';");
            }

            // 1. Restore Teams
            if (Array.isArray(data.teams)) {
              for (const t of data.teams) {
                await db.run(
                  `INSERT INTO teams (id, name, created_by, created_at, deleted_at)
                   VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET
                     name = excluded.name,
                     deleted_at = excluded.deleted_at;`,
                  [t.id, t.name, t.created_by, t.created_at, t.deleted_at]
                );
              }
            }

            // 2. Restore Players
            if (Array.isArray(data.players)) {
              const cols = await sqliteService.getTableColumns('players');
              for (const p of data.players) {
                const mappedRow: Record<string, any> = {
                  id: p.id,
                  name: p.name || p.full_name,
                  full_name: p.full_name || p.name,
                  mobile: p.mobile,
                  email: p.email,
                  dob: p.dob,
                  city: p.city,
                  state: p.state,
                  country: p.country,
                  profile_photo: p.profile_photo || p.avatar,
                  avatar: p.avatar || p.profile_photo,
                  bio: p.bio,
                  primary_role: p.primary_role || p.role,
                  role: p.role || p.primary_role,
                  batting_style: p.batting_style,
                  bowling_style: p.bowling_style,
                  bowling_type: p.bowling_type,
                  jersey_number: p.jersey_number,
                  preferred_team_id: p.preferred_team_id || p.team_id,
                  team_id: p.team_id || p.preferred_team_id,
                  catches: p.catches ?? 0,
                  run_outs: p.run_outs ?? 0,
                  age: p.age,
                  created_by: p.created_by,
                  created_at: p.created_at || new Date().toISOString(),
                  deleted_at: p.deleted_at
                };

                const activeKeys = Object.keys(mappedRow).filter(k => cols.includes(k));
                const updateFields = activeKeys
                  .filter(k => k !== 'id' && k !== 'created_at')
                  .map(k => `${k} = excluded.${k}`)
                  .join(', ');

                const placeholders = activeKeys.map(() => '?').join(', ');
                const values = activeKeys.map(k => mappedRow[k]);

                let sql = `INSERT INTO players (${activeKeys.join(', ')}) VALUES (${placeholders})`;
                if (updateFields) {
                  sql += ` ON CONFLICT(id) DO UPDATE SET ${updateFields}`;
                } else {
                  sql += ` ON CONFLICT(id) DO NOTHING`;
                }

                await db.run(sql, values);
              }
            }

            // 3. Restore Matches
            if (Array.isArray(data.matches)) {
              for (const m of data.matches) {
                await db.run(
                  `INSERT INTO v2_matches (id, team_a_id, team_b_id, overs, wide_run, noball_run, match_type, ground, match_date, status, result, batting_first_id, current_innings, last_man_batting, created_by)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET
                     status = excluded.status,
                     result = excluded.result,
                     current_innings = excluded.current_innings,
                     last_man_batting = excluded.last_man_batting;`,
                  [m.id, m.team_a_id, m.team_b_id, m.overs, m.wide_run, m.noball_run, m.match_type, m.ground, m.match_date, m.status, m.result, m.batting_first_id, m.current_innings, m.last_man_batting, m.created_by]
                );
              }
            }

            // 4. Restore Match Squads
            if (Array.isArray(data.matchSquads)) {
              for (const ms of data.matchSquads) {
                await db.run(
                  `INSERT INTO match_squads (id, match_id, player_id, team_id, display_name, role, jersey_number, captain, wicket_keeper, is_guest, nickname)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET
                     display_name = excluded.display_name,
                     role = excluded.role,
                     captain = excluded.captain,
                     wicket_keeper = excluded.wicket_keeper;`,
                  [ms.id, ms.match_id, ms.player_id, ms.team_id, ms.display_name, ms.role, ms.jersey_number, ms.captain, ms.wicket_keeper, ms.is_guest, ms.nickname]
                );
              }
            }

            // 5. Restore Innings
            if (Array.isArray(data.innings)) {
              for (const i of data.innings) {
                await db.run(
                  `INSERT INTO v2_innings (id, match_id, innings_no, batting_team_id, bowling_team_id, runs, wickets, legal_balls, is_closed)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET
                     runs = excluded.runs,
                     wickets = excluded.wickets,
                     legal_balls = excluded.legal_balls,
                     is_closed = excluded.is_closed;`,
                  [i.id, i.match_id, i.innings_no, i.batting_team_id, i.bowling_team_id, i.runs, i.wickets, i.legal_balls, i.is_closed]
                );
              }
            }

            // 6. Restore Ball Events
            const ballsList = data.balls || data.ball_events || [];
            for (const b of ballsList) {
              const eventUuid = b.eventUuid || b.event_uuid || b.id;
              const matchId = b.matchId || b.match_id;
              const inningsNo = b.inningsNo || b.innings_no;
              const overNo = b.overNo !== undefined ? b.overNo : (b.over_no !== undefined ? b.over_no : b.over_number);
              const ballNo = b.ballNo !== undefined ? b.ballNo : (b.ball_no !== undefined ? b.ball_no : b.ball_in_over);
              const strikerId = b.strikerId || b.striker_id || b.batter_id;
              const nonStrikerId = b.nonStrikerId || b.non_striker_id;
              const bowlerId = b.bowlerId || b.bowler_id;
              const runsOffBat = b.runsOffBat !== undefined ? b.runsOffBat : (b.runs_off_bat !== undefined ? b.runs_off_bat : b.runs);
              const extras = b.extras !== undefined ? b.extras : (b.extra_runs !== undefined ? b.extra_runs : 0);
              const extraType = b.extraType || b.extra_type || null;
              const wicket = (b.wicket !== undefined ? b.wicket : (b.is_wicket ? 1 : 0)) ? 1 : 0;
              const wicketType = b.wicketType || b.wicket_type || null;
              const dismissedPlayerId = b.dismissedPlayerId || b.dismissed_player_id || null;
              const timestamp = b.timestamp || b.device_timestamp || Date.now();
              const deviceId = b.deviceId || b.device_id || 'imported';
              const sequenceNumber = b.sequenceNumber !== undefined ? b.sequenceNumber : (b.sequence_number !== undefined ? b.sequence_number : 0);
              const version = b.version !== undefined ? b.version : 1;
              const metadataStr = b.metadata ? (typeof b.metadata === 'string' ? b.metadata : JSON.stringify(b.metadata)) : null;
              const supersededBy = b.supersededBy || b.superseded_by || null;
              const isSuperseded = (b.isSuperseded !== undefined ? b.isSuperseded : (b.is_superseded !== undefined ? b.is_superseded : 0)) ? 1 : 0;

              await db.run(
                `INSERT INTO v2_ball_events (
                   event_uuid, match_id, innings_no, over_no, ball_no, striker_id, non_striker_id, bowler_id,
                   runs_off_bat, extras, extra_type, wicket, wicket_type, dismissed_player_id, timestamp, device_id,
                   sequence_number, version, metadata, superseded_by, is_superseded
                 )
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(event_uuid) DO UPDATE SET
                   runs_off_bat = excluded.runs_off_bat,
                   extras = excluded.extras,
                   extra_type = excluded.extra_type,
                   wicket = excluded.wicket,
                   wicket_type = excluded.wicket_type,
                   dismissed_player_id = excluded.dismissed_player_id,
                   is_superseded = excluded.is_superseded;`,
                [
                  eventUuid, matchId, inningsNo, overNo, ballNo, strikerId, nonStrikerId, bowlerId,
                  runsOffBat, extras, extraType, wicket, wicketType, dismissedPlayerId, timestamp, deviceId,
                  sequenceNumber, version, metadataStr, supersededBy, isSuperseded
                ]
              );
            }

            // 7. Restore Match Snapshots
            if (Array.isArray(data.snapshots)) {
              for (const snap of data.snapshots) {
                await db.run(
                  `INSERT INTO v2_match_snapshots (
                     match_id, innings_no, team_score, wickets, overs, balls, legal_deliveries, extras, boundaries, sixes,
                     current_batter_id, non_striker_id, current_bowler_id, partnership_runs, partnership_balls,
                     current_over_no, balls_remaining_in_over, current_run_rate, required_run_rate, target, runs_required,
                     balls_remaining, projected_score, innings_status, match_status
                   )
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(match_id) DO UPDATE SET
                     team_score = excluded.team_score,
                     wickets = excluded.wickets,
                     overs = excluded.overs,
                     balls = excluded.balls,
                     legal_deliveries = excluded.legal_deliveries,
                     match_status = excluded.match_status,
                     updated_at = CURRENT_TIMESTAMP;`,
                  [
                    snap.matchId || snap.match_id,
                    snap.inningsNo || snap.innings_no,
                    snap.teamScore || snap.team_score,
                    snap.wickets,
                    snap.overs,
                    snap.balls,
                    snap.legalDeliveries || snap.legal_deliveries,
                    snap.extras,
                    snap.boundaries,
                    snap.sixes,
                    snap.currentBatterId || snap.current_batter_id,
                    snap.nonStrikerId || snap.non_striker_id,
                    snap.currentBowlerId || snap.current_bowler_id,
                    snap.partnershipRuns || snap.partnership_runs,
                    snap.partnershipBalls || snap.partnership_balls,
                    snap.currentOverNo || snap.current_over_no,
                    snap.ballsRemainingInOver || snap.balls_remaining_in_over,
                    snap.currentRunRate || snap.current_run_rate,
                    snap.requiredRunRate || snap.required_run_rate,
                    snap.target,
                    snap.runsRequired || snap.runs_required,
                    snap.ballsRemaining || snap.balls_remaining,
                    snap.projectedScore || snap.projected_score,
                    snap.inningsStatus || snap.innings_status,
                    snap.matchStatus || snap.match_status
                  ]
                );
              }
            }

            // 8. Restore Player Match Stats
            if (Array.isArray(data.playerStats)) {
              for (const s of data.playerStats) {
                await db.run(
                  `INSERT INTO v2_player_match_stats (
                     match_id, player_id, team_id, runs_scored, balls_faced, fours, sixes, strike_rate, is_out, dismissal_type, bowler_id, fielder_id
                   )
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(match_id, player_id) DO UPDATE SET
                     runs_scored = excluded.runs_scored,
                     balls_faced = excluded.balls_faced,
                     strike_rate = excluded.strike_rate,
                     is_out = excluded.is_out;`,
                  [s.match_id || s.matchId, s.player_id || s.playerId, s.team_id || s.teamId, s.runs_scored, s.balls_faced, s.fours, s.sixes, s.strike_rate, s.is_out ? 1 : 0, s.dismissal_type, s.bowler_id, s.fielder_id]
                );
              }
            }

            // 9. Restore Bowler Match Stats
            if (Array.isArray(data.bowlerStats)) {
              for (const s of data.bowlerStats) {
                await db.run(
                  `INSERT INTO v2_bowler_match_stats (
                     match_id, player_id, team_id, legal_balls, runs_conceded, wickets, maidens, economy, overs, strike_rate
                   )
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(match_id, player_id) DO UPDATE SET
                     legal_balls = excluded.legal_balls,
                     runs_conceded = excluded.runs_conceded,
                     wickets = excluded.wickets,
                     maidens = excluded.maidens,
                     economy = excluded.economy;`,
                  [s.match_id || s.matchId, s.player_id || s.playerId, s.team_id || s.teamId, s.legal_balls, s.runs_conceded, s.wickets, s.maidens, s.economy, s.overs, s.strike_rate]
                );
              }
            }

            // 10. Restore Fielding Match Stats
            if (Array.isArray(data.fieldingStats)) {
              for (const s of data.fieldingStats) {
                await db.run(
                  `INSERT INTO v2_fielding_match_stats (
                     match_id, player_id, team_id, catches, run_outs, stumpings, direct_hits, assists
                   )
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(match_id, player_id) DO UPDATE SET
                     catches = excluded.catches,
                     run_outs = excluded.run_outs,
                     stumpings = excluded.stumpings;`,
                  [s.match_id || s.matchId, s.player_id || s.playerId, s.team_id || s.teamId, s.catches, s.run_outs, s.stumpings, s.direct_hits, s.assists]
                );
              }
            }

            // 11. Restore Partnerships
            if (Array.isArray(data.partnerships)) {
              for (const p of data.partnerships) {
                await db.run(
                  `INSERT INTO v2_partnerships (id, match_id, innings_no, batsman1_id, batsman2_id, runs, balls, active)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET
                     runs = excluded.runs,
                     balls = excluded.balls,
                     active = excluded.active;`,
                  [p.id, p.match_id || p.matchId, p.innings_no || p.inningsNo, p.batsman1_id, p.batsman2_id, p.runs, p.balls, p.active]
                );
              }
            }

            // 12. Restore Match Awards
            if (Array.isArray(data.awards)) {
              for (const a of data.awards) {
                await db.run(
                  `INSERT INTO v2_match_awards (match_id, player_of_match, best_batter, best_bowler, best_partnership, most_sixes_player, most_fours_player, best_economy_player)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(match_id) DO UPDATE SET
                     player_of_match = excluded.player_of_match,
                     best_batter = excluded.best_batter,
                     best_bowler = excluded.best_bowler;`,
                  [a.match_id || a.matchId, a.player_of_match || a.playerOfMatch, a.best_batter || a.bestBatter, a.best_bowler || a.bestBowler, a.best_partnership, a.most_sixes_player, a.most_fours_player, a.best_economy_player]
                );
              }
            }

            // 13. Restore Milestone Events
            if (Array.isArray(data.milestones)) {
              for (const m of data.milestones) {
                await db.run(
                  `INSERT INTO v2_milestone_events (id, match_id, innings_no, player_id, milestone_type, value, timestamp)
                   VALUES (?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET
                     value = excluded.value;`,
                  [m.id, m.match_id || m.matchId, m.innings_no || m.inningsNo, m.player_id || m.playerId, m.milestone_type, m.value, m.timestamp]
                );
              }
            }

            // 14. Restore Audit Logs
            if (Array.isArray(data.auditLogs)) {
              for (const l of data.auditLogs) {
                await db.run(
                  `INSERT INTO v2_audit_logs (id, match_id, action, payload, timestamp)
                   VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO NOTHING;`,
                  [l.id, l.match_id || l.matchId, l.action, l.payload, l.timestamp]
                );
              }
            }

            // 15. Restore App Settings
            if (Array.isArray(data.appSettings)) {
              for (const s of data.appSettings) {
                await db.run(
                  `INSERT INTO app_settings (key, value)
                   VALUES (?, ?)
                   ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
                  [s.key, s.value]
                );
              }
            }

            // 16. Restore Users (Merge without destructive overwrite)
            if (Array.isArray(data.users)) {
              for (const u of data.users) {
                await db.run(
                  `INSERT INTO users (id, name, username, mobile, role, must_change_password, is_profile_setup_completed, email)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET
                     name = excluded.name,
                     role = excluded.role,
                     email = excluded.email;`,
                  [u.id, u.name, u.username, u.mobile, u.role, u.must_change_password, u.is_profile_setup_completed, u.email]
                );
              }
            }
          }, 120000);

          // Recalculate stats for all matches imported
          for (const m of data.matches) {
            await sqliteService.recalculateMatchStats(m.id);
          }

          resolve({ status: "success", message: `Data restored successfully in ${mode} mode.` });
        } catch (e: any) {
          reject(new Error(e.message || "Failed to parse or restore backup file"));
        }
      };
      reader.onerror = () => reject(new Error("File read error"));
      reader.readAsText(file);
    });
  },

  async saveBackupFileToFilesystem(filename: string, data: any): Promise<boolean> {
    const jsonStr = JSON.stringify(data, null, 2);
    if (Capacitor.isNativePlatform()) {
      try {
        // Ensure CricLab/Backups folder exists
        try {
          await Filesystem.mkdir({
            path: 'CricLab/Backups',
            directory: Directory.Documents,
            recursive: true
          });
        } catch (e) {
          // Ignore error if it exists
        }

        await Filesystem.writeFile({
          path: `CricLab/Backups/${filename}`,
          data: jsonStr,
          directory: Directory.Documents,
          encoding: Encoding.UTF8
        });
        return true;
      } catch (e: any) {
        console.error("[backupService] Capacitor Write Failed:", e);
        throw new Error(`Device storage failed: ${e.message}`);
      }
    } else {
      this.downloadBackupFile(filename, data);
      return true;
    }
  },

  downloadBackupFile(filename: string, data: any): void {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  getBackupRegistry(): BackupRegistryEntry[] {
    const raw = localStorage.getItem('criclab_backup_registry');
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch (e) {
      return [];
    }
  },

  saveLocalBackup(matchId: string, data: any): void {
    localStorage.setItem(`criclab_backup_data_${matchId}`, JSON.stringify(data));
    const registry = this.getBackupRegistry();
    const existingIdx = registry.findIndex(e => e.matchId === matchId);
    
    const match = data.matches[0];
    if (!match) return;
    const teamA = data.teams.find((t: any) => t.id === match.team_a_id)?.name || 'Team A';
    const teamB = data.teams.find((t: any) => t.id === match.team_b_id)?.name || 'Team B';
    const dateStr = new Date(match.match_date).toISOString().split('T')[0];
    const version = data.version || 1;

    const entry: BackupRegistryEntry = {
      matchId,
      date: dateStr,
      teams: `${teamA} vs ${teamB}`,
      result: match.result || 'Match Completed',
      version,
      status: 'Exported'
    };

    if (existingIdx > -1) {
      registry[existingIdx] = entry;
    } else {
      registry.push(entry);
    }

    localStorage.setItem('criclab_backup_registry', JSON.stringify(registry));
  },

  deleteLocalBackup(matchId: string): void {
    localStorage.removeItem(`criclab_backup_data_${matchId}`);
    const registry = this.getBackupRegistry();
    const entry = registry.find(e => e.matchId === matchId);
    if (entry) {
      entry.status = 'Pending';
      localStorage.setItem('criclab_backup_registry', JSON.stringify(registry));
    }
  },

  getLocalBackup(matchId: string): any | null {
    const raw = localStorage.getItem(`criclab_backup_data_${matchId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  },

  async cleanDatabase(): Promise<void> {
    await sqliteService.executeTransaction(async (db) => {
      const tables = [
        'v2_matches', 'v2_innings', 'v2_ball_events', 'v2_match_snapshots',
        'v2_player_match_stats', 'v2_bowler_match_stats', 'v2_fielding_match_stats',
        'v2_partnerships', 'v2_match_awards', 'v2_milestone_events', 'v2_audit_logs',
        'teams', 'players', 'match_squads', 'app_settings'
      ];
      for (const tbl of tables) {
        await db.run(`DELETE FROM ${tbl};`);
      }
      await db.run("DELETE FROM users WHERE username != 'admin';");
    }, 60000);
    localStorage.removeItem('criclab_backup_registry');
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('criclab_backup_data_') || key.startsWith('criclab_match_cache_'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  }
};
