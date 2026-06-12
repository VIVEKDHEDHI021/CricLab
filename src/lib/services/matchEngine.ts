export interface BallEventData {
  event_uuid: string;
  event_type: 'BALL_EVENT' | 'UNDO_EVENT' | 'CORRECTION_EVENT' | 'WICKET_EVENT' | 'BATTER_RETIRED' | 'EXTRA_EVENT' | 'INNINGS_ENDED' | 'MATCH_ENDED' | 'PLAYER_SUBSTITUTED';
  sequence_number: number;
  match_id: string;
  innings_no: number;
  over_no?: number | null;
  ball_no?: number | null;
  striker_id?: string | null;
  non_striker_id?: string | null;
  bowler_id?: string | null;
  batting_team_id?: string | null;
  bowling_team_id?: string | null;
  runs_off_bat: number;
  extras: number;
  extra_type?: 'wide' | 'no_ball' | 'bye' | 'leg_bye' | null;
  wicket: boolean;
  wicket_type?: string | null;
  dismissed_player_id?: string | null;
  legal_delivery: boolean;
  scorer_id?: string | null;
  device_timestamp: number;
  metadata?: any;
}

export interface DerivedMatchState {
  match_id: string;
  status: 'upcoming' | 'live' | 'past' | 'locked';
  current_innings: number;
  result: string | null;
  batting_first_id: string | null;
  squad_a_ids: string[];
  squad_b_ids: string[];
  overs_limit: number;
  wide_run: number;
  noball_run: number;
  last_man_batting: boolean;
  innings: Record<number, {
    innings_no: number;
    batting_team_id: string;
    bowling_team_id: string;
    runs: number;
    wickets: number;
    legal_balls: number;
    is_closed: boolean;
    wides: number;
    noballs: number;
    byes: number;
    legbyes: number;
  }>;
  balls: Array<{
    id: string;
    innings_no: number;
    ball_index: number;
    over_number: number;
    ball_in_over: number;
    batter_id: string | null;
    non_striker_id: string | null;
    bowler_id: string | null;
    runs: number;
    extra_runs: number;
    extra_type: string | null;
    is_wicket: boolean;
    wicket_type: string | null;
    is_legal: boolean;
    caught_by_id: string | null;
  }>;
  batter_states: Record<string, {
    runs: number;
    balls: number;
    fours: number;
    sixes: number;
    is_out: boolean;
    wicket_type: string | null;
    dismissed_by: string | null;
  }>;
  bowler_states: Record<string, {
    runs_conceded: number;
    legal_balls: number;
    wickets: number;
    maidens: number;
    overs_conceded: Record<number, number>;
  }>;
  partnerships: Record<number, Array<{
    batsman1: string;
    batsman2: string;
    runs: number;
    balls: number;
    active: boolean;
  }>>;
  active_striker: string | null;
  active_non_striker: string | null;
  active_bowler: string | null;
  retired_hurt_player_ids: string[];
}

