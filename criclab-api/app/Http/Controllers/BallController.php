<?php

namespace App\Http\Controllers;

use App\Models\Ball;
use App\Models\Innings;
use App\Models\CricketMatch;
use App\Models\Player;
use App\Models\Team;
use Illuminate\Http\Request;

class BallController extends Controller
{
    public static function recalculateInnings($inningsId)
    {
        $balls = Ball::where('innings_id', $inningsId)->orderBy('ball_index')->get();
        $innings = Innings::findOrFail($inningsId);
        $match = CricketMatch::findOrFail($innings->match_id);

        if ($balls->isEmpty()) {
            $innings->update([
                'runs' => 0,
                'wickets' => 0,
                'legal_balls' => 0,
                'is_closed' => false,
            ]);
            return;
        }

        // Initialize strikers from the first ball
        $firstBall = $balls->first();
        $striker = $firstBall->batter_id;
        $non_striker = $firstBall->non_striker_id;

        $legal_balls_count = 0;

        foreach ($balls as $index => $ball) {
            // Update ball index, over number, and ball in over
            $over_number = floor($legal_balls_count / 6);
            $ball_in_over = ($legal_balls_count % 6) + 1;

            $ball->ball_index = $index;
            $ball->over_number = $over_number;
            $ball->ball_in_over = $ball_in_over;

            // Recalculate striker/non-striker for this ball based on previous ball outcome
            if ($index > 0) {
                $prevBall = $balls[$index - 1];

                if ($prevBall->is_wicket) {
                    $dismissed_id = $prevBall->batter_id;
                    $surviving_id = $prevBall->non_striker_id;

                    $new_batter = null;
                    if ($surviving_id === null) {
                        $new_batter = $ball->batter_id;
                    } else {
                        if ($ball->batter_id !== $surviving_id) {
                            $new_batter = $ball->batter_id;
                        } elseif ($ball->non_striker_id !== $surviving_id) {
                            $new_batter = $ball->non_striker_id;
                        }
                    }

                    if ($dismissed_id === $striker) {
                        $striker = $new_batter;
                        $non_striker = $surviving_id;
                    } elseif ($dismissed_id === $non_striker) {
                        $non_striker = $new_batter;
                        $striker = $surviving_id;
                    } else {
                        if ($striker === null || $striker === '') {
                            $striker = $new_batter;
                        } else {
                            $non_striker = $new_batter;
                        }
                    }
                } else {
                    $runs_odd = ($prevBall->runs % 2 === 1);
                    $extras_odd = in_array($prevBall->extra_type, ['bye', 'leg_bye']) && ($prevBall->extra_runs % 2 === 1);
                    $should_swap_runs = $runs_odd || $extras_odd;

                    $should_swap_over = $prevBall->is_legal && (($legal_balls_count) % 6 === 0);

                    if ($should_swap_runs !== $should_swap_over) {
                        if ($striker !== null && $non_striker !== null) {
                            $temp = $striker;
                            $striker = $non_striker;
                            $non_striker = $temp;
                        }
                    }
                }
            }

            // Assign recalculated roles to the current ball
            if ($ball->is_wicket) {
                if ($ball->wicket_type === 'run_out' && $ball->non_striker_id === $striker) {
                    $ball->batter_id = $non_striker;
                    $ball->non_striker_id = $striker;
                } else {
                    $ball->batter_id = $striker;
                    $ball->non_striker_id = $non_striker;
                }
            } else {
                $ball->batter_id = $striker;
                $ball->non_striker_id = $non_striker;
            }

            $ball->save();

            if ($ball->is_legal) {
                $legal_balls_count++;
            }
        }

        // Calculate Innings totals
        $totalRuns = 0;
        $totalWickets = 0;
        $totalLegal = 0;

        foreach ($balls as $b) {
            $totalRuns += ($b->runs + $b->extra_runs);
            if ($b->is_wicket) {
                $totalWickets++;
            }
            if ($b->is_legal) {
                $totalLegal++;
            }
        }

        $battingPlayersCount = Player::where('team_id', $innings->batting_team_id)->count();
        $isLastMan = $match->last_man_batting;
        $maxWickets = $battingPlayersCount > 0 
            ? ($isLastMan ? $battingPlayersCount : $battingPlayersCount - 1) 
            : 10;
        if ($maxWickets <= 0) $maxWickets = 10;

        $isClosed = false;
        if ($totalLegal >= $match->overs * 6 || $totalWickets >= $maxWickets || $totalWickets >= 10) {
            $isClosed = true;
        }

        if ($innings->innings_no === 2) {
            $firstInnings = Innings::where('match_id', $match->id)
                ->where('innings_no', 1)
                ->first();

            if ($firstInnings) {
                if ($totalRuns > $firstInnings->runs) {
                    $isClosed = true;

                    $chasingTeam = Team::find($innings->batting_team_id);
                    $wicketsRemaining = $isLastMan 
                        ? ($battingPlayersCount - $totalWickets) 
                        : (($battingPlayersCount > 0 ? $battingPlayersCount - 1 : 10) - $totalWickets);
                    
                    if ($wicketsRemaining < 0) $wicketsRemaining = 0;
                    
                    $result = ($chasingTeam->name ?? 'Second Team') . ' won by ' . $wicketsRemaining . ' ' . ($wicketsRemaining === 1 ? 'wicket' : 'wickets');
                    
                    $match->update([
                        'status' => 'past',
                        'result' => $result,
                    ]);
                    $match->innings()->update(['is_closed' => true]);
                } elseif ($isClosed) {
                    $defendingTeam = Team::find($firstInnings->batting_team_id);
                    
                    if ($totalRuns === $firstInnings->runs) {
                        $result = 'Match tied';
                    } else {
                        $result = ($defendingTeam->name ?? 'First Team') . ' won by ' . ($firstInnings->runs - $totalRuns) . ' runs';
                    }
                    
                    $match->update([
                        'status' => 'past',
                        'result' => $result,
                    ]);
                    $match->innings()->update(['is_closed' => true]);
                }
            }
        }

        if (!$isClosed && $innings->is_closed) {
            if ($match->status === 'past') {
                $match->update([
                    'status' => 'live',
                    'result' => null,
                ]);
            }
        }

        $innings->update([
            'runs' => $totalRuns,
            'wickets' => $totalWickets,
            'legal_balls' => $totalLegal,
            'is_closed' => $isClosed,
        ]);
    }

