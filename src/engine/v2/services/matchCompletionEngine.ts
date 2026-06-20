import { sqliteService } from '@/lib/services/sqliteService';
import { SnapshotRepository } from '../repository';
import { eventBus } from '../events/eventBus';
import { EngineLogger } from '../utils/logger';

export class MatchCompletionEngine {
  static async completeMatch(db: any, matchId: string): Promise<void> {
    // 1. Fetch match and verify
    const matches = await db.query("SELECT * FROM v2_matches WHERE id = ?;", [matchId]);
    const match = matches.values?.[0] || matches[0];
    if (!match) {
      throw new Error(`Match ${matchId} not found.`);
    }

    // 2. Lock the match status
    await db.run("UPDATE v2_matches SET status = 'past' WHERE id = ?;", [matchId]);

    // 3. Update Match Snapshot status
    const snap = await SnapshotRepository.getSnapshot(matchId);
    if (snap) {
      const updatedSnap = {
        ...snap,
        inningsStatus: 'completed' as const,
        matchStatus: 'past' as const
      };
      await SnapshotRepository.saveSnapshot(updatedSnap, db);
    }

    // 4. Calculate Awards using Impact Score
    // Fetch Batting stats
    const battersRaw = await db.query("SELECT * FROM v2_player_match_stats WHERE match_id = ?;", [matchId]);
    const batters = battersRaw.values || battersRaw;

    // Fetch Bowling stats
    const bowlersRaw = await db.query("SELECT * FROM v2_bowler_match_stats WHERE match_id = ?;", [matchId]);
    const bowlers = bowlersRaw.values || bowlersRaw;

    // Fetch Fielding stats
    const fieldersRaw = await db.query("SELECT * FROM v2_fielding_match_stats WHERE match_id = ?;", [matchId]);
    const fielders = fieldersRaw.values || fieldersRaw;

    // Fetch Partnerships
    const partsRaw = await db.query("SELECT * FROM v2_partnerships WHERE match_id = ? ORDER BY runs DESC LIMIT 1;", [matchId]);
    const bestPart = partsRaw.values?.[0] || partsRaw[0];

    const impactScores: Record<string, number> = {};

    let bestBatterId: string | null = null;
    let maxRuns = -1;

    let bestBowlerId: string | null = null;
    let maxWickets = -1;
    let bestBowlEconomy = 999.0;

    let mostSixesPlayerId: string | null = null;
    let maxSixes = -1;

    let mostFoursPlayerId: string | null = null;
    let maxFours = -1;

    let bestEconPlayerId: string | null = null;
    let bestEcon = 999.0;

    // Calculate Batting Impact
    for (const b of batters) {
      const runs = b.runs ?? 0;
      const fours = b.fours ?? 0;
      const sixes = b.sixes ?? 0;
      let score = runs + fours * 1 + sixes * 2;
      if (runs >= 30) score += 5;
      if (runs >= 50) score += 10;

      impactScores[b.player_id] = (impactScores[b.player_id] || 0) + score;

      if (runs > maxRuns) {
        maxRuns = runs;
        bestBatterId = b.player_id;
      }
      if (sixes > maxSixes) {
        maxSixes = sixes;
        mostSixesPlayerId = b.player_id;
      }
      if (fours > maxFours) {
        maxFours = fours;
        mostFoursPlayerId = b.player_id;
      }
    }

    // Calculate Bowling Impact
    for (const b of bowlers) {
      const wickets = b.wickets ?? 0;
      const runsConceded = b.runs_conceded ?? 0;
      const dotBalls = b.dot_balls ?? 0;
      const maidens = b.maidens ?? 0;
      const economy = b.economy ?? 0;

      // Extract legal ball count from overs string (e.g. "1.2")
      const oversParts = (b.overs || "0.0").split(".");
      const legalBalls = parseInt(oversParts[0] || "0") * 6 + parseInt(oversParts[1] || "0");

      let score = wickets * 20 + dotBalls * 1 + maidens * 10 - runsConceded * 0.5;
      impactScores[b.player_id] = (impactScores[b.player_id] || 0) + score;

      if (wickets > maxWickets || (wickets === maxWickets && economy < bestBowlEconomy)) {
        maxWickets = wickets;
        bestBowlEconomy = economy;
        bestBowlerId = b.player_id;
      }

      if (legalBalls >= 6 && economy < bestEcon) {
        bestEcon = economy;
        bestEconPlayerId = b.player_id;
      }
    }

    // Calculate Fielding Impact
    for (const f of fielders) {
      const catches = f.catches ?? 0;
      const runOuts = f.run_outs ?? 0;
      const stumpings = f.stumpings ?? 0;

      const score = catches * 10 + runOuts * 15 + stumpings * 15;
      impactScores[f.player_id] = (impactScores[f.player_id] || 0) + score;
    }

    // Determine Player of the Match (highest impact score)
    let playerOfMatch: string | null = null;
    let topScore = -9999;
    for (const [pId, score] of Object.entries(impactScores)) {
      if (score > topScore) {
        topScore = score;
        playerOfMatch = pId;
      }
    }

    const bestPartnershipText = bestPart 
      ? `${bestPart.batsman1_id} & ${bestPart.batsman2_id} (${bestPart.runs} runs)`
      : null;

    // Save Awards to DB
    await db.run("DELETE FROM v2_match_awards WHERE match_id = ?;", [matchId]);
    await db.run(
      `INSERT INTO v2_match_awards (
         match_id, player_of_match, best_batter, best_bowler, best_partnership,
         most_sixes_player, most_fours_player, best_economy_player
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        matchId,
        playerOfMatch,
        bestBatterId,
        bestBowlerId,
        bestPartnershipText,
        mostSixesPlayerId,
        mostFoursPlayerId,
        bestEconPlayerId
      ]
    );

    await EngineLogger.log(matchId, 'Match Finalized', { playerOfMatch, result: match.result }, db);

    // 5. Publish events
    eventBus.publish('MatchCompleted', { matchId, result: match.result || 'Finished' });
    eventBus.publish('FinalSnapshotGenerated', { matchId });
    eventBus.publish('MatchLocked', { matchId });
    eventBus.publish('AwardsCalculated', { matchId });
  }
}
