<?php

namespace App\Http\Controllers;

use App\Models\Player;
use App\Models\Ball;
use Illuminate\Http\Request;

class PlayerController extends Controller
{
    public function index()
    {
        $players = Player::orderBy('name')->get();
        $balls = Ball::all();

        $result = [];
        foreach ($players as $p) {
            $bat = $balls->where('batter_id', $p->id);
            $bowl = $balls->where('bowler_id', $p->id);

            $runs = $bat->sum('runs');
            $facedBalls = $bat->where('is_legal', true)->count();
            $sr = $facedBalls ? number_format(($runs / $facedBalls) * 100, 1) : '—';

            $wickets = $bowl->where('is_wicket', true)->count();
            $runsConceded = $bowl->sum('runs') + $bowl->sum('extra_runs');
            $legalBowl = $bowl->where('is_legal', true)->count();
            $overs = $legalBowl / 6;
            $econ = $overs > 0 ? number_format($runsConceded / $overs, 2) : '—';

            $matchIds = collect([]);
            foreach ($bat as $b) {
                $matchIds->push($b->match_id);
            }
            foreach ($bowl as $b) {
                $matchIds->push($b->match_id);
            }
            $matchesCount = $matchIds->unique()->count();

            $result[] = [
                'id' => $p->id,
                'name' => $p->name,
                'team_id' => $p->team_id,
                'mobile' => $p->mobile,
                'stats' => [
                    'matches' => $matchesCount,
                    'runs' => $runs,
                    'wickets' => $wickets,
                    'sr' => $sr,
                    'econ' => $econ,
                ]
            ];
        }

        return response()->json($result);
    }

    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'team_id' => 'required|uuid|exists:teams,id',
            'mobile' => 'nullable|string',
        ]);

        $player = Player::create([
            'name' => $request->name,
            'team_id' => $request->team_id,
            'mobile' => $request->mobile,
        ]);

        return response()->json($player, 201);
    }

    public function destroy($id)
    {
        $player = Player::findOrFail($id);
        $player->delete();
        return response()->json(['message' => 'Player deleted successfully.']);
    }
}
