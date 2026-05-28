<?php

namespace App\Http\Controllers;

use App\Models\CricketMatch;
use App\Models\Team;
use App\Models\Player;
use Illuminate\Http\Request;

class MatchController extends Controller
{
    public function index()
    {
        $matches = CricketMatch::with(['teamA', 'teamB', 'innings'])->orderBy('match_date', 'desc')->get();

        $result = $matches->map(function ($m) {
            return [
                'id' => $m->id,
                'status' => $m->status,
                'match_date' => $m->match_date,
                'ground' => $m->ground,
                'match_type' => $m->match_type,
                'overs' => $m->overs,
                'result' => $m->result,
                'team_a' => $m->teamA ? ['id' => $m->teamA->id, 'name' => $m->teamA->name] : null,
                'team_b' => $m->teamB ? ['id' => $m->teamB->id, 'name' => $m->teamB->name] : null,
                'innings' => $m->innings->map(function ($i) {
                    return [
                        'innings_no' => $i->innings_no,
                        'runs' => $i->runs,
                        'wickets' => $i->wickets,
                        'legal_balls' => $i->legal_balls,
                        'batting_team_id' => $i->batting_team_id,
                    ];
                })
            ];
        });

        return response()->json($result);
    }

    public function show($id)
    {
        $match = CricketMatch::findOrFail($id);
        $teams = Team::whereIn('id', [$match->team_a_id, $match->team_b_id])->get();
        $innings = $match->innings()->orderBy('innings_no')->get();
        $players = Player::whereIn('team_id', [$match->team_a_id, $match->team_b_id])->get();
        $balls = $match->balls()->orderBy('ball_index')->get();

        return response()->json([
            'm' => $match,
            'teams' => $teams,
            'innings' => $innings,
            'players' => $players,
            'balls' => $balls,
        ]);
    }

    public function store(Request $request)
    {
        $request->validate([
            'team_a_id' => 'required|uuid|exists:teams,id',
            'team_b_id' => 'required|uuid|exists:teams,id',
            'overs' => 'required|integer|min:1|max:50',
            'wide_run' => 'required|integer|min:0|max:10',
            'noball_run' => 'required|integer|min:0|max:10',
            'match_type' => 'nullable|string|max:50',
            'ground' => 'nullable|string|max:255',
            'match_date' => 'required|string',
            'status' => 'required|string|in:upcoming,live,past',
            'batting_first_id' => 'required|uuid|exists:teams,id',
        ]);

        $match = CricketMatch::create([
            'team_a_id' => $request->team_a_id,
            'team_b_id' => $request->team_b_id,
            'overs' => $request->overs,
            'wide_run' => $request->wide_run,
            'noball_run' => $request->noball_run,
            'match_type' => $request->match_type,
            'ground' => $request->ground,
            'match_date' => date('Y-m-d H:i:s', strtotime($request->match_date)),
            'status' => $request->status,
            'batting_first_id' => $request->batting_first_id,
            'created_by' => $request->user()->id,
        ]);

        return response()->json($match, 201);
    }

    public function destroy($id)
    {
        $match = CricketMatch::findOrFail($id);
        $match->delete();
        return response()->json(['message' => 'Match deleted successfully.']);
    }

    public function end($id)
    {
        $match = CricketMatch::findOrFail($id);
        $innings = $match->innings;
        $teamA = Team::find($match->team_a_id);
        $teamB = Team::find($match->team_b_id);

        $innA = $innings->where('batting_team_id', $match->team_a_id)->first();
        $innB = $innings->where('batting_team_id', $match->team_b_id)->first();

        $result = "Match ended";
        if ($innA && $innB) {
            if ($innA->runs > $innB->runs) {
                $result = ($teamA->name ?? 'Team A') . ' won by ' . ($innA->runs - $innB->runs) . ' runs';
            } elseif ($innB->runs > $innA->runs) {
                $result = ($teamB->name ?? 'Team B') . ' won by ' . ($innB->runs - $innA->runs) . ' runs';
            } else {
                $result = 'Match tied';
            }
        }

        $match->update([
            'status' => 'past',
            'result' => $result,
        ]);

        // Close all innings for the match
        $match->innings()->update(['is_closed' => true]);

        return response()->json(['result' => $result]);
    }
}
