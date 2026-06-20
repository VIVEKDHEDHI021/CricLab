import { BallEventV2 } from '../models/ballEvent';
import { MatchSnapshotV2 } from '../models/matchSnapshot';
import { SnapshotRepository } from '../repository';
import { OverManager } from './overManager';

export class SnapshotUpdater {
  static async update(
    db: any,
    matchId: string,
    ball: Omit<BallEventV2, 'version'>
  ): Promise<MatchSnapshotV2> {
    // 1. Fetch match metadata
    const matches = await db.query("SELECT * FROM v2_matches WHERE id = ?;", [matchId]);
    const match = matches.values?.[0] || matches[0];
    const oversLimit = match?.overs ?? 6;

    // 2. Fetch current snapshot or construct default
    let snap = await SnapshotRepository.getSnapshot(matchId);
    if (!snap) {
      snap = {
        matchId,
        inningsNo: ball.inningsNo,
        teamScore: 0,
        wickets: 0,
        overs: 0,
        balls: 0,
        legalDeliveries: 0,
        extras: 0,
        boundaries: 0,
        sixes: 0,
        currentBatterId: ball.strikerId,
        nonStrikerId: ball.nonStrikerId,
        currentBowlerId: ball.bowlerId,
        partnershipRuns: 0,
        partnershipBalls: 0,
        currentOverNo: 0,
        ballsRemainingInOver: 6,
        currentRunRate: 0,
        requiredRunRate: null,
        target: null,
        runsRequired: null,
        ballsRemaining: oversLimit * 6,
        projectedScore: 0,
        inningsStatus: 'active',
        matchStatus: 'live'
      };
    }

    // 3. Calculate scores
    const isLegal = ball.extraType !== 'wide' && ball.extraType !== 'no_ball';
    const totalRuns = snap.teamScore + ball.runsOffBat + ball.extras;
    const wickets = snap.wickets + (ball.wicket ? 1 : 0);
    const legalDeliveries = snap.legalDeliveries + (isLegal ? 1 : 0);
    const extras = snap.extras + ball.extras;
    const boundaries = snap.boundaries + (ball.runsOffBat === 4 ? 1 : 0);
    const sixes = snap.sixes + (ball.runsOffBat === 6 ? 1 : 0);

    const overProgress = OverManager.calculateStrikeAndOver(snap.legalDeliveries, ball);

    // 4. Over progress display
    const newOvers = Math.floor(legalDeliveries / 6);
    const newBalls = legalDeliveries % 6;
    const currentOverNo = newOvers;
    const ballsRemainingInOver = 6 - newBalls;

    // 5. Target / run rate calculations
    let target: number | null = null;
    let runsRequired: number | null = null;
    let requiredRunRate: number | null = null;
    const ballsRemaining = Math.max(0, (oversLimit * 6) - legalDeliveries);

    if (ball.inningsNo === 2) {
      const firstInnings = await db.query(
        "SELECT runs FROM v2_innings WHERE match_id = ? AND innings_no = 1;",
        [matchId]
      );
      const firstRuns = firstInnings.values?.[0]?.runs ?? firstInnings[0]?.runs ?? 0;
      target = firstRuns + 1;
      runsRequired = Math.max(0, (firstRuns + 1) - totalRuns);
      if (ballsRemaining > 0) {
        requiredRunRate = (runsRequired / (ballsRemaining / 6));
      }
    }

    const currentRunRate = legalDeliveries > 0 ? (totalRuns / (legalDeliveries / 6)) : 0;
    const projectedScore = legalDeliveries > 0 ? Math.round(currentRunRate * oversLimit) : 0;

    // 6. Update the snapshot object
    const updatedSnap: MatchSnapshotV2 = {
      matchId,
      inningsNo: ball.inningsNo,
      teamScore: totalRuns,
      wickets,
      overs: newOvers,
      balls: newBalls,
      legalDeliveries,
      extras,
      boundaries,
      sixes,
      currentBatterId: overProgress.nextStrikerId,
      nonStrikerId: overProgress.nextNonStrikerId,
      currentBowlerId: ball.bowlerId,
      partnershipRuns: 0,
      partnershipBalls: 0,
      currentOverNo,
      ballsRemainingInOver,
      currentRunRate,
      requiredRunRate,
      target,
      runsRequired,
      ballsRemaining,
      projectedScore,
      inningsStatus: snap.inningsStatus,
      matchStatus: snap.matchStatus
    };

    // 7. Persist snapshot & V2 innings table
    await SnapshotRepository.saveSnapshot(updatedSnap, db);
    await db.run(
      `UPDATE v2_innings
       SET runs = ?, wickets = ?, legal_balls = ?
       WHERE match_id = ? AND innings_no = ?;`,
      [totalRuns, wickets, legalDeliveries, matchId, ball.inningsNo]
    );

    return updatedSnap;
  }
}
