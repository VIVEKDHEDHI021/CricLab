import { sqliteService } from '@/lib/services/sqliteService';
import { TransactionManager } from '../core/transactionManager';
import { SnapshotRecoveryService } from './snapshotRecoveryService';
import { InningsRecoveryService } from './inningsRecoveryService';
import { StatsEngine } from './statsEngine';
import { MatchCompletionEngine } from './matchCompletionEngine';

export class MatchRecoveryService {
  static async verifyCompletedMatch(matchId: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Check if match exists and status is past
    const matches: any = await sqliteService.query("SELECT * FROM v2_matches WHERE id = ?;", [matchId]);
    const match = matches.values?.[0] || matches[0];
    if (!match) {
      return { valid: false, errors: ["Match not found."] };
    }

    if (match.status === 'past') {
      // Check if awards were generated
      const awards: any = await sqliteService.query("SELECT COUNT(*) as count FROM v2_match_awards WHERE match_id = ?;", [matchId]);
      const awardCount = awards.values?.[0]?.count ?? awards[0]?.count ?? 0;
      if (awardCount === 0) {
        errors.push("Completed match is missing generated awards.");
      }
    }

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

  static async rebuildFinalSnapshot(matchId: string): Promise<void> {
    await TransactionManager.runInTransaction(async (db) => {
      // 1. Rebuild basic snapshot, innings, and player stats
      await SnapshotRecoveryService.rebuildSnapshot(matchId, db);
      await InningsRecoveryService.rebuildInnings(matchId, db);
      await StatsEngine.rebuildAllStats(db, matchId);

      // 2. Fetch match details to see if it should be finalized
      const matches = await db.query("SELECT * FROM v2_matches WHERE id = ?;", [matchId]);
      const match = matches.values?.[0] || matches[0];
      if (match && match.status === 'past') {
        await MatchCompletionEngine.completeMatch(db, matchId);
      }
    });
  }

  static async repairCompletedMatch(matchId: string): Promise<void> {
    const check = await this.verifyCompletedMatch(matchId);
    if (!check.valid) {
      await this.rebuildFinalSnapshot(matchId);
    }
  }
}
