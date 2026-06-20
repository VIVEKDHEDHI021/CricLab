export interface MatchSnapshotV2 {
  readonly matchId: string;
  readonly inningsNo: number;
  readonly teamScore: number;
  readonly wickets: number;
  readonly overs: number;
  readonly balls: number;
  readonly legalDeliveries: number;
  readonly extras: number;
  readonly boundaries: number;
  readonly sixes: number;
  readonly currentBatterId: string | null;
  readonly nonStrikerId: string | null;
  readonly currentBowlerId: string | null;
  readonly partnershipRuns: number;
  readonly partnershipBalls: number;
  readonly currentOverNo: number;
  readonly ballsRemainingInOver: number;
  readonly currentRunRate: number;
  readonly requiredRunRate: number | null;
  readonly target: number | null;
  readonly runsRequired: number | null;
  readonly ballsRemaining: number | null;
  readonly projectedScore: number;
  readonly inningsStatus: 'active' | 'completed';
  readonly matchStatus: 'upcoming' | 'live' | 'past' | 'locked';
}
