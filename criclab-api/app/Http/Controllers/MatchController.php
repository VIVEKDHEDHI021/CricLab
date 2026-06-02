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
                'created_by' => $m->created_by,
                'match_date' => $m->match_date,
                'ground' => $m->ground,
                'match_type' => $m->match_type,
                'overs' => $m->overs,
                'result' => $m->result,
                'last_man_batting' => $m->last_man_batting,
                'man_of_the_match_id' => $m->man_of_the_match_id,
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
            'last_man_batting' => 'nullable|boolean',
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
            'last_man_batting' => $request->last_man_batting ?? false,
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

    public function end(Request $request, $id)
    {
        $match = CricketMatch::findOrFail($id);

        if (!in_array($request->user()->role, ['admin', 'scorer']) && $match->created_by !== $request->user()->id) {
            return response()->json(['message' => 'You are not authorized to score this match.'], 403);
        }

        $innings = $match->innings;

        $inn1 = $innings->where('innings_no', 1)->first();
        $inn2 = $innings->where('innings_no', 2)->first();

        $result = "Match ended";
        if ($inn1 && $inn2) {
            $team1 = Team::find($inn1->batting_team_id);
            $team2 = Team::find($inn2->batting_team_id);

            if ($inn1->runs > $inn2->runs) {
                $result = ($team1->name ?? 'First Team') . ' won by ' . ($inn1->runs - $inn2->runs) . ' runs';
            } elseif ($inn2->runs > $inn1->runs) {
                $battingPlayersCount = Player::where('team_id', $inn2->batting_team_id)->count();
                $isLastMan = $match->last_man_batting;
                $wicketsRemaining = $isLastMan 
                    ? ($battingPlayersCount - $inn2->wickets) 
                    : (($battingPlayersCount > 0 ? $battingPlayersCount - 1 : 10) - $inn2->wickets);
                
                if ($wicketsRemaining < 0) $wicketsRemaining = 0;
                
                $result = ($team2->name ?? 'Second Team') . ' won by ' . $wicketsRemaining . ' ' . ($wicketsRemaining === 1 ? 'wicket' : 'wickets');
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

        \App\Events\MatchUpdated::dispatch($match);

        return response()->json(['result' => $result]);
    }

    public function update(Request $request, $id)
    {
        $match = CricketMatch::findOrFail($id);

        if (!in_array($request->user()->role, ['admin', 'scorer']) && $match->created_by !== $request->user()->id) {
            return response()->json(['message' => 'You are not authorized to update this match.'], 403);
        }

        $request->validate([
            'man_of_the_match_id' => 'nullable|uuid|exists:players,id',
            'result' => 'nullable|string',
            'ground' => 'nullable|string',
            'match_type' => 'nullable|string',
            'overs' => 'nullable|integer|min:1|max:50',
            'status' => 'nullable|string|in:upcoming,live,past',
        ]);

        $match->update($request->only([
            'man_of_the_match_id', 'result', 'ground', 'match_type', 'overs', 'status'
        ]));

        \App\Events\MatchUpdated::dispatch($match);

        return response()->json($match);
    }
}
