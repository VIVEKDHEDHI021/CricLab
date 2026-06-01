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
        ]);

        $totalRuns = $request->runs + $request->extra_runs;
        $newRuns = $innings->runs + $totalRuns;
        $newWickets = $innings->wickets + ($request->is_wicket ? 1 : 0);
        $newLegal = $innings->legal_balls + ($request->is_legal ? 1 : 0);

        // Get max wickets (all out is when wickets count = batting players - 1, or batting players if last man stands)
        // Note: batting team is batting, so we check batting players!
        $battingPlayersCount = Player::where('team_id', $innings->batting_team_id)->count();
        $isLastMan = $match->last_man_batting;
        $maxWickets = $battingPlayersCount > 0 
            ? ($isLastMan ? $battingPlayersCount : $battingPlayersCount - 1) 
            : 10;
        if ($maxWickets <= 0) $maxWickets = 10;

        $isClosed = false;
        if ($newLegal >= $match->overs * 6 || $newWickets >= $maxWickets || $newWickets >= 10) {
            $isClosed = true;
        }

        // Check if this is the second innings
        if ($innings->innings_no === 2) {
            $firstInnings = Innings::where('match_id', $match->id)
                ->where('innings_no', 1)
                ->first();

            if ($firstInnings) {
                if ($newRuns > $firstInnings->runs) {
                    $isClosed = true;

                    // End the match automatically (Chased target)
                    $chasingTeam = Team::find($innings->batting_team_id);
                    $wicketsRemaining = $isLastMan 
                        ? ($battingPlayersCount - $newWickets) 
                        : (($battingPlayersCount > 0 ? $battingPlayersCount - 1 : 10) - $newWickets);
                    
                    if ($wicketsRemaining < 0) $wicketsRemaining = 0;
                    
                    $result = ($chasingTeam->name ?? 'Second Team') . ' won by ' . $wicketsRemaining . ' ' . ($wicketsRemaining === 1 ? 'wicket' : 'wickets');
                    
                    $match->update([
                        'status' => 'past',
                        'result' => $result,
                    ]);
                    $match->innings()->update(['is_closed' => true]);
                } elseif ($isClosed) {
                    // Innings completed but failed to chase (or tied)
                    $defendingTeam = Team::find($firstInnings->batting_team_id);
                    
                    if ($newRuns === $firstInnings->runs) {
                        $result = 'Match tied';
                    } else {
                        $result = ($defendingTeam->name ?? 'First Team') . ' won by ' . ($firstInnings->runs - $newRuns) . ' runs';
                    }
                    
                    $match->update([
                        'status' => 'past',
                        'result' => $result,
                    ]);
                    $match->innings()->update(['is_closed' => true]);
                }
            }
        }

        $innings->update([
            'runs' => $newRuns,
            'wickets' => $newWickets,
            'legal_balls' => $newLegal,
            'is_closed' => $isClosed,
        ]);

        \App\Events\MatchUpdated::dispatch($match);

        return response()->json($ball, 201);
    }

    public function destroy(Request $request, $id)
    {
        $ball = Ball::findOrFail($id);
        $innings = Innings::findOrFail($ball->innings_id);
        $match = CricketMatch::findOrFail($innings->match_id);

        if ($request->user()->role !== 'admin' && $match->created_by !== $request->user()->id) {
            return response()->json(['message' => 'You are not authorized to score this match.'], 403);
        }

        $totalRuns = $ball->runs + $ball->extra_runs;
        $newRuns = max(0, $innings->runs - $totalRuns);
        $newWickets = max(0, $innings->wickets - ($ball->is_wicket ? 1 : 0));
        $newLegal = max(0, $innings->legal_balls - ($ball->is_legal ? 1 : 0));

        $innings->update([
            'runs' => $newRuns,
            'wickets' => $newWickets,
            'legal_balls' => $newLegal,
            'is_closed' => false,
        ]);

        $ball->delete();

        \App\Events\MatchUpdated::dispatch($match);

        return response()->json(['message' => 'Ball deleted successfully.']);
    }
}
