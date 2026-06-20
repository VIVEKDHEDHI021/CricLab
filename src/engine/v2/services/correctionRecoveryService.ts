import { sqliteService } from '@/lib/services/sqliteService';
import { TransactionManager } from '../core/transactionManager';
import { SnapshotRecoveryService } from './snapshotRecoveryService';
import { InningsRecoveryService } from './inningsRecoveryService';
import { StatsEngine } from './statsEngine';

export class CorrectionRecoveryService {
  static async replayFromBall(matchId: string, eventSequence: number): Promise<void> {
    await TransactionManager.runInTransaction(async (db) => {
      // Rebuild the snapshot, innings and statistics from ball events
      await SnapshotRecoveryService.rebuildSnapshot(matchId, db);
      await InningsRecoveryService.rebuildInnings(matchId, db);
      await StatsEngine.rebuildAllStats(db, matchId);
    });
  }

  static async verifyReplay(matchId: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Verify snapshot and innings
    const snapCheck = await SnapshotRecoveryService.verifySnapshot(matchId);
    if (!snapCheck.valid) {
      errors.push(...snapCheck.errors);
    }

    const inningsCheck = await InningsRecoveryService.verifyInnings(matchId);
    if (!inningsCheck.valid) {
      errors.push(...inningsCheck.errors);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  static async repairReplay(matchId: string): Promise<void> {
    const check = await this.verifyReplay(matchId);
    if (!check.valid) {
      await this.replayFromBall(matchId, 0);
    }
  }
}
