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

        $match = CricketMatch::findOrFail($matchId);

        if ($match->status === 'past') {
            return response()->json(['message' => 'Scoring is locked for this match.'], 422);
        }

        if ($request->user()->role !== 'admin' && $match->created_by !== $request->user()->id) {
            return response()->json(['message' => 'You are not authorized to score this match.'], 403);
        }

        $innings = Innings::create([
            'match_id' => $matchId,
            'innings_no' => $request->innings_no,
            'batting_team_id' => $request->batting_team_id,
            'bowling_team_id' => $request->bowling_team_id,
        ]);

        $match->update([
            'status' => 'live',
            'current_innings' => $request->innings_no,
        ]);

        \App\Events\MatchUpdated::dispatchSafe($match);

        return response()->json($innings, 201);
    }

    public function closeInnings(Request $request, $id)
    {
        $innings = Innings::findOrFail($id);
        $match = CricketMatch::findOrFail($innings->match_id);

        if ($match->status === 'past') {
            return response()->json(['message' => 'Scoring is locked for this match.'], 422);
        }

        if ($request->user()->role !== 'admin' && $match->created_by !== $request->user()->id) {
            return response()->json(['message' => 'You are not authorized to score this match.'], 403);
        }

        $innings->update(['is_closed' => true]);

        \App\Events\MatchUpdated::dispatchSafe($match);

        return response()->json(['message' => 'Innings closed successfully.']);
    }
}
