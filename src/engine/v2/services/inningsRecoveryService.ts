import { sqliteService } from '@/lib/services/sqliteService';
import { TransactionManager } from '../core/transactionManager';
import { SnapshotRepository } from '../repository';
import { SnapshotUpdater } from './snapshotUpdater';
import { StatsEngine } from './statsEngine';
import { InningsEngine } from './inningsEngine';

export class InningsRecoveryService {
  static async verifyInnings(matchId: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Load matches and innings info
    const matches: any = await sqliteService.query("SELECT * FROM v2_matches WHERE id = ?;", [matchId]);
    const match = matches.values?.[0] || matches[0];
    if (!match) {
      return { valid: false, errors: ["Match not found."] };
    }

    const inningsRows: any = await sqliteService.query("SELECT * FROM v2_innings WHERE match_id = ? ORDER BY innings_no ASC;", [matchId]);
    const inningsList = inningsRows.values || inningsRows;

    const snap = await SnapshotRepository.getSnapshot(matchId);
    if (!snap) {
      return { valid: false, errors: ["Match snapshot not found."] };
    }

    if (match.current_innings !== snap.inningsNo) {
      errors.push(`Match current innings ${match.current_innings} does not match snapshot innings ${snap.inningsNo}.`);
    }

    if (snap.inningsNo === 2) {
      const firstInnings = (inningsList as any[]).find((i: any) => i.innings_no === 1);
      if (firstInnings) {
        const expectedTarget = firstInnings.runs + 1;
        if (snap.target !== expectedTarget) {
          errors.push(`Target mismatch. Expected ${expectedTarget}, found ${snap.target}.`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  static async rebuildInnings(matchId: string, externalDb?: any): Promise<void> {
    const runRebuild = async (db: any) => {
      // 1. Fetch match metadata
      const matches = await db.query("SELECT * FROM v2_matches WHERE id = ?;", [matchId]);
      const match = matches.values?.[0] || matches[0];
      if (!match) {
        throw new Error("Match not found to rebuild innings.");
      }

      // 2. Clear innings & snapshots
      await db.run("DELETE FROM v2_innings WHERE match_id = ?;", [matchId]);
      await db.run("DELETE FROM v2_match_snapshots WHERE match_id = ?;", [matchId]);

      // 3. Reset match to innings 1
      await db.run(
        "UPDATE v2_matches SET current_innings = 1, status = 'live', result = NULL WHERE id = ?;",
        [matchId]
      );

      const teamAId = match.team_a_id;
      const teamBId = match.team_b_id;
      const firstBattingTeamId = match.batting_first_id ?? teamAId;
      const firstBowlingTeamId = firstBattingTeamId === teamAId ? teamBId : teamAId;

      // 4. Create initial first innings record
      await db.run(
        `INSERT OR IGNORE INTO v2_innings (id, match_id, innings_no, batting_team_id, bowling_team_id, runs, wickets, legal_balls, is_closed)
         VALUES (?, ?, 1, ?, ?, 0, 0, 0, 0);`,
        [`${matchId}_inn_1`, matchId, firstBattingTeamId, firstBowlingTeamId]
      );

      // 5. Fetch all ball events
      const rawBalls = await db.query(
        "SELECT * FROM v2_ball_events WHERE match_id = ? ORDER BY sequence_number ASC;",
        [matchId]
      );
      const balls = (rawBalls.values || rawBalls).map((r: any) => ({
        eventUuid: r.event_uuid,
        matchId: r.match_id,
        inningsNo: r.innings_no,
        overNo: r.over_no,
        ballNo: r.ball_no,
        strikerId: r.striker_id,
        nonStrikerId: r.non_striker_id,
        bowlerId: r.bowler_id,
        runsOffBat: r.runs_off_bat,
        extras: r.extras,
        extraType: r.extra_type,
        wicket: r.wicket === 1,
        wicketType: r.wicket_type,
        dismissedPlayerId: r.dismissed_player_id,
        timestamp: r.timestamp,
        deviceId: r.device_id,
        sequenceNumber: r.sequence_number,
        version: r.version,
        metadata: r.metadata
      }));

      // 6. Replay balls through snapshot, stats, and innings checking engines
      let snap = null;
      for (const b of balls) {
        snap = await SnapshotUpdater.update(db, matchId, b);
        await StatsEngine.rebuildAllStats(db, matchId);
        snap = await InningsEngine.checkInningsStatus(db, matchId, snap);
      }
    };

    if (externalDb) {
      return runRebuild(externalDb);
    }
    return TransactionManager.runInTransaction(runRebuild);
  }

  static async repairInnings(matchId: string): Promise<void> {
    const check = await this.verifyInnings(matchId);
    if (!check.valid) {
      console.warn(`Innings state invalid for match ${matchId}: ${check.errors.join(' ')}. Rebuilding...`);
      await this.rebuildInnings(matchId);
    }
  }
}
