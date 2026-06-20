import { sqliteService } from '@/lib/services/sqliteService';
import { V2_SCHEMA_QUERIES } from '../database/schema';

export class DatabaseService {
  static async initializeV2Database(): Promise<void> {
    try {
      console.log("[CricEngineV2] Initializing SQLite database schema...");
      for (const query of V2_SCHEMA_QUERIES) {
        await sqliteService.execute(query);
      }
      console.log("[CricEngineV2] SQLite schema initialized successfully.");
    } catch (err) {
      console.error("[CricEngineV2] Failed to initialize database schema:", err);
      throw err;
    }
  }
}
