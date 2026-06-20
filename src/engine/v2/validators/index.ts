export { BallValidator } from './ballValidator';

export class MatchValidator {
  static validate(match: any): { valid: boolean; errors: string[] } {
    return { valid: true, errors: [] };
  }
}

export class InningsValidator {
  static validate(innings: any): { valid: boolean; errors: string[] } {
    return { valid: true, errors: [] };
  }
}

export class PlayerValidator {
  static validate(player: any): { valid: boolean; errors: string[] } {
    return { valid: true, errors: [] };
  }
}

export class BowlerValidator {
  static validate(bowler: any): { valid: boolean; errors: string[] } {
    return { valid: true, errors: [] };
  }
}
