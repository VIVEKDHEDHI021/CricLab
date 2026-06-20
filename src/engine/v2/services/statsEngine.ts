import { BallEventV2 } from '../models/ballEvent';
import { eventBus } from '../events/eventBus';

export class StatsEngine {
  static async updateStats(db: any, matchId: string): Promise<void> {
    await this.rebuildAllStats(db, matchId);
    eventBus.publish('SnapshotUpdated', { matchId }); // trigger snapshot update event
  }

  static async rebuildAllStats(db: any, matchId: string): Promise<void> {
    // 1. Fetch all ball events for the match in sequence order
    const rawBalls = await db.query(
      "SELECT * FROM v2_ball_events WHERE match_id = ? ORDER BY sequence_number ASC;",
      [matchId]
    );
    const balls: BallEventV2[] = (rawBalls.values || rawBalls).map((r: any) => ({
      eventUuid: r.event_uuid,
      matchId: r.match_id,
      inningsNo: r.innings_no,
      overNo: r.over_no,
      ballNo: r.ball_no,
      strikerId: r.striker_id,
      nonStrikerId: r.non_striker_id,
      bowlerId: r.bowler_id,
      runsOffBat: r.runs_off_bat,
      extras: r.extras,
      extraType: r.extra_type,
      wicket: r.wicket === 1,
      wicketType: r.wicket_type,
      dismissedPlayerId: r.dismissed_player_id,
      timestamp: r.timestamp,
      deviceId: r.device_id,
      sequenceNumber: r.sequence_number,
      version: r.version,
      metadata: r.metadata
    }));

    // 2. Clear old stats for this match
    await db.run("DELETE FROM v2_player_match_stats WHERE match_id = ?;", [matchId]);
    await db.run("DELETE FROM v2_bowler_match_stats WHERE match_id = ?;", [matchId]);
    await db.run("DELETE FROM v2_fielding_match_stats WHERE match_id = ?;", [matchId]);
    await db.run("DELETE FROM v2_partnerships WHERE match_id = ?;", [matchId]);
    await db.run("DELETE FROM v2_milestone_events WHERE match_id = ?;", [matchId]);

    // 3. Setup in-memory stats maps
    const batting: Record<string, any> = {};
    const bowling: Record<string, any> = {};
    const fielding: Record<string, any> = {};
    const milestones: any[] = [];

    // Partnerships tracking
    let activePartnership: {
      batsman1: string;
      batsman2: string;
      runs: number;
      balls: number;
      inningsNo: number;
    } | null = null;
    const completedPartnerships: any[] = [];

    // Helper to initialize batting stats
    const getBatting = (playerId: string, inningsNo: number) => {
      if (!batting[playerId]) {
        batting[playerId] = {
          id: `${matchId}_bat_${playerId}`,
          match_id: matchId,
          innings_no: inningsNo,
          player_id: playerId,
          runs: 0,
          balls: 0,
          fours: 0,
          sixes: 0,
          strike_rate: 0.0,
          dot_balls: 0,
          singles: 0,
          doubles: 0,
          triples: 0,
          highest_score: 0,
          is_out: 0,
          dismissal_type: null,
          bowler_id: null
        };
      }
      return batting[playerId];
    };

    // Helper to initialize bowling stats
    const getBowling = (playerId: string, inningsNo: number) => {
      if (!bowling[playerId]) {
        bowling[playerId] = {
          id: `${matchId}_bowl_${playerId}`,
          match_id: matchId,
          innings_no: inningsNo,
          player_id: playerId,
          legal_balls: 0,
          overs: "0.0",
          runs_conceded: 0,
          wickets: 0,
          economy: 0.0,
          maidens: 0,
          dot_balls: 0,
          wides: 0,
          noballs: 0,
          fours_conceded: 0,
          sixes_conceded: 0,
          bowling_average: 0.0,
          strike_rate: 0.0
        };
      }
      return bowling[playerId];
    };

    // Helper to initialize fielding stats
    const getFielding = (playerId: string, inningsNo: number) => {
      if (!fielding[playerId]) {
        fielding[playerId] = {
          id: `${matchId}_field_${playerId}`,
          match_id: matchId,
          innings_no: inningsNo,
          player_id: playerId,
          catches: 0,
          run_outs: 0,
          stumpings: 0,
          direct_hits: 0,
          assists: 0
        };
      }
      return fielding[playerId];
    };

    // 4. Process each ball event
    for (const b of balls) {
      const isLegal = b.extraType !== 'wide' && b.extraType !== 'no_ball';
      
      // A. Batting Stats
      const bat = getBatting(b.strikerId, b.inningsNo);
      bat.runs += b.runsOffBat;
      if (isLegal) {
        bat.balls++;
        if (b.runsOffBat === 0) bat.dot_balls++;
      }
      if (b.runsOffBat === 1) bat.singles++;
      if (b.runsOffBat === 2) bat.doubles++;
      if (b.runsOffBat === 3) bat.triples++;
      if (b.runsOffBat === 4) bat.fours++;
      if (b.runsOffBat === 6) bat.sixes++;
      bat.highest_score = Math.max(bat.highest_score, bat.runs);
      bat.strike_rate = bat.balls > 0 ? (bat.runs / bat.balls) * 100 : 0.0;

      if (b.wicket && b.dismissedPlayerId) {
        const outBat = getBatting(b.dismissedPlayerId, b.inningsNo);
        outBat.is_out = 1;
        outBat.dismissal_type = b.wicketType;
        outBat.bowler_id = b.bowlerId;
      }

      // Milestone Detection: Batting
      const milestonesToCheck = [30, 50, 100, 150, 200];
      for (const val of milestonesToCheck) {
        if (bat.runs >= val && (bat.runs - b.runsOffBat) < val) {
          milestones.push({
            id: crypto.randomUUID(),
            match_id: matchId,
            innings_no: b.inningsNo,
            player_id: b.strikerId,
            milestone_type: 'batting_runs',
            value: val,
            timestamp: b.timestamp
          });
          eventBus.publish('BatterMilestoneReached', { matchId, playerId: b.strikerId, milestone: val });
        }
      }

      // B. Bowling Stats
      const bowl = getBowling(b.bowlerId, b.inningsNo);
      let runsConceded = b.runsOffBat;
      if (b.extraType === 'wide' || b.extraType === 'no_ball') {
        runsConceded += b.extras;
        if (b.extraType === 'wide') bowl.wides += b.extras;
        if (b.extraType === 'no_ball') bowl.noballs += b.extras;
      }
      bowl.runs_conceded += runsConceded;
      if (isLegal) {
        bowl.legal_balls++;
      }
      if (runsConceded === 0) {
        bowl.dot_balls++;
      }
      if (b.runsOffBat === 4) bowl.fours_conceded++;
      if (b.runsOffBat === 6) bowl.sixes_conceded++;

      const isBowlerWicket = b.wicket && b.wicketType !== 'run_out' && b.wicketType !== 'retired_out' && b.wicketType !== 'retired_hurt';
      if (isBowlerWicket) {
        bowl.wickets++;
      }

      bowl.overs = `${Math.floor(bowl.legal_balls / 6)}.${bowl.legal_balls % 6}`;
      bowl.economy = bowl.legal_balls > 0 ? (bowl.runs_conceded / (bowl.legal_balls / 6)) : 0.0;
      bowl.bowling_average = bowl.wickets > 0 ? bowl.runs_conceded / bowl.wickets : 0.0;
      bowl.strike_rate = bowl.wickets > 0 ? bowl.legal_balls / bowl.wickets : 0.0;

      // Milestone Detection: Bowling
      const bowlMilestones = [3, 5];
      for (const val of bowlMilestones) {
        if (bowl.wickets === val && isBowlerWicket) {
          milestones.push({
            id: crypto.randomUUID(),
            match_id: matchId,
            innings_no: b.inningsNo,
            player_id: b.bowlerId,
            milestone_type: 'bowling_wickets',
            value: val,
            timestamp: b.timestamp
          });
          eventBus.publish('BowlerMilestoneReached', { matchId, playerId: b.bowlerId, milestone: val });
        }
      }

      // C. Fielding Stats
      if (b.wicket && b.wicketType) {
        // Parse metadata to extract fielder/keeper if present
        let caughtById: string | null = null;
        try {
          const parsed = b.metadata ? JSON.parse(b.metadata) : null;
          caughtById = parsed?.caught_by_id || null;
        } catch {
          // ignore parsing error
        }

        if (caughtById) {
          const fld = getFielding(caughtById, b.inningsNo);
          if (b.wicketType === 'caught') fld.catches++;
          if (b.wicketType === 'stumped') fld.stumpings++;
          if (b.wicketType === 'run_out') fld.run_outs++;
        }
      }

      // D. Partnership Stats
      if (!activePartnership) {
        activePartnership = {
          batsman1: b.strikerId,
          batsman2: b.nonStrikerId,
          runs: 0,
          balls: 0,
          inningsNo: b.inningsNo
        };
      }

      // Increment partnership
      activePartnership.runs += b.runsOffBat + b.extras;
      if (isLegal) {
        activePartnership.balls++;
      }

      // Milestone Detection: Partnership
      const partMilestones = [25, 50, 100];
      for (const val of partMilestones) {
        if (activePartnership.runs >= val && (activePartnership.runs - (b.runsOffBat + b.extras)) < val) {
          eventBus.publish('PartnershipMilestoneReached', { matchId, runs: val });
        }
      }

      if (b.wicket) {
        // Active partnership is broken
        completedPartnerships.push({
          ...activePartnership,
          active: 0
        });
        activePartnership = null;
      }
    }

    // Save final active partnership if exists
    if (activePartnership) {
      completedPartnerships.push({
        ...activePartnership,
        active: 1
      });
    }

    // 5. Insert all stats to SQLite
    for (const bat of Object.values(batting)) {
      await db.run(
        `INSERT INTO v2_player_match_stats (id, match_id, innings_no, player_id, runs, balls, fours, sixes, strike_rate, dot_balls, singles, doubles, triples, highest_score, is_out, dismissal_type, bowler_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          bat.id, bat.match_id, bat.innings_no, bat.player_id, bat.runs, bat.balls, bat.fours, bat.sixes, bat.strike_rate,
          bat.dot_balls, bat.singles, bat.doubles, bat.triples, bat.highest_score, bat.is_out, bat.dismissal_type, bat.bowler_id
        ]
      );
    }

    for (const bowl of Object.values(bowling)) {
      await db.run(
        `INSERT INTO v2_bowler_match_stats (id, match_id, innings_no, player_id, overs, runs_conceded, wickets, economy, maidens, dot_balls, wides, noballs, fours_conceded, sixes_conceded, bowling_average, strike_rate)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          bowl.id, bowl.match_id, bowl.innings_no, bowl.player_id, bowl.overs, bowl.runs_conceded, bowl.wickets, bowl.economy,
          bowl.maidens, bowl.dot_balls, bowl.wides, bowl.noballs, bowl.fours_conceded, bowl.sixes_conceded, bowl.bowling_average, bowl.strike_rate
        ]
      );
    }

    for (const fld of Object.values(fielding)) {
      await db.run(
        `INSERT INTO v2_fielding_match_stats (id, match_id, innings_no, player_id, catches, run_outs, stumpings, direct_hits, assists)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [fld.id, fld.match_id, fld.innings_no, fld.player_id, fld.catches, fld.run_outs, fld.stumpings, fld.direct_hits, fld.assists]
      );
    }

    for (let idx = 0; idx < completedPartnerships.length; idx++) {
      const p = completedPartnerships[idx];
      const partId = `${matchId}_part_${p.inningsNo}_${idx}`;
      await db.run(
        `INSERT INTO v2_partnerships (id, match_id, innings_no, batsman1_id, batsman2_id, runs, balls, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [partId, matchId, p.inningsNo, p.batsman1, p.batsman2, p.runs, p.balls, p.active]
      );
    }

    for (const m of milestones) {
      await db.run(
        `INSERT INTO v2_milestone_events (id, match_id, innings_no, player_id, milestone_type, value, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [m.id, m.match_id, m.innings_no, m.player_id, m.milestone_type, m.value, m.timestamp]
      );
    }

    eventBus.publish('StatisticsUpdated', { matchId });
  }
}
