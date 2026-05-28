<?php

namespace App\Http\Controllers;

use App\Models\Ball;
use App\Models\Innings;
use App\Models\CricketMatch;
use App\Models\Player;
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
            'non_striker_id' => 'required|uuid|exists:players,id',
            'bowler_id' => 'required|uuid|exists:players,id',
            'runs' => 'required|integer',
            'extra_runs' => 'required|integer',
            'extra_type' => 'nullable|string',
            'is_wicket' => 'required|boolean',
            'is_legal' => 'required|boolean',
        ]);

        $innings = Innings::findOrFail($inningsId);
        $match = CricketMatch::findOrFail($request->match_id);

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
            'is_legal' => $request->is_legal,
        ]);

        $totalRuns = $request->runs + $request->extra_runs;
        $newRuns = $innings->runs + $totalRuns;
        $newWickets = $innings->wickets + ($request->is_wicket ? 1 : 0);
        $newLegal = $innings->legal_balls + ($request->is_legal ? 1 : 0);

        // Get max wickets (all out is when wickets count = batting players - 1)
        // Note: batting team is batting, so we check batting players!
        $battingPlayersCount = Player::where('team_id', $innings->batting_team_id)->count();
        $maxWickets = $battingPlayersCount > 0 ? $battingPlayersCount - 1 : 10;
        if ($maxWickets <= 0) $maxWickets = 10;

        $isClosed = false;
        if ($newLegal >= $match->overs * 6 || $newWickets >= $maxWickets || $newWickets >= 10) {
            $isClosed = true;
        }

        $innings->update([
            'runs' => $newRuns,
            'wickets' => $newWickets,
            'legal_balls' => $newLegal,
            'is_closed' => $isClosed,
        ]);

        return response()->json($ball, 201);
    }

    public function destroy($id)
    {
        $ball = Ball::findOrFail($id);
        $innings = Innings::findOrFail($ball->innings_id);

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

        return response()->json(['message' => 'Ball deleted successfully.']);
    }
}
