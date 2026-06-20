import { MatchSnapshotV2 } from '../models/matchSnapshot';
import { SnapshotRepository } from '../repository';
import { MatchCompletionEngine } from './matchCompletionEngine';
import { eventBus } from '../events/eventBus';
import { EngineLogger } from '../utils/logger';

export class InningsEngine {
  static async checkInningsStatus(
    db: any,
    matchId: string,
    snap: MatchSnapshotV2
  ): Promise<MatchSnapshotV2> {
    // 1. Fetch match metadata & squad count
    const matches = await db.query(
      `SELECT m.*, 
              (SELECT name FROM teams WHERE id = m.team_a_id) as team_a_name,
              (SELECT name FROM teams WHERE id = m.team_b_id) as team_b_name
       FROM v2_matches m WHERE m.id = ?;`,
      [matchId]
    );
    const match = matches.values?.[0] || matches[0];
    if (!match) return snap;

    const oversLimit = match.overs ?? 6;
    
    // Determine batting team's squad count
    const currentBattingTeamId = snap.inningsNo === 1 
      ? (match.batting_first_id ?? match.team_a_id)
      : (match.batting_first_id === match.team_a_id ? match.team_b_id : match.team_a_id);

    const squadRows = await db.query(
      "SELECT COUNT(*) as count FROM match_squads WHERE match_id = ? AND team_id = ?;",
      [matchId, currentBattingTeamId]
    );
    const squadCount = squadRows.values?.[0]?.count ?? squadRows[0]?.count ?? 11;
    const maxWickets = match.last_man_batting === 1 ? squadCount : squadCount - 1;

    let updatedSnap = { ...snap };

    // 2. Handle First Innings Completion
    if (snap.inningsNo === 1) {
      if (snap.legalDeliveries >= oversLimit * 6 || snap.wickets >= maxWickets) {
        // Mark first innings as closed
        await db.run(
          "UPDATE v2_innings SET is_closed = 1 WHERE match_id = ? AND innings_no = 1;",
          [matchId]
        );

        // Update match status and current innings
        await db.run(
          "UPDATE v2_matches SET current_innings = 2, status = 'live' WHERE id = ?;",
          [matchId]
        );

        const target = snap.teamScore + 1;
        const secondBattingTeamId = currentBattingTeamId === match.team_a_id ? match.team_b_id : match.team_a_id;
        const secondBowlingTeamId = currentBattingTeamId;

        // Insert second innings if not exists
        await db.run(
          `INSERT OR IGNORE INTO v2_innings (id, match_id, innings_no, batting_team_id, bowling_team_id, runs, wickets, legal_balls, is_closed)
           VALUES (?, ?, 2, ?, ?, 0, 0, 0, 0);`,
          [`${matchId}_inn_2`, matchId, secondBattingTeamId, secondBowlingTeamId]
        );

        // Construct 2nd innings snapshot (resetting striker, non-striker, bowler, overs, wickets)
        updatedSnap = {
          matchId,
          inningsNo: 2,
          teamScore: 0,
          wickets: 0,
          overs: 0,
          balls: 0,
          legalDeliveries: 0,
          extras: 0,
          boundaries: 0,
          sixes: 0,
          currentBatterId: null,
          nonStrikerId: null,
          currentBowlerId: null,
          partnershipRuns: 0,
          partnershipBalls: 0,
          currentOverNo: 0,
          ballsRemainingInOver: 6,
          currentRunRate: 0.0,
          requiredRunRate: target / oversLimit,
          target,
          runsRequired: target,
          ballsRemaining: oversLimit * 6,
          projectedScore: 0,
          inningsStatus: 'active',
          matchStatus: 'live'
        };

        await SnapshotRepository.saveSnapshot(updatedSnap, db);
        await EngineLogger.log(matchId, 'Innings Completed', { inningsNo: 1, target }, db);

        // Publish Events
        eventBus.publish('InningsCompleted', { matchId, inningsNo: 1 });
        eventBus.publish('InningsStarted', { matchId, inningsNo: 2 });
        eventBus.publish('TargetGenerated', { matchId });
        eventBus.publish('SnapshotUpdated', { matchId });
      }
    } 
    // 3. Handle Second Innings Completion
    else if (snap.inningsNo === 2) {
      const target = snap.target ?? (await this.getFirstInningsRuns(db, matchId) + 1);
      const isTargetChased = snap.teamScore >= target;
      const isOversOrWicketsFinished = snap.legalDeliveries >= oversLimit * 6 || snap.wickets >= maxWickets;

      if (isTargetChased || isOversOrWicketsFinished) {
        // Mark second innings as closed
        await db.run(
          "UPDATE v2_innings SET is_closed = 1 WHERE match_id = ? AND innings_no = 2;",
          [matchId]
        );

        // Calculate result text
        let resultText = '';
        if (isTargetChased) {
          const wicketsLeft = Math.max(0, maxWickets - snap.wickets);
          const chasingTeamName = currentBattingTeamId === match.team_a_id 
            ? (match.team_a_name ?? 'Chasing Team') 
            : (match.team_b_name ?? 'Chasing Team');
          resultText = `${chasingTeamName} won by ${wicketsLeft} wicket${wicketsLeft === 1 ? '' : 's'}`;
        } else {
          if (snap.teamScore === target - 1) {
            resultText = 'Match tied';
          } else {
            const diff = (target - 1) - snap.teamScore;
            const defendingTeamName = currentBattingTeamId === match.team_a_id 
              ? (match.team_b_name ?? 'Defending Team') 
              : (match.team_a_name ?? 'Defending Team');
            resultText = `${defendingTeamName} won by ${diff} run${diff === 1 ? '' : 's'}`;
          }
        }

        // Set result in v2_matches
        await db.run(
          "UPDATE v2_matches SET result = ? WHERE id = ?;",
          [resultText, matchId]
        );

        // Run Match Finalization
        await MatchCompletionEngine.completeMatch(db, matchId);

        updatedSnap = {
          ...snap,
          inningsStatus: 'completed',
          matchStatus: 'past'
        };
      } else {
        // Publish ChaseUpdated event
        eventBus.publish('ChaseUpdated', { matchId });
      }
    }

    return updatedSnap;
  }

  private static async getFirstInningsRuns(db: any, matchId: string): Promise<number> {
    const firstInnings = await db.query(
      "SELECT runs FROM v2_innings WHERE match_id = ? AND innings_no = 1;",
      [matchId]
    );
    return firstInnings.values?.[0]?.runs ?? firstInnings[0]?.runs ?? 0;
  }
}
