import { BallEventV2 } from '../models/ballEvent';
import { MatchSnapshotV2 } from '../models/matchSnapshot';
import { TransactionManager } from '../core/transactionManager';
import { BallValidator } from '../validators/ballValidator';
import { BallRepository } from '../repository';
import { SnapshotUpdater } from './snapshotUpdater';
import { StatsEngine } from './statsEngine';
import { InningsEngine } from './inningsEngine';
import { eventBus } from '../events/eventBus';
import { EngineLogger } from '../utils/logger';

export class BallProcessor {
  static async processBall(
    ballInput: Omit<BallEventV2, 'version' | 'sequenceNumber' | 'timestamp'>
  ): Promise<MatchSnapshotV2> {
    return TransactionManager.runInTransaction(async (db) => {
      // 1. Get next sequence number
      const maxSeq = await db.query(
        "SELECT COALESCE(MAX(sequence_number), 0) as last_seq FROM v2_ball_events WHERE match_id = ?;",
        [ballInput.matchId]
      );
      const lastSeq = maxSeq.values?.[0]?.last_seq ?? maxSeq[0]?.last_seq ?? 0;
      const sequenceNumber = lastSeq + 1;

      // 2. Construct immutable ball event
      const ballEvent: BallEventV2 = {
        ...ballInput,
        sequenceNumber,
        timestamp: Date.now(),
        version: 1
      };

      // 3. Validate Match, Innings, Ball and Players
      const validation = await BallValidator.validate(ballEvent, db);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(' ')}`);
      }

      // 4. Save Ball Event
      await BallRepository.saveBall(ballEvent, db);

      // 5. Update Match Snapshot
      const updatedSnap = await SnapshotUpdater.update(db, ballEvent.matchId, ballEvent);

      // 5.5 Update Player and Match Statistics
      await StatsEngine.updateStats(db, ballEvent.matchId);

      // 5.6 Check and execute Innings Transitions
      const finalSnap = await InningsEngine.checkInningsStatus(db, ballEvent.matchId, updatedSnap);

      // 6. Write Audit Log
      await EngineLogger.log(
        ballEvent.matchId,
        'Ball Added',
        { eventUuid: ballEvent.eventUuid, sequenceNumber },
        db
      );

      // 7. Publish Event Bus notifications after transaction commits successfully
      const isLegal = ballEvent.extraType !== 'wide' && ballEvent.extraType !== 'no_ball';
      if (isLegal && finalSnap.legalDeliveries > 0 && finalSnap.legalDeliveries % 6 === 0) {
        eventBus.publish('OverCompleted', { matchId: ballEvent.matchId, overNo: finalSnap.overs });
      }

      eventBus.publish('BallAdded', { matchId: ballEvent.matchId, ballUuid: ballEvent.eventUuid });
      eventBus.publish('SnapshotUpdated', { matchId: ballEvent.matchId });

      return finalSnap;
    });
  }
}
