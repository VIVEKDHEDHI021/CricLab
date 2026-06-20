import { sqliteService } from '@/lib/services/sqliteService';
import { MatchSnapshotV2 } from '../models/matchSnapshot';
import { BallRepository, SnapshotRepository } from '../repository';
import { SnapshotValidator } from '../validators/snapshotValidator';
import { SnapshotUpdater } from './snapshotUpdater';
import { TransactionManager } from '../core/transactionManager';
import { EngineLogger } from '../utils/logger';

export class SnapshotRecoveryService {
  static async verifySnapshot(matchId: string): Promise<{ valid: boolean; errors: string[] }> {
    const snap = await SnapshotRepository.getSnapshot(matchId);
    if (!snap) {
      return { valid: false, errors: ["Snapshot does not exist."] };
    }
    const balls = await BallRepository.getBallsForMatch(matchId);
    return SnapshotValidator.validate(snap, balls);
  }

  static async rebuildSnapshot(matchId: string, externalDb?: any): Promise<MatchSnapshotV2> {
    const runRebuild = async (db: any) => {
      // 1. Fetch match metadata
      const matches = await db.query("SELECT * FROM v2_matches WHERE id = ?;", [matchId]);
      const match = matches.values?.[0] || matches[0];
      if (!match) {
        throw new Error("Match not found to rebuild snapshot.");
      }

      // 2. Clear current snapshot
      await db.run("DELETE FROM v2_match_snapshots WHERE match_id = ?;", [matchId]);

      // 3. Fetch all balls
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
        version: r.version
      }));

      // 4. Replay balls one by one using SnapshotUpdater
      let snap: MatchSnapshotV2 | null = null;
      for (const b of balls) {
        snap = await SnapshotUpdater.update(db, matchId, b);
      }

      if (!snap) {
        // If there were no balls, create initial snapshot
        snap = {
          matchId,
          inningsNo: match.current_innings ?? 1,
          teamScore: 0,
          wickets: 0,
          overs: 0,
          balls: 0,
          legalDeliveries: 0,
          extras: 0,
          boundaries: 0,
          sixes: 0,
          currentBatterId: null,
          nonStrikerId: null,
          currentBowlerId: null,
          partnershipRuns: 0,
          partnershipBalls: 0,
          currentOverNo: 0,
          ballsRemainingInOver: 6,
          currentRunRate: 0,
          requiredRunRate: null,
          target: null,
          runsRequired: null,
          ballsRemaining: (match.overs ?? 6) * 6,
          projectedScore: 0,
          inningsStatus: 'active',
          matchStatus: match.status || 'live'
        };
        await SnapshotRepository.saveSnapshot(snap, db);
      }

      await EngineLogger.log(matchId, 'Snapshot Rebuilt', { ballCount: balls.length }, db);
      return snap;
    };

    if (externalDb) {
      return runRebuild(externalDb);
    }
    return TransactionManager.runInTransaction(runRebuild);
  }

  static async repairSnapshot(matchId: string): Promise<MatchSnapshotV2 | null> {
    const check = await this.verifySnapshot(matchId);
    if (!check.valid) {
      console.warn(`Snapshot invalid for match ${matchId}: ${check.errors.join(' ')}. Rebuilding...`);
      return this.rebuildSnapshot(matchId);
    }
    return SnapshotRepository.getSnapshot(matchId);
  }
}
