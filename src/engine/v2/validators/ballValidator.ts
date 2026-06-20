import { BallEventV2 } from '../models/ballEvent';

export class BallValidator {
  static async validate(
    ball: Omit<BallEventV2, 'version'>,
    db: any
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // 1. Fetch match and verify status
    const matches = await db.query("SELECT * FROM v2_matches WHERE id = ?;", [ball.matchId]);
    const match = matches.values?.[0] || matches[0];
    if (!match) {
      return { valid: false, errors: ["Match does not exist."] };
    }
    if (match.status !== 'live') {
      errors.push("Match is not active.");
    }

    // 2. Fetch innings and verify status
    const inningsRows = await db.query(
      "SELECT * FROM v2_innings WHERE match_id = ? AND innings_no = ?;",
      [ball.matchId, ball.inningsNo]
    );
    const innings = inningsRows.values?.[0] || inningsRows[0];
    if (!innings) {
      errors.push("Innings does not exist.");
    } else if (innings.is_closed === 1) {
      errors.push("Innings is already closed.");
    }

    // 3. Verify striker, non-striker, and bowler IDs
    if (!ball.strikerId || !ball.nonStrikerId || !ball.bowlerId) {
      errors.push("Striker, non-striker, and bowler are all required.");
    }
    if (ball.strikerId === ball.nonStrikerId) {
      errors.push("Striker and non-striker cannot be the same player.");
    }
    if (ball.bowlerId === ball.strikerId || ball.bowlerId === ball.nonStrikerId) {
      errors.push("Bowler cannot be currently batting.");
    }

    // 4. Verify player presence in match squads
    const squads = await db.query(
      "SELECT player_id FROM match_squads WHERE match_id = ? AND player_id IN (?, ?, ?);",
      [ball.matchId, ball.strikerId, ball.nonStrikerId, ball.bowlerId]
    );
    const squadPlayerIds = new Set((squads.values || squads).map((s: any) => s.player_id));
    if (!squadPlayerIds.has(ball.strikerId)) errors.push("Striker is not in match squad.");
    if (!squadPlayerIds.has(ball.nonStrikerId)) errors.push("Non-striker is not in match squad.");
    if (!squadPlayerIds.has(ball.bowlerId)) errors.push("Bowler is not in match squad.");

    // 5. Verify ball sequence correctness
    const maxSeq = await db.query(
      "SELECT COALESCE(MAX(sequence_number), 0) as last_seq FROM v2_ball_events WHERE match_id = ?;",
      [ball.matchId]
    );
    const lastSeq = maxSeq.values?.[0]?.last_seq ?? maxSeq[0]?.last_seq ?? 0;
    if (ball.sequenceNumber !== lastSeq + 1) {
      errors.push(`Invalid sequence number. Expected ${lastSeq + 1}, got ${ball.sequenceNumber}.`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