export const matchEngine = {
  replay(
    rawEvents: BallEventData[],
    initialMatch: {
      id: string;
      team_a_id: string;
      team_b_id: string;
      team_a_name?: string;
      team_b_name?: string;
      batting_first_id: string | null;
      overs: number;
      wide_run: number;
      noball_run: number;
      last_man_batting: boolean;
      squad_a_ids?: string[];
      squad_b_ids?: string[];
    }
  ): DerivedMatchState {
    // 1. Fetch & Preprocess Events
    const sortedRaw = [...rawEvents].sort((a, b) => a.sequence_number - b.sequence_number);

    // Identify undone target event UUIDs
    const undoneUuids = sortedRaw
      .filter((e) => e.event_type === 'UNDO_EVENT')
      .map((e) => e.metadata?.target_event_uuid)
      .filter(Boolean) as string[];

    // Identify corrections
    const corrections: Record<string, any> = {};
    for (const event of sortedRaw) {
      if (event.event_type === 'CORRECTION_EVENT') {
        const targetUuid = event.metadata?.target_event_uuid;
        if (targetUuid) {
          corrections[targetUuid] = event.metadata;
        }
      }
    }

    // Filter active events: omit UNDOs, CORRECTIONs, and undone target events
    const activeEvents = sortedRaw.filter(
      (e) => !undoneUuids.includes(e.event_uuid) && 
             e.event_type !== 'UNDO_EVENT' && 
             e.event_type !== 'CORRECTION_EVENT'
    );

    // Apply corrections inline
    const events = activeEvents.map((e) => {
      const corr = corrections[e.event_uuid];
      if (corr) {
        return {
          ...e,
          ...corr
        };
      }
      return e;
    });

    // 2. Initialize Replay State
    const teamAId = initialMatch.team_a_id;
    const teamBId = initialMatch.team_b_id;
    const battingTeamId = initialMatch.batting_first_id ?? teamAId;
    const bowlingTeamId = battingTeamId === teamAId ? teamBId : teamAId;

    const state: DerivedMatchState = {
      match_id: initialMatch.id,
      status: 'live',
      current_innings: 1,
      result: null,
      batting_first_id: initialMatch.batting_first_id,
      squad_a_ids: initialMatch.squad_a_ids ?? [],
      squad_b_ids: initialMatch.squad_b_ids ?? [],
      overs_limit: initialMatch.overs,
      wide_run: initialMatch.wide_run,
      noball_run: initialMatch.noball_run,
      last_man_batting: initialMatch.last_man_batting,
      innings: {
        1: {
          innings_no: 1,
          batting_team_id: battingTeamId,
          bowling_team_id: bowlingTeamId,
          runs: 0,
          wickets: 0,
          legal_balls: 0,
          is_closed: false,
          wides: 0,
          noballs: 0,
          byes: 0,
          legbyes: 0
        }
      },
      balls: [],
      batter_states: {},
      bowler_states: {},
      partnerships: {},
      active_striker: null,
      active_non_striker: null,
      active_bowler: null,
      retired_hurt_player_ids: []
    };

    let currentInningsNo = 1;
    let targetRuns: number | null = null;

    // 3. Process Events
    for (const event of events) {
      if (event.event_type === 'INNINGS_ENDED') {
        state.innings[currentInningsNo].is_closed = true;
        if (currentInningsNo === 1) {
          currentInningsNo = 2;
          targetRuns = state.innings[1].runs + 1;
          state.innings[2] = {
            innings_no: 2,
            batting_team_id: state.innings[1].bowling_team_id,
            bowling_team_id: state.innings[1].batting_team_id,
            runs: 0,
            wickets: 0,
            legal_balls: 0,
            is_closed: false,
            wides: 0,
            noballs: 0,
            byes: 0,
            legbyes: 0
          };
          state.active_striker = null;
          state.active_non_striker = null;
          state.active_bowler = null;
        }
        continue;
      }

      if (event.event_type === 'MATCH_ENDED') {
        state.status = 'past';
        state.result = event.metadata?.result ?? 'Match Finished';
        break;
      }

      if (event.event_type === 'PLAYER_SUBSTITUTED') {
        const oldId = event.metadata?.old_player_id;
        const newId = event.metadata?.new_player_id;
        if (oldId && newId) {
          if (state.active_striker === oldId) state.active_striker = newId;
          if (state.active_non_striker === oldId) state.active_non_striker = newId;
          if (state.active_bowler === oldId) state.active_bowler = newId;

          // Squad substitute
          const idxA = state.squad_a_ids.indexOf(oldId);
          if (idxA > -1) state.squad_a_ids[idxA] = newId;
          const idxB = state.squad_b_ids.indexOf(oldId);
          if (idxB > -1) state.squad_b_ids[idxB] = newId;
        }
        continue;
      }

      if (event.event_type === 'BATTER_RETIRED') {
        const pId = event.metadata?.player_id;
        const type = event.metadata?.retired_type ?? 'retired_hurt';
        if (pId) {
          if (type === 'retired_out') {
            state.innings[currentInningsNo].wickets++;
            if (!state.batter_states[pId]) {
              state.batter_states[pId] = { runs: 0, balls: 0, fours: 0, sixes: 0, is_out: false, wicket_type: null, dismissed_by: null };
            }
            state.batter_states[pId].is_out = true;
            state.batter_states[pId].wicket_type = 'retired_out';

            this.endPartnership(state, currentInningsNo, pId);

            if (state.active_striker === pId) state.active_striker = null;
            if (state.active_non_striker === pId) state.active_non_striker = null;
          } else {
            state.retired_hurt_player_ids.push(pId);
            this.endPartnership(state, currentInningsNo, pId);
            if (state.active_striker === pId) state.active_striker = null;
            if (state.active_non_striker === pId) state.active_non_striker = null;
          }
        }
        continue;
      }

      if (event.event_type === 'BALL_EVENT') {
        const inn = state.innings[currentInningsNo];

        if (!state.active_striker && event.striker_id) state.active_striker = event.striker_id;
        if (!state.active_non_striker && event.non_striker_id) state.active_non_striker = event.non_striker_id;
        if (!state.active_bowler && event.bowler_id) state.active_bowler = event.bowler_id;

        const strikerId = state.active_striker;
        const nonStrikerId = state.active_non_striker;
        const bowlerId = state.active_bowler;

        if (strikerId && !state.batter_states[strikerId]) {
          state.batter_states[strikerId] = { runs: 0, balls: 0, fours: 0, sixes: 0, is_out: false, wicket_type: null, dismissed_by: null };
        }
        if (nonStrikerId && !state.batter_states[nonStrikerId]) {
          state.batter_states[nonStrikerId] = { runs: 0, balls: 0, fours: 0, sixes: 0, is_out: false, wicket_type: null, dismissed_by: null };
        }
        if (bowlerId && !state.bowler_states[bowlerId]) {
          state.bowler_states[bowlerId] = { runs_conceded: 0, legal_balls: 0, wickets: 0, maidens: 0, overs_conceded: {} };
        }

        const runsOffBat = event.runs_off_bat;
        const extras = event.extras;
        const isLegal = event.legal_delivery;
        const extraType = event.extra_type;

        const ballRuns = runsOffBat + extras;
        inn.runs += ballRuns;

        if (isLegal) {
          inn.legal_balls++;
        }

        if (extraType === 'wide') {
          inn.wides += extras;
        } else if (extraType === 'no_ball') {
          inn.noballs += extras;
        } else if (extraType === 'bye') {
          inn.byes += extras;
        } else if (extraType === 'leg_bye') {
          inn.legbyes += extras;
        }

        if (strikerId && extraType !== 'wide') {
          state.batter_states[strikerId].balls++;
          state.batter_states[strikerId].runs += runsOffBat;
          if (runsOffBat === 4) state.batter_states[strikerId].fours++;
          if (runsOffBat === 6) state.batter_states[strikerId].sixes++;
        }

        if (bowlerId) {
          const conceded = runsOffBat + (extraType === 'wide' || extraType === 'no_ball' ? extras : 0);
          state.bowler_states[bowlerId].runs_conceded += conceded;
          if (isLegal) {
            state.bowler_states[bowlerId].legal_balls++;
          }

          const overNo = event.over_no ?? Math.floor((inn.legal_balls - (isLegal ? 1 : 0)) / 6);
          if (!state.bowler_states[bowlerId].overs_conceded[overNo]) {
            state.bowler_states[bowlerId].overs_conceded[overNo] = 0;
          }
          state.bowler_states[bowlerId].overs_conceded[overNo] += conceded;
        }

        if (strikerId && nonStrikerId) {
          this.updatePartnership(state, currentInningsNo, strikerId, nonStrikerId, ballRuns, isLegal);
        }

        const isWicket = event.wicket;
        const wicketType = event.wicket_type;
        const dismissedId = event.dismissed_player_id ?? (isWicket ? strikerId : null);

        if (isWicket) {
          inn.wickets++;
          if (dismissedId) {
            if (!state.batter_states[dismissedId]) {
              state.batter_states[dismissedId] = { runs: 0, balls: 0, fours: 0, sixes: 0, is_out: false, wicket_type: null, dismissed_by: null };
            }
            state.batter_states[dismissedId].is_out = true;
            state.batter_states[dismissedId].wicket_type = wicketType ?? null;
            state.batter_states[dismissedId].dismissed_by = bowlerId;
          }

          if (bowlerId && wicketType !== 'run_out' && wicketType !== 'retired_hurt' && wicketType !== 'retired_out') {
            state.bowler_states[bowlerId].wickets++;
          }

          if (dismissedId) {
            this.endPartnership(state, currentInningsNo, dismissedId);
          }

          if (dismissedId === state.active_striker) {
            state.active_striker = null;
          } else if (dismissedId === state.active_non_striker) {
            state.active_non_striker = null;
          }
        }

        const runsToSwap = extraType === 'bye' || extraType === 'leg_bye' ? extras : runsOffBat;
        if (runsToSwap % 2 === 1 && state.active_striker && state.active_non_striker) {
          const temp = state.active_striker;
          state.active_striker = state.active_non_striker;
          state.active_non_striker = temp;
        }

        const isOverEnd = isLegal && inn.legal_balls % 6 === 0;
        if (isOverEnd && state.active_striker && state.active_non_striker) {
          const temp = state.active_striker;
          state.active_striker = state.active_non_striker;
          state.active_non_striker = temp;
          state.active_bowler = null;
        }

        state.balls.push({
          id: event.event_uuid,
          innings_no: currentInningsNo,
          ball_index: state.balls.length,
          over_number: Math.floor((inn.legal_balls - (isLegal ? 1 : 0)) / 6),
          ball_in_over: ((inn.legal_balls - (isLegal ? 1 : 0)) % 6) + 1,
          batter_id: strikerId,
          non_striker_id: nonStrikerId,
          bowler_id: bowlerId,
          runs: runsOffBat,
          extra_runs: extras,
          extra_type: extraType ?? null,
          is_wicket: isWicket,
          wicket_type: wicketType ?? null,
          is_legal: isLegal,
          caught_by_id: event.metadata?.caught_by_id ?? null
        });

        // Auto Innings & Match Transitions
        const battingTeamId = inn.batting_team_id;
        const battingSquad = battingTeamId === teamAId ? state.squad_a_ids : state.squad_b_ids;
        const squadCount = battingSquad.length || 11;
        const maxWickets = state.last_man_batting ? squadCount : squadCount - 1;

        if (currentInningsNo === 1) {
          if (inn.legal_balls >= state.overs_limit * 6 || inn.wickets >= maxWickets) {
            inn.is_closed = true;
            currentInningsNo = 2;
            targetRuns = inn.runs + 1;
            state.innings[2] = {
              innings_no: 2,
              batting_team_id: inn.bowling_team_id,
              bowling_team_id: inn.batting_team_id,
              runs: 0,
              wickets: 0,
              legal_balls: 0,
              is_closed: false,
              wides: 0,
              noballs: 0,
              byes: 0,
              legbyes: 0
            };
            state.active_striker = null;
            state.active_non_striker = null;
            state.active_bowler = null;
          }
        } else {
          const target = targetRuns ?? (state.innings[1].runs + 1);
          if (inn.runs >= target) {
            inn.is_closed = true;
            state.status = 'past';
            const wicketsLeft = Math.max(0, maxWickets - inn.wickets);
            const chasingTeamName = inn.batting_team_id === teamAId ? (initialMatch.team_a_name ?? 'Second Team') : (initialMatch.team_b_name ?? 'Second Team');
            state.result = `${chasingTeamName} won by ${wicketsLeft} wicket${wicketsLeft === 1 ? '' : 's'}`;
            break;
          } else if (inn.wickets >= maxWickets || inn.legal_balls >= state.overs_limit * 6) {
            inn.is_closed = true;
            state.status = 'past';
            if (inn.runs === target - 1) {
              state.result = 'Match tied';
            } else {
              const diff = (target - 1) - inn.runs;
              const defendingTeamName = state.innings[1].batting_team_id === teamAId ? (initialMatch.team_a_name ?? 'First Team') : (initialMatch.team_b_name ?? 'First Team');
              state.result = `${defendingTeamName} won by ${diff} run${diff === 1 ? '' : 's'}`;
            }
            break;
          }
        }
      }
    }

    if (state.status === 'past') {
      if (!state.result) {
        state.result = 'No result';
      }
      Object.keys(state.innings).forEach((k) => {
        state.innings[Number(k)].is_closed = true;
      });
    }

    // Bowler maidens calculation
    Object.keys(state.bowler_states).forEach((bId) => {
      const bowler = state.bowler_states[bId];
      let maidens = 0;
      Object.keys(bowler.overs_conceded).forEach((oNumKey) => {
        const oNum = Number(oNumKey);
        const legalBallsBowled = state.balls.filter(
          (b) => b.bowler_id === bId && b.over_number === oNum && b.is_legal
        ).length;
        if (legalBallsBowled >= 6 && bowler.overs_conceded[oNum] === 0) {
          maidens++;
        }
      });
      bowler.maidens = maidens;
    });

    return state;
  },

  updatePartnership(state: DerivedMatchState, innNo: number, b1: string, b2: string, runs: number, isLegal: boolean) {
    if (!state.partnerships[innNo]) {
      state.partnerships[innNo] = [];
    }

    let found = false;
    for (const p of state.partnerships[innNo]) {
      if (p.active && ((p.batsman1 === b1 && p.batsman2 === b2) || (p.batsman1 === b2 && p.batsman2 === b1))) {
        p.runs += runs;
        if (isLegal) p.balls++;
        found = true;
        break;
      }
    }

    if (!found) {
      for (const p of state.partnerships[innNo]) {
        p.active = false;
      }
      state.partnerships[innNo].push({
        batsman1: b1,
        batsman2: b2,
        runs: runs,
        balls: isLegal ? 1 : 0,
        active: true
      });
    }
  },

  endPartnership(state: DerivedMatchState, innNo: number, dismissedId: string) {
    if (!state.partnerships[innNo]) return;
    for (const p of state.partnerships[innNo]) {
      if (p.active && (p.batsman1 === dismissedId || p.batsman2 === dismissedId)) {
        p.active = false;
      }
    }
  }
};
