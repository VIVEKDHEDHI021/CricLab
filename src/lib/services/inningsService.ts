import { sqliteService } from './sqliteService';

export type Innings = {
  id: string;
  match_id: string;
  innings_no: number;
  batting_team_id: string;
  bowling_team_id: string;
  runs: number;
  wickets: number;
  legal_balls: number;
  is_closed: boolean;
};

export const inningsService = {
  async startInnings(
    matchId: string,
    data: { batting_team_id: string; bowling_team_id: string; innings_no: number }
  ): Promise<Innings> {
    const inningsId = `${matchId}_inn_${data.innings_no}`;
    
    await sqliteService.executeTransaction(async (db) => {
      // 1. Check if the innings record is already seeded in v2_innings
      const existing = await db.query(
        "SELECT id FROM v2_innings WHERE match_id = ? AND innings_no = ?;",
        [matchId, data.innings_no]
      );

      if (existing.values && existing.values.length > 0) {
        await db.run(
          `UPDATE v2_innings 
           SET batting_team_id = ?, bowling_team_id = ?, is_closed = 0, runs = 0, wickets = 0, legal_balls = 0
           WHERE match_id = ? AND innings_no = ?;`,
          [data.batting_team_id, data.bowling_team_id, matchId, data.innings_no]
        );
      } else {
        await db.run(
          `INSERT INTO v2_innings (id, match_id, innings_no, batting_team_id, bowling_team_id, runs, wickets, legal_balls, is_closed)
           VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0);`,
          [inningsId, matchId, data.innings_no, data.batting_team_id, data.bowling_team_id]
        );
      }

      // 2. Update the parent match status to 'live' and current innings index in V2 matches
      await db.run(
        "UPDATE v2_matches SET status = 'live', current_innings = ? WHERE id = ?;",
        [data.innings_no, matchId]
      );

      // 3. Reset the match snapshot for the new innings (clearing current batter/bowler IDs)
      let target: number | null = null;
      if (data.innings_no === 2) {
        const firstInnRes = await db.query(
          "SELECT runs FROM v2_innings WHERE match_id = ? AND innings_no = 1;",
          [matchId]
        );
        if (firstInnRes.values && firstInnRes.values.length > 0) {
          target = (firstInnRes.values[0].runs ?? 0) + 1;
        }
      }

      const snapExists = await db.query(
        "SELECT match_id FROM v2_match_snapshots WHERE match_id = ?;",
        [matchId]
      );

      if (snapExists.values && snapExists.values.length > 0) {
        await db.run(
          `UPDATE v2_match_snapshots 
           SET innings_no = ?, team_score = 0, wickets = 0, overs = 0, balls = 0, legal_deliveries = 0, extras = 0,
               boundaries = 0, sixes = 0, current_batter_id = NULL, non_striker_id = NULL, current_bowler_id = NULL,
               partnership_runs = 0, partnership_balls = 0, current_over_no = 0, balls_remaining_in_over = 6,
               current_run_rate = 0.0, required_run_rate = NULL, target = ?, runs_required = ?,
               balls_remaining = ?, projected_score = 0, innings_status = 'active', match_status = 'live'
           WHERE match_id = ?;`,
          [data.innings_no, target, target, null, matchId]
        );
      } else {
        await db.run(
          `INSERT INTO v2_match_snapshots (
             match_id, innings_no, team_score, wickets, overs, balls, legal_deliveries, extras, boundaries, sixes,
             current_batter_id, non_striker_id, current_bowler_id, partnership_runs, partnership_balls,
             current_over_no, balls_remaining_in_over, current_run_rate, required_run_rate, target, runs_required,
             balls_remaining, projected_score, innings_status, match_status
           ) VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, NULL, 0, 0, 0, 6, 0.0, NULL, ?, ?, ?, 0, 'active', 'live');`,
          [matchId, data.innings_no, target, target, null]
        );
      }
    });

    const rows = await sqliteService.query("SELECT * FROM v2_innings WHERE id = ?;", [inningsId]);
    const i = rows[0];

    return {
      id: i.id,
      match_id: i.match_id,
      innings_no: i.innings_no,
      batting_team_id: i.batting_team_id,
      bowling_team_id: i.bowling_team_id,
      runs: i.runs,
      wickets: i.wickets,
      legal_balls: i.legal_balls,
      is_closed: i.is_closed === 1
    };
  },

  async closeInnings(id: string): Promise<void> {
    const innings = await sqliteService.query("SELECT * FROM v2_innings WHERE id = ?;", [id]);
    if (innings.length > 0) {
      const inn = innings[0];
      await sqliteService.run(
        "UPDATE v2_innings SET is_closed = 1 WHERE id = ?;",
        [id]
      );
      // Run stats recalculation for the match to update derived states
      await sqliteService.recalculateMatchStats(inn.match_id);
    }
  },
};
