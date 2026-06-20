import { BallEventV2 } from '../models/ballEvent';

export interface OverStatus {
  legalBallsInOver: number;
  isOverComplete: boolean;
  nextStrikerId: string;
  nextNonStrikerId: string;
}

export class OverManager {
  static getOverProgress(legalBalls: number): { overNo: number; ballNo: number } {
    return {
      overNo: Math.floor(legalBalls / 6),
      ballNo: (legalBalls % 6) + 1
    };
  }

  static calculateStrikeAndOver(
    currentLegalBalls: number,
    ball: Omit<BallEventV2, 'version'>
  ): OverStatus {
    const isLegal = ball.extraType !== 'wide' && ball.extraType !== 'no_ball';
    const newLegalBalls = currentLegalBalls + (isLegal ? 1 : 0);
    const legalBallsInOver = newLegalBalls % 6;
    const isOverComplete = isLegal && legalBallsInOver === 0;

    // Run-based strike rotation
    let rotate = false;
    if (ball.extraType === 'bye' || ball.extraType === 'leg_bye') {
      rotate = ball.extras % 2 === 1;
    } else if (ball.extraType !== 'wide') {
      rotate = ball.runsOffBat % 2 === 1;
    }

    let striker = ball.strikerId;
    let nonStriker = ball.nonStrikerId;

    if (rotate) {
      // Swap striker & non-striker
      const temp = striker;
      striker = nonStriker;
      nonStriker = temp;
    }

    if (isOverComplete) {
      // Over end swaps striker and non-striker for the next over
      const temp = striker;
      striker = nonStriker;
      nonStriker = temp;
    }

    return {
      legalBallsInOver: isOverComplete ? 6 : legalBallsInOver,
      isOverComplete,
      nextStrikerId: striker,
      nextNonStrikerId: nonStriker
    };
  }
}