    public function store(Request $request, $inningsId)
    {
        $request->validate([
            'match_id' => 'required|uuid|exists:matches,id',
            'ball_index' => 'required|integer',
            'over_number' => 'required|integer',
            'ball_in_over' => 'required|integer',
            'batter_id' => 'required|uuid|exists:players,id',
            'non_striker_id' => 'nullable|uuid|exists:players,id',
            'bowler_id' => 'required|uuid|exists:players,id',
            'runs' => 'required|integer',
            'extra_runs' => 'required|integer',
            'extra_type' => 'nullable|string',
            'is_wicket' => 'required|boolean',
            'wicket_type' => 'nullable|string',
            'is_legal' => 'required|boolean',
            'caught_by_id' => 'nullable|uuid|exists:players,id',
        ]);

        $innings = Innings::findOrFail($inningsId);
        $match = CricketMatch::findOrFail($request->match_id);

        if ($request->user()->role !== 'admin' && $match->created_by !== $request->user()->id) {
            return response()->json(['message' => 'You are not authorized to score this match.'], 403);
        }

        $ball = Ball::create([
            'innings_id' => $inningsId,
            'match_id' => $request->match_id,
            'ball_index' => $request->ball_index,
            'over_number' => $request->over_number,
            'ball_in_over' => $request->ball_in_over,
            'batter_id' => $request->batter_id,
            'non_striker_id' => $request->non_striker_id,
            'bowler_id' => $request->bowler_id,
            'runs' => $request->runs,
            'extra_runs' => $request->extra_runs,
            'extra_type' => $request->extra_type,
            'is_wicket' => $request->is_wicket,
            'wicket_type' => $request->wicket_type,
            'is_legal' => $request->is_legal,
            'caught_by_id' => $request->caught_by_id,
        ]);

        if ($request->is_wicket && $request->wicket_type === 'caught' && $request->caught_by_id) {
            $catcher = Player::find($request->caught_by_id);
            if ($catcher) {
                $catcher->increment('catches');
            }
        }

        self::recalculateInnings($inningsId);

        $ball->refresh();

        \App\Events\MatchUpdated::dispatch($match);

        return response()->json($ball, 201);
    }

