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
        $teams = Team::withTrashed()->whereIn('id', [$match->team_a_id, $match->team_b_id])->get();
        $innings = $match->innings()->orderBy('innings_no')->get();
        $balls = $match->balls()->orderBy('ball_index')->get();

        $squadA = $match->squad_a_ids ?? [];
        $squadB = $match->squad_b_ids ?? [];

        $referencedPlayerIds = $balls->flatMap(function ($b) {
            return [$b->batter_id, $b->non_striker_id, $b->bowler_id, $b->caught_by_id];
        })->filter()->unique()->all();

        if ($match->status === 'live' || $match->status === 'upcoming' || (empty($squadA) && empty($squadB))) {
            $currentTeamAPlayerIds = Player::where('team_id', $match->team_a_id)->pluck('id')->toArray();
            $currentTeamBPlayerIds = Player::where('team_id', $match->team_b_id)->pluck('id')->toArray();

            $squadA = array_values(array_unique(array_merge($squadA, $currentTeamAPlayerIds)));
            $squadB = array_values(array_unique(array_merge($squadB, $currentTeamBPlayerIds)));

            if ($match->status === 'live' || $match->status === 'upcoming') {
                $squadA = array_filter($squadA, function ($playerId) use ($currentTeamAPlayerIds, $referencedPlayerIds, $balls, $innings, $match) {
                    if (in_array($playerId, $currentTeamAPlayerIds)) return true;
                    if (!in_array($playerId, $referencedPlayerIds)) return false;
                    foreach ($balls as $b) {
                        if ($b->batter_id === $playerId || $b->non_striker_id === $playerId) {
                            $inn = $innings->firstWhere('id', $b->innings_id);
                            if ($inn && $inn->batting_team_id === $match->team_a_id) return true;
                        }
                        if ($b->bowler_id === $playerId || $b->caught_by_id === $playerId) {
                            $inn = $innings->firstWhere('id', $b->innings_id);
                            if ($inn && $inn->bowling_team_id === $match->team_a_id) return true;
                        }
                    }
                    return false;
                });

                $squadB = array_filter($squadB, function ($playerId) use ($currentTeamBPlayerIds, $referencedPlayerIds, $balls, $innings, $match) {
                    if (in_array($playerId, $currentTeamBPlayerIds)) return true;
                    if (!in_array($playerId, $referencedPlayerIds)) return false;
                    foreach ($balls as $b) {
                        if ($b->batter_id === $playerId || $b->non_striker_id === $playerId) {
                            $inn = $innings->firstWhere('id', $b->innings_id);
                            if ($inn && $inn->batting_team_id === $match->team_b_id) return true;
                        }
                        if ($b->bowler_id === $playerId || $b->caught_by_id === $playerId) {
                            $inn = $innings->firstWhere('id', $b->innings_id);
                            if ($inn && $inn->bowling_team_id === $match->team_b_id) return true;
                        }
                    }
                    return false;
                });
            }
        }

        // Add any player referenced in balls who isn't already in squads
        foreach ($referencedPlayerIds as $playerId) {
            if (in_array($playerId, $squadA) || in_array($playerId, $squadB)) {
                continue;
            }
            $teamId = null;
            foreach ($balls as $b) {
                if ($b->batter_id === $playerId || $b->non_striker_id === $playerId) {
                    $inn = $innings->firstWhere('id', $b->innings_id);
                    if ($inn) {
                        $teamId = $inn->batting_team_id;
                        break;
                    }
                }
                if ($b->bowler_id === $playerId || $b->caught_by_id === $playerId) {
                    $inn = $innings->firstWhere('id', $b->innings_id);
                    if ($inn) {
                        $teamId = $inn->bowling_team_id;
                        break;
                    }
                }
            }
            if ($teamId === $match->team_a_id) {
                $squadA[] = $playerId;
            } elseif ($teamId === $match->team_b_id) {
                $squadB[] = $playerId;
            }
        }

        $squadA = array_values(array_unique($squadA));
        $squadB = array_values(array_unique($squadB));

        if ($match->squad_a_ids !== $squadA || $match->squad_b_ids !== $squadB) {
            $match->squad_a_ids = $squadA;
            $match->squad_b_ids = $squadB;
            $match->save();
        }

        $allSquadIds = array_unique(array_merge($squadA, $squadB));
        $players = Player::withTrashed()
            ->whereIn('id', $allSquadIds)
            ->get();

        $players = $players->map(function ($player) use ($squadA, $squadB, $match) {
            if (in_array($player->id, $squadA)) {
                $player->team_id = $match->team_a_id;
            } elseif (in_array($player->id, $squadB)) {
                $player->team_id = $match->team_b_id;
            }
            return $player;
        });

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
            'squad_a_ids' => 'nullable|array',
            'squad_b_ids' => 'nullable|array',
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
            'squad_a_ids' => $request->squad_a_ids ?? [],
            'squad_b_ids' => $request->squad_b_ids ?? [],
        ]);

        return response()->json($match, 201);
    }

    public function destroy($id)
    {
        $match = CricketMatch::findOrFail($id);

        // Decrement catches for players who took catches in this match
        $caughtBalls = \App\Models\Ball::where('match_id', $match->id)
            ->where('is_wicket', true)
            ->where('wicket_type', 'caught')
            ->whereNotNull('caught_by_id')
            ->get();

        foreach ($caughtBalls as $ball) {
            $catcher = Player::find($ball->caught_by_id);
            if ($catcher) {
                $catcher->update([
                    'catches' => max(0, $catcher->catches - 1)
                ]);
            }
        }

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
                $currentBattingPlayerIds = Player::where('team_id', $inn2->batting_team_id)->pluck('id')->all();
                $actualBattingPlayerIds = \App\Models\Ball::where('innings_id', $inn2->id)
                    ->get()
                    ->flatMap(function ($b) {
                        return [$b->batter_id, $b->non_striker_id];
                    })
                    ->filter()
                    ->unique()
                    ->all();
                $battingPlayersCount = count(array_unique(array_merge($currentBattingPlayerIds, $actualBattingPlayerIds)));

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

        \App\Events\MatchUpdated::dispatchSafe($match);

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

        \App\Events\MatchUpdated::dispatchSafe($match);

        return response()->json($match);
    }

    public function replacePlayer(Request $request, $id)
    {
        $match = CricketMatch::findOrFail($id);

        if (!in_array($request->user()->role, ['admin', 'scorer']) && $match->created_by !== $request->user()->id) {
            return response()->json(['message' => 'You are not authorized to score this match.'], 403);
        }

        $request->validate([
            'old_player_id' => 'required|uuid|exists:players,id',
            'new_player_id' => 'required|uuid|exists:players,id',
        ]);

        $oldPlayerId = $request->old_player_id;
        $newPlayerId = $request->new_player_id;

        if ($oldPlayerId === $newPlayerId) {
            return response()->json(['message' => 'The replacement player must be different.'], 422);
        }

        $oldPlayer = Player::find($oldPlayerId);
        $newPlayer = Player::find($newPlayerId);

        \Illuminate\Support\Facades\DB::transaction(function () use ($match, $oldPlayerId, $newPlayerId, $oldPlayer, $newPlayer) {
            // Update balls
            \Illuminate\Support\Facades\DB::table('balls')
                ->where('match_id', $match->id)
                ->where('batter_id', $oldPlayerId)
                ->update(['batter_id' => $newPlayerId]);

            \Illuminate\Support\Facades\DB::table('balls')
                ->where('match_id', $match->id)
                ->where('non_striker_id', $oldPlayerId)
                ->update(['non_striker_id' => $newPlayerId]);

            \Illuminate\Support\Facades\DB::table('balls')
                ->where('match_id', $match->id)
                ->where('bowler_id', $oldPlayerId)
                ->update(['bowler_id' => $newPlayerId]);

            \Illuminate\Support\Facades\DB::table('balls')
                ->where('match_id', $match->id)
                ->where('caught_by_id', $oldPlayerId)
                ->update(['caught_by_id' => $newPlayerId]);

            // Update Man of the Match
            if ($match->man_of_the_match_id === $oldPlayerId) {
                $match->update(['man_of_the_match_id' => $newPlayerId]);
            }

            // Update squad lists
            $squadA = $match->squad_a_ids ?? [];
            $squadB = $match->squad_b_ids ?? [];

            if (in_array($oldPlayerId, $squadA)) {
                $squadA = array_values(array_unique(array_map(function ($id) use ($oldPlayerId, $newPlayerId) {
                    return $id === $oldPlayerId ? $newPlayerId : $id;
                }, $squadA)));
            }
            if (in_array($oldPlayerId, $squadB)) {
                $squadB = array_values(array_unique(array_map(function ($id) use ($oldPlayerId, $newPlayerId) {
                    return $id === $oldPlayerId ? $newPlayerId : $id;
                }, $squadB)));
            }

            $match->squad_a_ids = $squadA;
            $match->squad_b_ids = $squadB;
            $match->save();

            // Recalculate catches count
            $matchCatchesCount = \Illuminate\Support\Facades\DB::table('balls')
                ->where('match_id', $match->id)
                ->where('is_wicket', true)
                ->where('wicket_type', 'caught')
                ->where('caught_by_id', $newPlayerId)
                ->count();

            if ($matchCatchesCount > 0) {
                if ($oldPlayer) {
                    $oldPlayer->update([
                        'catches' => max(0, $oldPlayer->catches - $matchCatchesCount)
                    ]);
                }
                if ($newPlayer) {
                    $newPlayer->update([
                        'catches' => $newPlayer->catches + $matchCatchesCount
                    ]);
                }
            }

            // Move team/squad membership
            if ($oldPlayer && $newPlayer) {
                $targetTeamId = $oldPlayer->team_id;
                if ($targetTeamId === $match->team_a_id || $targetTeamId === $match->team_b_id) {
                    $newPlayer->update(['team_id' => $targetTeamId]);
                }
            }
        });

        \App\Events\MatchUpdated::dispatchSafe($match);

        return response()->json(['message' => 'Player replaced successfully.']);
    }
}
