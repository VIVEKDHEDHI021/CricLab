import { sqliteService } from '@/lib/services/sqliteService';

const IS_PROD = process.env.NODE_ENV === 'production';

export class EngineLogger {
  static async log(
    matchId: string,
    action: 'Ball Added' | 'Ball Corrected' | 'Undo' | 'Innings End' | 'Match End' | string,
    payload: any,
    db?: any
  ): Promise<void> {
    if (IS_PROD) {
      return; // Disabled in production builds
    }

    const logId = crypto.randomUUID();
    const timestamp = Date.now();
    const payloadStr = JSON.stringify(payload);

    const executor = db || sqliteService;
    try {
      await executor.run(
        `INSERT INTO v2_audit_logs (id, match_id, action, payload, timestamp)
         VALUES (?, ?, ?, ?, ?);`,
        [logId, matchId, action, payloadStr, timestamp]
      );
    } catch (err) {
      console.error("[CricEngineV2] Failed to write audit log:", err);
    }
  }
}
