import { sqliteService } from '@/lib/services/sqliteService';
import { BallEventV2 } from '../models/ballEvent';
import { MatchSnapshotV2 } from '../models/matchSnapshot';

export class MatchRepository {
  static async getMatch(id: string): Promise<any> {
    const rows = await sqliteService.query("SELECT * FROM v2_matches WHERE id = ?;", [id]);
    return rows[0] || null;
  }

  static async saveMatch(match: any, db?: any): Promise<void> {
    const executor = db || sqliteService;
    await executor.run(
      `INSERT INTO v2_matches (id, team_a_id, team_b_id, overs, wide_run, noball_run, match_type, ground, match_date, status, result, batting_first_id, current_innings, last_man_batting, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         status = excluded.status,
         result = excluded.result,
         current_innings = excluded.current_innings;`,
      [
        match.id,
        match.team_a_id,
        match.team_b_id,
        match.overs,
        match.wide_run,
        match.noball_run,
        match.match_type,
        match.ground,
        match.match_date,
        match.status,
        match.result,
        match.batting_first_id,
        match.current_innings,
        match.last_man_batting,
        match.created_by
      ]
    );
  }
}

export class BallRepository {
  static async getBallsForMatch(matchId: string): Promise<BallEventV2[]> {
    const rows = await sqliteService.query(
      "SELECT * FROM v2_ball_events WHERE match_id = ? AND is_superseded = 0 ORDER BY sequence_number ASC;",
      [matchId]
    );
    return rows.map((r) => ({
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
      metadata: r.metadata,
      supersededBy: r.superseded_by,
      isSuperseded: r.is_superseded === 1
    }));
  }

  static async saveBall(ball: BallEventV2, db?: any): Promise<void> {
    const executor = db || sqliteService;
    await executor.run(
      `INSERT INTO v2_ball_events (
         event_uuid, match_id, innings_no, over_no, ball_no, striker_id, non_striker_id, bowler_id,
         runs_off_bat, extras, extra_type, wicket, wicket_type, dismissed_player_id, timestamp, device_id,
         sequence_number, version, metadata, superseded_by, is_superseded
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(event_uuid) DO UPDATE SET
         runs_off_bat = excluded.runs_off_bat,
         extras = excluded.extras,
         wicket = excluded.wicket,
         version = excluded.version + 1,
         metadata = excluded.metadata,
         superseded_by = excluded.superseded_by,
         is_superseded = excluded.is_superseded;`,
      [
        ball.eventUuid,
        ball.matchId,
        ball.inningsNo,
        ball.overNo,
        ball.ballNo,
        ball.strikerId,
        ball.nonStrikerId,
        ball.bowlerId,
        ball.runsOffBat,
        ball.extras,
        ball.extraType,
        ball.wicket ? 1 : 0,
        ball.wicketType,
        ball.dismissedPlayerId,
        ball.timestamp,
        ball.deviceId,
        ball.sequenceNumber,
        ball.version,
        ball.metadata || null,
        ball.supersededBy || null,
        ball.isSuperseded ? 1 : 0
      ]
    );
  }
}

export class SnapshotRepository {
  static async getSnapshot(matchId: string): Promise<MatchSnapshotV2 | null> {
    const rows = await sqliteService.query("SELECT * FROM v2_match_snapshots WHERE match_id = ?;", [matchId]);
    const r = rows[0];
    if (!r) return null;
    return {
      matchId: r.match_id,
      inningsNo: r.innings_no,
      teamScore: r.team_score,
      wickets: r.wickets,
      overs: r.overs,
      balls: r.balls,
      legalDeliveries: r.legal_deliveries,
      extras: r.extras,
      boundaries: r.boundaries,
      sixes: r.sixes,
      currentBatterId: r.current_batter_id,
      nonStrikerId: r.non_striker_id,
      currentBowlerId: r.current_bowler_id,
      partnershipRuns: r.partnership_runs,
      partnershipBalls: r.partnership_balls,
      currentOverNo: r.current_over_no,
      ballsRemainingInOver: r.balls_remaining_in_over,
      currentRunRate: r.current_run_rate,
      requiredRunRate: r.required_run_rate,
      target: r.target,
      runsRequired: r.runs_required,
      ballsRemaining: r.balls_remaining,
      projectedScore: r.projected_score,
      inningsStatus: r.innings_status,
      matchStatus: r.match_status
    };
  }

  static async saveSnapshot(snap: MatchSnapshotV2, db?: any): Promise<void> {
    const executor = db || sqliteService;
    await executor.run(
      `INSERT INTO v2_match_snapshots (
         match_id, innings_no, team_score, wickets, overs, balls, legal_deliveries, extras, boundaries, sixes,
         current_batter_id, non_striker_id, current_bowler_id, partnership_runs, partnership_balls,
         current_over_no, balls_remaining_in_over, current_run_rate, required_run_rate, target, runs_required,
         balls_remaining, projected_score, innings_status, match_status
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(match_id) DO UPDATE SET
         innings_no = excluded.innings_no,
         team_score = excluded.team_score,
         wickets = excluded.wickets,
         overs = excluded.overs,
         balls = excluded.balls,
         legal_deliveries = excluded.legal_deliveries,
         extras = excluded.extras,
         boundaries = excluded.boundaries,
         sixes = excluded.sixes,
         current_batter_id = excluded.current_batter_id,
         non_striker_id = excluded.non_striker_id,
         current_bowler_id = excluded.current_bowler_id,
         partnership_runs = excluded.partnership_runs,
         partnership_balls = excluded.partnership_balls,
         current_over_no = excluded.current_over_no,
         balls_remaining_in_over = excluded.balls_remaining_in_over,
         current_run_rate = excluded.current_run_rate,
         required_run_rate = excluded.required_run_rate,
         target = excluded.target,
         runs_required = excluded.runs_required,
         balls_remaining = excluded.balls_remaining,
         projected_score = excluded.projected_score,
         innings_status = excluded.innings_status,
         match_status = excluded.match_status,
         updated_at = CURRENT_TIMESTAMP;`,
      [
        snap.matchId,
        snap.inningsNo,
        snap.teamScore,
        snap.wickets,
        snap.overs,
        snap.balls,
        snap.legalDeliveries,
        snap.extras,
        snap.boundaries,
        snap.sixes,
        snap.currentBatterId,
        snap.nonStrikerId,
        snap.currentBowlerId,
        snap.partnershipRuns,
        snap.partnershipBalls,
        snap.currentOverNo,
        snap.ballsRemainingInOver,
        snap.currentRunRate,
        snap.requiredRunRate,
        snap.target,
        snap.runsRequired,
        snap.ballsRemaining,
        snap.projectedScore,
        snap.inningsStatus,
        snap.matchStatus
      ]
    );
  }
}

export class PlayerStatsRepository {
  static async getPlayerStats(matchId: string, playerId: string): Promise<any> {
    const rows = await sqliteService.query(
      "SELECT * FROM v2_player_match_stats WHERE match_id = ? AND player_id = ?;",
      [matchId, playerId]
    );
    return rows[0] || null;
  }

  static async getBowlerStats(matchId: string, playerId: string): Promise<any> {
    const rows = await sqliteService.query(
      "SELECT * FROM v2_bowler_match_stats WHERE match_id = ? AND player_id = ?;",
      [matchId, playerId]
    );
    return rows[0] || null;
  }
}
