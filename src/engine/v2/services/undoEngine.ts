import { sqliteService } from '@/lib/services/sqliteService';
import { TransactionManager } from '../core/transactionManager';
import { BallRepository, SnapshotRepository } from '../repository';
import { SnapshotRecoveryService } from './snapshotRecoveryService';
import { InningsRecoveryService } from './inningsRecoveryService';
import { StatsEngine } from './statsEngine';
import { eventBus } from '../events/eventBus';
import { EngineLogger } from '../utils/logger';
import { BallEventV2 } from '../models/ballEvent';

export class UndoEngine {
  static async undoLastBall(matchId: string, timeoutMs: number = 5000): Promise<void> {
    await TransactionManager.runInTransaction(async (db) => {
      // Check match status first
      const matches: any = await db.query("SELECT * FROM v2_matches WHERE id = ?;", [matchId]);
      const match = matches.values?.[0] || matches[0];
      if (match && match.status === 'past') {
        throw new Error("Match is completed and read-only.");
      }

      // 1. Fetch latest active ball
      const rows: any = await db.query(
        "SELECT * FROM v2_ball_events WHERE match_id = ? AND is_superseded = 0 ORDER BY sequence_number DESC LIMIT 1;",
        [matchId]
      );
      const latest = rows.values?.[0] || rows[0];
      if (!latest) {
        throw new Error("No ball event found to undo.");
      }

      // Check timeout
      if (Date.now() - latest.timestamp > timeoutMs) {
        throw new Error("Undo timeout exceeded. Use Ball Correction instead.");
      }

      // 2. Logically remove (or delete) the last ball event
      await db.run("DELETE FROM v2_ball_events WHERE event_uuid = ?;", [latest.event_uuid]);

      // 3. Rebuild derived state
      await SnapshotRecoveryService.rebuildSnapshot(matchId, db);
      await InningsRecoveryService.rebuildInnings(matchId, db);
      await StatsEngine.rebuildAllStats(db, matchId);

      await EngineLogger.log(matchId, 'Ball Undone', { eventUuid: latest.event_uuid }, db);

      // 4. Publish Event
      eventBus.publish('BallUndone', { matchId });
      eventBus.publish('SnapshotUpdated', { matchId });
      eventBus.publish('StatisticsUpdated', { matchId });
    });
  }

  static async correctBall(
    matchId: string,
    originalUuid: string,
    corrections: Partial<Omit<BallEventV2, 'eventUuid' | 'matchId' | 'sequenceNumber'>>
  ): Promise<void> {
    await TransactionManager.runInTransaction(async (db) => {
      // Check match status first
      const matches: any = await db.query("SELECT * FROM v2_matches WHERE id = ?;", [matchId]);
      const match = matches.values?.[0] || matches[0];
      if (match && match.status === 'past') {
        throw new Error("Match is completed and read-only.");
      }

      // 1. Fetch original ball
      const rows: any = await db.query(
        "SELECT * FROM v2_ball_events WHERE event_uuid = ? AND match_id = ?;",
        [originalUuid, matchId]
      );
      const orig = rows.values?.[0] || rows[0];
      if (!orig) {
        throw new Error("Original ball event not found.");
      }

      const newUuid = crypto.randomUUID();

      // 2. Mark original as superseded
      await db.run(
        "UPDATE v2_ball_events SET is_superseded = 1, superseded_by = ? WHERE event_uuid = ?;",
        [newUuid, originalUuid]
      );

      // 3. Create corrected Ball Event
      const correctedBall: BallEventV2 = {
        eventUuid: newUuid,
        matchId: orig.match_id,
        inningsNo: corrections.inningsNo ?? orig.innings_no,
        overNo: corrections.overNo ?? orig.over_no,
        ballNo: corrections.ballNo ?? orig.ball_no,
        strikerId: corrections.strikerId ?? orig.striker_id,
        nonStrikerId: corrections.nonStrikerId ?? orig.non_striker_id,
        bowlerId: corrections.bowlerId ?? orig.bowler_id,
        runsOffBat: corrections.runsOffBat ?? orig.runs_off_bat,
        extras: corrections.extras ?? orig.extras,
        extraType: corrections.hasOwnProperty('extraType') ? corrections.extraType! : orig.extra_type,
        wicket: corrections.hasOwnProperty('wicket') ? corrections.wicket! : (orig.wicket === 1),
        wicketType: corrections.hasOwnProperty('wicketType') ? corrections.wicketType! : orig.wicket_type,
        dismissedPlayerId: corrections.hasOwnProperty('dismissedPlayerId') ? corrections.dismissedPlayerId! : orig.dismissed_player_id,
        timestamp: orig.timestamp, // preserve original timestamp
        deviceId: orig.device_id,
        sequenceNumber: orig.sequence_number, // same sequence number
        version: (orig.version ?? 1) + 1,
        metadata: corrections.metadata ?? orig.metadata,
        isSuperseded: false
      };

      await BallRepository.saveBall(correctedBall, db);

      // 4. Replay from the corrected point (rebuild all snapshots & stats)
      await SnapshotRecoveryService.rebuildSnapshot(matchId, db);
      await InningsRecoveryService.rebuildInnings(matchId, db);
      await StatsEngine.rebuildAllStats(db, matchId);

      await EngineLogger.log(
        matchId,
        'Ball Corrected',
        { originalUuid, correctionUuid: newUuid, sequenceNumber: orig.sequence_number },
        db
      );

      // 5. Publish events
      eventBus.publish('BallCorrected', { matchId });
      eventBus.publish('ReplayCompleted', { matchId });
      eventBus.publish('SnapshotUpdated', { matchId });
      eventBus.publish('StatisticsUpdated', { matchId });
    });
  }

  static async deleteBall(matchId: string, eventUuid: string): Promise<void> {
    await TransactionManager.runInTransaction(async (db) => {
      const matches: any = await db.query("SELECT * FROM v2_matches WHERE id = ?;", [matchId]);
      const match = matches.values?.[0] || matches[0];
      if (match && match.status === 'past') {
        throw new Error("Match is completed and read-only.");
      }

      await db.run(
        "UPDATE v2_ball_events SET is_superseded = 1 WHERE event_uuid = ? AND match_id = ?;",
        [eventUuid, matchId]
      );

      await SnapshotRecoveryService.rebuildSnapshot(matchId, db);
      await InningsRecoveryService.rebuildInnings(matchId, db);
      await StatsEngine.rebuildAllStats(db, matchId);

      await EngineLogger.log(matchId, 'Ball Deleted', { eventUuid }, db);

      eventBus.publish('BallUndone', { matchId });
      eventBus.publish('ReplayCompleted', { matchId });
      eventBus.publish('SnapshotUpdated', { matchId });
      eventBus.publish('StatisticsUpdated', { matchId });
    });
  }
}
