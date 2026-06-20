import { MatchSnapshotV2 } from '../models/matchSnapshot';
import { SnapshotRepository } from '../repository';
import { SnapshotUpdater } from '../services/snapshotUpdater';
import { SnapshotRecoveryService } from '../services/snapshotRecoveryService';
import { BallEventV2 } from '../models/ballEvent';

export class SnapshotEngine {
  static async getSnapshot(matchId: string): Promise<MatchSnapshotV2 | null> {
    return SnapshotRepository.getSnapshot(matchId);
  }

  static async updateSnapshot(
    db: any,
    matchId: string,
    ball: Omit<BallEventV2, 'version'>
  ): Promise<MatchSnapshotV2> {
    return SnapshotUpdater.update(db, matchId, ball);
  }

  static async verifyAndRepair(matchId: string): Promise<MatchSnapshotV2 | null> {
    return SnapshotRecoveryService.repairSnapshot(matchId);
  }
}
