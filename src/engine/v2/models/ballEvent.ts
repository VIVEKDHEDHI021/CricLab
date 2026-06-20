export interface BallEventV2 {
  readonly eventUuid: string;
  readonly matchId: string;
  readonly inningsNo: number;
  readonly overNo: number;
  readonly ballNo: number;
  readonly strikerId: string;
  readonly nonStrikerId: string;
  readonly bowlerId: string;
  readonly runsOffBat: number;
  readonly extras: number;
  readonly extraType: 'wide' | 'no_ball' | 'bye' | 'leg_bye' | null;
  readonly wicket: boolean;
  readonly wicketType: string | null;
  readonly dismissedPlayerId: string | null;
  readonly timestamp: number;
  readonly deviceId: string;
  readonly sequenceNumber: number;
  readonly version: number;
  readonly metadata?: string | null;
  readonly supersededBy?: string | null;
  readonly isSuperseded?: boolean;
}
