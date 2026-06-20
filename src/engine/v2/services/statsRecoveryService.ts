import { sqliteService } from '@/lib/services/sqliteService';
import { StatsEngine } from './statsEngine';
import { TransactionManager } from '../core/transactionManager';

export class StatisticsRecoveryService {
  static async rebuildBattingStats(matchId: string): Promise<void> {
    await TransactionManager.runInTransaction(async (db) => {
      await StatsEngine.rebuildAllStats(db, matchId);
    });
  }

  static async rebuildBowlingStats(matchId: string): Promise<void> {
    await TransactionManager.runInTransaction(async (db) => {
      await StatsEngine.rebuildAllStats(db, matchId);
    });
  }

  static async rebuildPartnerships(matchId: string): Promise<void> {
    await TransactionManager.runInTransaction(async (db) => {
      await StatsEngine.rebuildAllStats(db, matchId);
    });
  }

  static async verifyStatistics(matchId: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    // Cast to any to safely extract row count from driver result
    const batRows: any = await sqliteService.query("SELECT COUNT(*) as count FROM v2_player_match_stats WHERE match_id = ?;", [matchId]);
    const bowlRows: any = await sqliteService.query("SELECT COUNT(*) as count FROM v2_bowler_match_stats WHERE match_id = ?;", [matchId]);
    const partRows: any = await sqliteService.query("SELECT COUNT(*) as count FROM v2_partnerships WHERE match_id = ?;", [matchId]);

    const batCount = batRows.values?.[0]?.count ?? batRows[0]?.count ?? 0;
    const bowlCount = bowlRows.values?.[0]?.count ?? bowlRows[0]?.count ?? 0;

    if (batCount === 0 && bowlCount > 0) {
      errors.push("Batting stats are missing but bowling stats exist.");
    }
    if (bowlCount === 0 && batCount > 0) {
      errors.push("Bowling stats are missing but batting stats exist.");
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}
