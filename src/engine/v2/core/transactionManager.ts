import { sqliteService } from '@/lib/services/sqliteService';

export class TransactionManager {
  static async runInTransaction<T>(
    operation: (dbConnection: any) => Promise<T>
  ): Promise<T> {
    let result: T | undefined;
    await sqliteService.executeTransaction(async (db) => {
      result = await operation(db);
    });
    if (result === undefined) {
      throw new Error("Transaction execution returned undefined result");
    }
    return result;
  }
}
