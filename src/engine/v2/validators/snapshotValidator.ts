import { MatchSnapshotV2 } from '../models/matchSnapshot';
import { BallEventV2 } from '../models/ballEvent';

export class SnapshotValidator {
  static async validate(
    snap: MatchSnapshotV2,
    balls: BallEventV2[]
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // 1. Calculate expected runs, wickets, legal deliveries from ball events
    let expectedRuns = 0;
    let expectedWickets = 0;
    let expectedLegal = 0;
    let expectedBoundaries = 0;
    let expectedSixes = 0;
    let expectedExtras = 0;

    for (const b of balls) {
      if (b.inningsNo === snap.inningsNo) {
        expectedRuns += b.runsOffBat + b.extras;
        expectedWickets += b.wicket ? 1 : 0;
        const isLegal = b.extraType !== 'wide' && b.extraType !== 'no_ball';
        if (isLegal) {
          expectedLegal++;
        }
        expectedExtras += b.extras;
        if (b.runsOffBat === 4) expectedBoundaries++;
        if (b.runsOffBat === 6) expectedSixes++;
      }
    }

    if (snap.teamScore !== expectedRuns) {
      errors.push(`Runs mismatch. Snapshot shows ${snap.teamScore}, events show ${expectedRuns}.`);
    }
    if (snap.wickets !== expectedWickets) {
      errors.push(`Wickets mismatch. Snapshot shows ${snap.wickets}, events show ${expectedWickets}.`);
    }
    if (snap.legalDeliveries !== expectedLegal) {
      errors.push(`Legal deliveries mismatch. Snapshot shows ${snap.legalDeliveries}, events show ${expectedLegal}.`);
    }
    if (snap.overs * 6 + snap.balls !== expectedLegal) {
      errors.push(`Overs mismatch. Snapshot shows ${snap.overs}.${snap.balls}, expected ${Math.floor(expectedLegal / 6)}.${expectedLegal % 6}.`);
    }
    if (snap.boundaries !== expectedBoundaries) {
      errors.push(`Boundaries mismatch. Snapshot shows ${snap.boundaries}, expected ${expectedBoundaries}.`);
    }
    if (snap.sixes !== expectedSixes) {
      errors.push(`Sixes mismatch. Snapshot shows ${snap.sixes}, expected ${expectedSixes}.`);
    }
    if (snap.extras !== expectedExtras) {
      errors.push(`Extras mismatch. Snapshot shows ${snap.extras}, expected ${expectedExtras}.`);
    }

    // 2. Batter & Bowler existence
    if (expectedLegal > 0) {
      if (!snap.currentBatterId) errors.push("Current striker is missing.");
      if (!snap.nonStrikerId) errors.push("Current non-striker is missing.");
      if (!snap.currentBowlerId) errors.push("Current bowler is missing.");
    }

    // 3. Status checks
    const validMatchStatuses = ['upcoming', 'live', 'past', 'locked'];
    if (!validMatchStatuses.includes(snap.matchStatus)) {
      errors.push(`Invalid match status: ${snap.matchStatus}`);
    }
    const validInningsStatuses = ['active', 'completed'];
    if (!validInningsStatuses.includes(snap.inningsStatus)) {
      errors.push(`Invalid innings status: ${snap.inningsStatus}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