    public function update(Request $request, $id)
    {
        $ball = Ball::findOrFail($id);
        $innings = Innings::findOrFail($ball->innings_id);
        $match = CricketMatch::findOrFail($innings->match_id);

        if ($request->user()->role !== 'admin' && $match->created_by !== $request->user()->id) {
            return response()->json(['message' => 'You are not authorized to score this match.'], 403);
        }

        $request->validate([
            'batter_id' => 'required|uuid|exists:players,id',
            'non_striker_id' => 'nullable|uuid|exists:players,id',
            'bowler_id' => 'required|uuid|exists:players,id',
            'runs' => 'required|integer',
            'extra_runs' => 'required|integer',
            'extra_type' => 'nullable|string',
            'is_wicket' => 'required|boolean',
            'wicket_type' => 'nullable|string',
            'is_legal' => 'required|boolean',
            'caught_by_id' => 'nullable|uuid|exists:players,id',
        ]);

        $oldIsCaught = $ball->is_wicket && $ball->wicket_type === 'caught' && $ball->caught_by_id;
        $newIsCaught = $request->is_wicket && $request->wicket_type === 'caught' && $request->caught_by_id;

        if ($oldIsCaught && $newIsCaught && $ball->caught_by_id !== $request->caught_by_id) {
            $oldCatcher = Player::find($ball->caught_by_id);
            if ($oldCatcher) $oldCatcher->decrement('catches');
            $newCatcher = Player::find($request->caught_by_id);
            if ($newCatcher) $newCatcher->increment('catches');
        } elseif ($oldIsCaught && !$newIsCaught) {
            $oldCatcher = Player::find($ball->caught_by_id);
            if ($oldCatcher) $oldCatcher->decrement('catches');
        } elseif (!$oldIsCaught && $newIsCaught) {
            $newCatcher = Player::find($request->caught_by_id);
            if ($newCatcher) $newCatcher->increment('catches');
        }

        $ball->update([
            'batter_id' => $request->batter_id,
            'non_striker_id' => $request->non_striker_id,
            'bowler_id' => $request->bowler_id,
            'runs' => $request->runs,
            'extra_runs' => $request->extra_runs,
            'extra_type' => $request->extra_type,
            'is_wicket' => $request->is_wicket,
            'wicket_type' => $request->wicket_type,
            'is_legal' => $request->is_legal,
            'caught_by_id' => $request->caught_by_id,
        ]);

        self::recalculateInnings($innings->id);

        $ball->refresh();

        \App\Events\MatchUpdated::dispatch($match);

        return response()->json($ball);
    }

    public function destroy(Request $request, $id)
    {
        $ball = Ball::findOrFail($id);
        $innings = Innings::findOrFail($ball->innings_id);
        $match = CricketMatch::findOrFail($innings->match_id);

        if ($request->user()->role !== 'admin' && $match->created_by !== $request->user()->id) {
            return response()->json(['message' => 'You are not authorized to score this match.'], 403);
        }

        if ($ball->is_wicket && $ball->wicket_type === 'caught' && $ball->caught_by_id) {
            $catcher = Player::find($ball->caught_by_id);
            if ($catcher) {
                $catcher->decrement('catches');
            }
        }

        $ball->delete();

        self::recalculateInnings($innings->id);

        \App\Events\MatchUpdated::dispatch($match);

        return response()->json(['message' => 'Ball deleted successfully.']);
    }
}
