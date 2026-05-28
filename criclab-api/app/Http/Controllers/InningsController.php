<?php

namespace App\Http\Controllers;

use App\Models\Innings;
use App\Models\CricketMatch;
use Illuminate\Http\Request;

class InningsController extends Controller
{
    public function startInnings(Request $request, $matchId)
    {
        $request->validate([
            'innings_no' => 'required|integer',
            'batting_team_id' => 'required|uuid|exists:teams,id',
            'bowling_team_id' => 'required|uuid|exists:teams,id',
        ]);

        $innings = Innings::create([
            'match_id' => $matchId,
            'innings_no' => $request->innings_no,
            'batting_team_id' => $request->batting_team_id,
            'bowling_team_id' => $request->bowling_team_id,
        ]);

        $match = CricketMatch::findOrFail($matchId);
        $match->update([
            'status' => 'live',
            'current_innings' => $request->innings_no,
        ]);

        return response()->json($innings, 201);
    }

    public function closeInnings($id)
    {
        $innings = Innings::findOrFail($id);
        $innings->update(['is_closed' => true]);
        return response()->json(['message' => 'Innings closed successfully.']);
    }
}
