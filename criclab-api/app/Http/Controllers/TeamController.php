<?php

namespace App\Http\Controllers;

use App\Models\Team;
use Illuminate\Http\Request;

class TeamController extends Controller
{
    public function index()
    {
        return response()->json(Team::orderBy('name')->get());
    }

    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
        ]);

        $team = Team::create([
            'name' => $request->name,
            'created_by' => $request->user()->id,
        ]);

        return response()->json($team, 201);
    }

    public function destroy($id)
    {
        $team = Team::findOrFail($id);

        // Find all matches played by this team
        $matches = \App\Models\CricketMatch::where('team_a_id', $team->id)
            ->orWhere('team_b_id', $team->id)
            ->get();

        foreach ($matches as $match) {
            // Decrement catches for players who took catches in this match
            $caughtBalls = \App\Models\Ball::where('match_id', $match->id)
                ->where('is_wicket', true)
                ->where('wicket_type', 'caught')
                ->whereNotNull('caught_by_id')
                ->get();

            foreach ($caughtBalls as $ball) {
                $catcher = \App\Models\Player::find($ball->caught_by_id);
                if ($catcher) {
                    $catcher->update([
                        'catches' => max(0, $catcher->catches - 1)
                    ]);
                }
            }
            $match->delete();
        }

        $team->delete();
        return response()->json(['message' => 'Team deleted successfully.']);
    }
}
