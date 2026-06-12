<?php

namespace App\Http\Controllers;

use App\Models\CricketMatch;
use App\Models\Team;
use App\Models\Player;
use App\Models\MatchSquad;
use App\Models\BallEvent;
use App\Models\AuditLog;
use Illuminate\Support\Str;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

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

    private function initializeMatchSquads(CricketMatch $match, array $squadAIds = [], array $squadBIds = [])
    {
        if ($match->squads()->exists()) {
            return;
        }

        if (empty($squadAIds)) {
            $squadAIds = Player::where('team_id', $match->team_a_id)->pluck('id')->toArray();
        }
        if (empty($squadBIds)) {
            $squadBIds = Player::where('team_id', $match->team_b_id)->pluck('id')->toArray();
        }

        $squadAIds = array_values(array_unique(array_filter($squadAIds)));
        $squadBIds = array_values(array_unique(array_filter($squadBIds)));

        foreach ($squadAIds as $pId) {
            $p = Player::withTrashed()->find($pId);
            if ($p) {
                MatchSquad::create([
                    'match_id' => $match->id,
                    'team_id' => $match->team_a_id,
                    'player_id' => $p->id,
                    'display_name' => $p->name,
                    'nickname' => null,
                    'jersey_number' => $p->jersey_number ?? null,
                    'role' => $p->role ?? null,
                    'captain' => false,
                    'wicket_keeper' => false,
                    'is_guest' => false,
                ]);
            }
        }

        foreach ($squadBIds as $pId) {
            $p = Player::withTrashed()->find($pId);
            if ($p) {
                MatchSquad::create([
                    'match_id' => $match->id,
                    'team_id' => $match->team_b_id,
                    'player_id' => $p->id,
                    'display_name' => $p->name,
                    'nickname' => null,
                    'jersey_number' => $p->jersey_number ?? null,
                    'role' => $p->role ?? null,
                    'captain' => false,
                    'wicket_keeper' => false,
                    'is_guest' => false,
                ]);
            }
        }
    }

    public function show($id)
    {
        $match = CricketMatch::findOrFail($id);
        $teams = Team::withTrashed()->whereIn('id', [$match->team_a_id, $match->team_b_id])->get();
        $innings = $match->innings()->orderBy('innings_no')->get();
        $balls = $match->balls()->orderBy('ball_index')->get();

        if (!$match->squads()->exists()) {
            $this->initializeMatchSquads($match, $match->squad_a_ids ?? [], $match->squad_b_ids ?? []);
        }

        $players = $match->squads()->get()->map(function ($sq) {
            return [
                'id' => $sq->player_id,
                'name' => $sq->display_name,
                'team_id' => $sq->team_id,
                'role' => $sq->role,
                'jersey_number' => $sq->jersey_number,
                'captain' => $sq->captain,
                'wicket_keeper' => $sq->wicket_keeper,
                'is_guest' => $sq->is_guest,
                'nickname' => $sq->nickname,
                'mobile' => null,
                'avatar' => null,
                'batting_style' => null,
                'bowling_style' => null,
                'age' => null,
                'city' => null,
            ];
        });

        $squadA = $match->squads()->where('team_id', $match->team_a_id)->pluck('player_id')->toArray();
        $squadB = $match->squads()->where('team_id', $match->team_b_id)->pluck('player_id')->toArray();

        $match->squad_a_ids = $squadA;
        $match->squad_b_ids = $squadB;

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

        $this->initializeMatchSquads($match, $request->squad_a_ids ?? [], $request->squad_b_ids ?? []);

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

        $result = "No result";
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

        // Create MATCH_ENDED event to preserve in the timeline
        $nextSeq = BallEvent::where('match_id', $id)->max('sequence_number') + 1;
        BallEvent::create([
            'event_uuid' => (string) \Illuminate\Support\Str::uuid(),
            'event_type' => 'MATCH_ENDED',
            'sequence_number' => $nextSeq,
            'match_id' => $id,
            'innings_no' => $inn2 ? 2 : 1,
            'scorer_id' => $request->user()->id,
            'device_timestamp' => round(microtime(true) * 1000),
            'metadata' => [
                'result' => $result
            ]
        ]);

        // Run replay to project state
        \App\Services\MatchEngine::replay($id);

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

        if ($match->isFrozen()) {
            return response()->json(['message' => 'Cannot replace player. Scoring has already started.'], 422);
        }

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
            // Update MatchSquad record
            $squadRecord = $match->squads()->where('player_id', $oldPlayerId)->first();
            if ($squadRecord && $newPlayer) {
                $squadRecord->update([
                    'player_id' => $newPlayerId,
                    'display_name' => $newPlayer->name,
                    'jersey_number' => $newPlayer->jersey_number ?? null,
                    'role' => $newPlayer->role ?? null,
                ]);
            }

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

    public function syncStatus(Request $request, $matchId)
    {
        $match = CricketMatch::findOrFail($matchId);
        $innings = \App\Models\Innings::where('match_id', $matchId)->get();

        $syncedOvers = [];
        foreach ($innings as $inn) {
            $overs = \App\Models\Ball::where('innings_id', $inn->id)
                ->where('is_legal', true)
                ->groupBy('over_number')
                ->select('over_number', \Illuminate\Support\Facades\DB::raw('count(*) as legal_count'))
                ->having('legal_count', '>=', 6)
                ->get()
                ->map(fn($o) => [
                    'innings_no' => $inn->innings_no,
                    'over_no' => $o->over_number
                ])
                ->toArray();
            
            $syncedOvers = array_merge($syncedOvers, $overs);
        }

        return response()->json([
            'match_id' => $matchId,
            'status' => $match->status,
            'current_innings' => $innings->where('is_closed', false)->first()?->innings_no ?? ($innings->last()?->innings_no ?? 1),
            'synced_overs' => $syncedOvers,
        ]);
    }

    public function updateSquad(Request $request, $id)
    {
        $match = CricketMatch::findOrFail($id);

        if ($match->isFrozen()) {
            return response()->json(['message' => 'Cannot update squad. Scoring has already started.'], 422);
        }

        $request->validate([
            'squad_a' => 'present|array',
            'squad_a.*.player_id' => 'required|uuid',
            'squad_a.*.display_name' => 'required|string|max:255',
            'squad_a.*.role' => 'nullable|string|max:100',
            'squad_a.*.jersey_number' => 'nullable|string|max:20',
            'squad_a.*.captain' => 'nullable|boolean',
            'squad_a.*.wicket_keeper' => 'nullable|boolean',
            'squad_a.*.is_guest' => 'nullable|boolean',

            'squad_b' => 'present|array',
            'squad_b.*.player_id' => 'required|uuid',
            'squad_b.*.display_name' => 'required|string|max:255',
            'squad_b.*.role' => 'nullable|string|max:100',
            'squad_b.*.jersey_number' => 'nullable|string|max:20',
            'squad_b.*.captain' => 'nullable|boolean',
            'squad_b.*.wicket_keeper' => 'nullable|boolean',
            'squad_b.*.is_guest' => 'nullable|boolean',
        ]);

        \Illuminate\Support\Facades\DB::transaction(function () use ($match, $request) {
            // Delete existing squads
            $match->squads()->delete();

            // Insert Squad A
            foreach ($request->squad_a as $p) {
                MatchSquad::create([
                    'match_id' => $match->id,
                    'team_id' => $match->team_a_id,
                    'player_id' => $p['player_id'],
                    'display_name' => $p['display_name'],
                    'nickname' => $p['nickname'] ?? null,
                    'jersey_number' => $p['jersey_number'] ?? null,
                    'role' => $p['role'] ?? null,
                    'captain' => !empty($p['captain']),
                    'wicket_keeper' => !empty($p['wicket_keeper']),
                    'is_guest' => !empty($p['is_guest']),
                ]);
            }

            // Insert Squad B
            foreach ($request->squad_b as $p) {
                MatchSquad::create([
                    'match_id' => $match->id,
                    'team_id' => $match->team_b_id,
                    'player_id' => $p['player_id'],
                    'display_name' => $p['display_name'],
                    'nickname' => $p['nickname'] ?? null,
                    'jersey_number' => $p['jersey_number'] ?? null,
                    'role' => $p['role'] ?? null,
                    'captain' => !empty($p['captain']),
                    'wicket_keeper' => !empty($p['wicket_keeper']),
                    'is_guest' => !empty($p['is_guest']),
                ]);
            }

            // Sync legacy columns
            $squadA = array_column($request->squad_a, 'player_id');
            $squadB = array_column($request->squad_b, 'player_id');
            $match->update([
                'squad_a_ids' => $squadA,
                'squad_b_ids' => $squadB,
            ]);
        });

        \App\Events\MatchUpdated::dispatchSafe($match);

        return response()->json(['message' => 'Squad updated successfully.']);
    }

    public function syncAuditLogs(Request $request, $matchId)
    {
        $request->validate([
            'logs' => 'required|array',
            'logs.*.id' => 'required|uuid',
            'logs.*.action_type' => 'required|string',
            'logs.*.description' => 'required|string',
            'logs.*.device_timestamp' => 'required|integer',
        ]);

        $match = CricketMatch::findOrFail($matchId);

        DB::transaction(function () use ($matchId, $request) {
            foreach ($request->logs as $log) {
                if (AuditLog::where('id', $log['id'])->exists()) {
                    continue;
                }

                AuditLog::create([
                    'id' => $log['id'],
                    'match_id' => $matchId,
                    'event_uuid' => $log['event_uuid'] ?? null,
                    'action_type' => $log['action_type'],
                    'user_id' => $request->user()?->id,
                    'description' => $log['description'],
                    'old_state' => isset($log['old_state']) ? $log['old_state'] : null,
                    'new_state' => isset($log['new_state']) ? $log['new_state'] : null,
                    'device_timestamp' => $log['device_timestamp'],
                ]);
            }
        });

        return response()->json(['message' => 'Audit logs synced successfully.']);
    }

    public function getAuditLogs($matchId)
    {
        $match = CricketMatch::findOrFail($matchId);
        $logs = AuditLog::where('match_id', $matchId)
            ->orderBy('device_timestamp', 'asc')
            ->get();

        return response()->json($logs);
    }
}
