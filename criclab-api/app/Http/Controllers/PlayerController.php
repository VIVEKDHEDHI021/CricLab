<?php

namespace App\Http\Controllers;

use App\Models\Player;
use App\Models\Ball;
use App\Models\CricketMatch;
use App\Models\Account;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PlayerController extends Controller
{
    public function index(Request $request)
    {
        $query = Player::query();

        // Search filter
        if ($search = $request->query('search')) {
            $query->where(function($q) use ($search) {
                $q->where('full_name', 'like', "%{$search}%")
                  ->orWhere('name', 'like', "%{$search}%")
                  ->orWhere('mobile', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('city', 'like', "%{$search}%");
            });
        }

        // Primary Role filter
        if ($role = $request->query('role')) {
            $query->where('primary_role', $role);
        }

        // Subqueries for statistics (Only from past matches)
        $query->select('players.*')
            ->selectSub(function($q) {
                $q->selectRaw('count(distinct match_squads.match_id)')
                  ->from('match_squads')
                  ->join('matches', 'match_squads.match_id', '=', 'matches.id')
                  ->whereColumn('match_squads.player_id', 'players.id')
                  ->where('matches.status', 'past');
            }, 'matches_count')
            ->selectSub(function($q) {
                $q->selectRaw('coalesce(sum(runs), 0)')
                  ->from('balls')
                  ->join('matches', 'balls.match_id', '=', 'matches.id')
                  ->whereColumn('balls.batter_id', 'players.id')
                  ->where('matches.status', 'past');
            }, 'runs_sum')
            ->selectSub(function($q) {
                $q->selectRaw('count(*)')
                  ->from('balls')
                  ->join('matches', 'balls.match_id', '=', 'matches.id')
                  ->whereColumn('balls.bowler_id', 'players.id')
                  ->where('balls.is_wicket', true)
                  ->where('matches.status', 'past');
            }, 'wickets_count')
            ->selectSub(function($q) {
                $q->selectRaw('count(*)')
                  ->from('balls')
                  ->join('matches', 'balls.match_id', '=', 'matches.id')
                  ->whereColumn('balls.batter_id', 'players.id')
                  ->where('balls.is_legal', true)
                  ->where('matches.status', 'past');
            }, 'balls_faced')
            ->selectSub(function($q) {
                $q->selectRaw('coalesce(sum(runs), 0) + coalesce(sum(extra_runs), 0)')
                  ->from('balls')
                  ->join('matches', 'balls.match_id', '=', 'matches.id')
                  ->whereColumn('balls.bowler_id', 'players.id')
                  ->where('matches.status', 'past');
            }, 'runs_conceded')
            ->selectSub(function($q) {
                $q->selectRaw('count(*)')
                  ->from('balls')
                  ->join('matches', 'balls.match_id', '=', 'matches.id')
                  ->whereColumn('balls.bowler_id', 'players.id')
                  ->where('balls.is_legal', true)
                  ->where('matches.status', 'past');
            }, 'balls_bowled');

        // Sorting
        $sort = $request->query('sort', 'name');
        $direction = $request->query('direction', 'asc');

        if ($sort === 'jersey_number') {
            $query->orderByRaw('CAST(jersey_number AS UNSIGNED) ' . $direction);
        } elseif ($sort === 'matches_played') {
            $query->orderBy('matches_count', $direction);
        } else {
            $query->orderBy('full_name', $direction);
        }

        $players = $query->get();

        $result = $players->map(function($p) {
            $faced = (int) $p->balls_faced;
            $sr = $faced > 0 ? number_format(($p->runs_sum / $faced) * 100, 1) : '—';

            $bowled = (int) $p->balls_bowled;
            $econ = $bowled > 0 ? number_format($p->runs_conceded / ($bowled / 6), 2) : '—';

            return [
                'id' => $p->id,
                'name' => $p->full_name ?: $p->name,
                'full_name' => $p->full_name,
                'mobile' => $p->mobile,
                'email' => $p->email,
                'dob' => $p->dob,
                'city' => $p->city,
                'state' => $p->state,
                'country' => $p->country,
                'profile_photo' => $p->profile_photo,
                'bio' => $p->bio,
                'primary_role' => $p->primary_role,
                'batting_style' => $p->batting_style,
                'bowling_style' => $p->bowling_style,
                'bowling_type' => $p->bowling_type,
                'jersey_number' => $p->jersey_number,
                'preferred_team_id' => $p->preferred_team_id,
                'created_by' => $p->created_by,
                'created_at' => $p->created_at,
                'stats' => [
                    'matches' => (int) $p->matches_count,
                    'runs' => (int) $p->runs_sum,
                    'wickets' => (int) $p->wickets_count,
                    'sr' => $sr,
                    'econ' => $econ
                ]
            ];
        });

        return response()->json($result);
    }

    public function search(Request $request)
    {
        $query = $request->query('query');
        if (!$query) {
            return response()->json([], 200);
        }

        $players = Player::where('mobile', $query)
            ->orWhere('user_id', $query)
            ->orWhere('full_name', 'like', "%{$query}%")
            ->orWhere('name', 'like', "%{$query}%")
            ->orWhereHas('user', function($q) use ($query) {
                $q->where('mobile', $query)
                  ->orWhere('id', $query)
                  ->orWhere('username', 'like', "%{$query}%")
                  ->orWhere('name', 'like', "%{$query}%");
            })
            ->with('preferredTeam')
            ->get();

        $result = [];
        foreach ($players as $p) {
            $playerIds = $p->mobile ? Player::where('mobile', $p->mobile)->pluck('id')->all() : [$p->id];

            $pastMatchIds = CricketMatch::where('status', 'past')->pluck('id')->all();
            $bat = Ball::whereIn('batter_id', $playerIds)->whereIn('match_id', $pastMatchIds);
            $bowl = Ball::whereIn('bowler_id', $playerIds)->whereIn('match_id', $pastMatchIds);

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
                'name' => $p->full_name ?: $p->name,
                'full_name' => $p->full_name,
                'mobile' => $p->mobile,
                'email' => $p->email,
                'dob' => $p->dob,
                'city' => $p->city,
                'state' => $p->state,
                'country' => $p->country,
                'profile_photo' => $p->profile_photo,
                'bio' => $p->bio,
                'primary_role' => $p->primary_role,
                'batting_style' => $p->batting_style,
                'bowling_style' => $p->bowling_style,
                'bowling_type' => $p->bowling_type,
                'jersey_number' => $p->jersey_number,
                'preferred_team_id' => $p->preferred_team_id,
                'created_by' => $p->created_by,
                'created_at' => $p->created_at,
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
            'full_name' => 'required|string|max:255',
            'mobile' => [
                'nullable',
                'string',
                Rule::unique('players')->whereNull('deleted_at')
            ],
            'email' => 'nullable|email|max:255',
            'dob' => 'nullable|string|max:50',
            'city' => 'nullable|string|max:255',
            'state' => 'nullable|string|max:255',
            'country' => 'nullable|string|max:255',
            'profile_photo' => 'nullable|string',
            'bio' => 'nullable|string',
            'primary_role' => 'required|string|in:Batsman,Bowler,All Rounder,Wicket Keeper,Wicket Keeper Batter',
            'batting_style' => 'nullable|string',
            'bowling_style' => 'nullable|string',
            'bowling_type' => 'nullable|string',
            'jersey_number' => 'nullable|string|max:10',
            'preferred_team_id' => 'nullable|uuid|exists:teams,id',
        ]);

        $userId = null;
        if ($request->mobile) {
            $user = \App\Models\Account::where('mobile', $request->mobile)->first();
            if ($user) $userId = $user->id;
        }

        $player = Player::create([
            'full_name' => $request->full_name,
            'name' => $request->full_name, // Sync with name for legacy
            'mobile' => $request->mobile,
            'email' => $request->email,
            'dob' => $request->dob,
            'city' => $request->city,
            'state' => $request->state,
            'country' => $request->country,
            'profile_photo' => $request->profile_photo,
            'bio' => $request->bio,
            'primary_role' => $request->primary_role,
            'role' => $request->primary_role, // Sync with role for legacy
            'batting_style' => $request->batting_style,
            'bowling_style' => $request->bowling_style,
            'bowling_type' => $request->bowling_type,
            'jersey_number' => $request->jersey_number,
            'preferred_team_id' => $request->preferred_team_id,
            'user_id' => $userId,
            'created_by' => $request->user()->id,
        ]);

        return response()->json($player, 201);
    }

    public function show($id)
    {
        $player = Player::withTrashed()->with(['preferredTeam', 'user', 'creator'])->findOrFail($id);
        return response()->json($player);
    }

    public function update(Request $request, $id)
    {
        $player = Player::findOrFail($id);
        $user = $request->user();

        // Auto-link if mobile matches and user_id is not set
        if ($player->user_id === null && $player->mobile && $player->mobile === $user->mobile) {
            $player->user_id = $user->id;
            $player->save();
        }

        $isOwner = ($player->user_id === $user->id) || ($player->mobile && $player->mobile === $user->mobile);

        if ($user->role !== 'admin' && !$isOwner) {
            return response()->json(['message' => 'You are not authorized to update this profile.'], 403);
        }

        $request->validate([
            'full_name' => 'nullable|string|max:255',
            'name' => 'nullable|string|max:255',
            'mobile' => [
                'nullable',
                'string',
                Rule::unique('players')->ignore($id)->whereNull('deleted_at')
            ],
            'email' => 'nullable|email|max:255',
            'dob' => 'nullable|string|max:50',
            'city' => 'nullable|string|max:255',
            'state' => 'nullable|string|max:255',
            'country' => 'nullable|string|max:255',
            'profile_photo' => 'nullable|string',
            'avatar' => 'nullable|string',
            'bio' => 'nullable|string',
            'primary_role' => 'nullable|string|in:Batsman,Bowler,All Rounder,Wicket Keeper,Wicket Keeper Batter',
            'role' => 'nullable|string',
            'batting_style' => 'nullable|string',
            'bowling_style' => 'nullable|string',
            'bowling_type' => 'nullable|string',
            'jersey_number' => 'nullable|string|max:10',
            'preferred_team_id' => 'nullable|uuid|exists:teams,id',
            'catches' => 'nullable|integer|min:0',
            'run_outs' => 'nullable|integer|min:0',
            'age' => 'nullable|integer|min:0|max:150',
        ]);

        $data = $request->only([
            'full_name', 'name', 'mobile', 'email', 'dob', 'city', 'state', 'country',
            'profile_photo', 'avatar', 'bio', 'primary_role', 'role', 'batting_style',
            'bowling_style', 'bowling_type', 'jersey_number', 'preferred_team_id',
            'catches', 'run_outs', 'age'
        ]);

        if (isset($data['full_name'])) {
            $data['name'] = $data['full_name'];
        } elseif (isset($data['name'])) {
            $data['full_name'] = $data['name'];
        }

        if (isset($data['primary_role'])) {
            $data['role'] = $data['primary_role'];
        } elseif (isset($data['role'])) {
            $data['primary_role'] = $data['role'];
        }

        if (isset($data['profile_photo'])) {
            $data['avatar'] = $data['profile_photo'];
        } elseif (isset($data['avatar'])) {
            $data['profile_photo'] = $data['avatar'];
        }

        $player->update($data);

        if ($player->user_id && ($request->has('full_name') || $request->has('name'))) {
            $matchingUser = \App\Models\Account::find($player->user_id);
            if ($matchingUser) {
                $matchingUser->update(['name' => $player->full_name]);
            }
        }

        if ($request->has('mobile') && $request->mobile) {
            $matchingUser = \App\Models\Account::where('mobile', $request->mobile)->first();
            if ($matchingUser) {
                $player->update(['user_id' => $matchingUser->id]);
            }
        }

        return response()->json($player);
    }

    public function destroy($id)
    {
        $player = Player::findOrFail($id);
        $player->delete();
        return response()->json(['message' => 'Player deleted successfully.']);
    }

    public function statistics($id)
    {
        $player = Player::withTrashed()->findOrFail($id);
        $playerIds = $player->mobile ? Player::withTrashed()->where('mobile', $player->mobile)->pluck('id')->all() : [$player->id];

        $pastMatchIds = CricketMatch::where('status', 'past')->pluck('id')->all();

        $bat = Ball::whereIn('batter_id', $playerIds)->whereIn('match_id', $pastMatchIds)->get();
        $bowl = Ball::whereIn('bowler_id', $playerIds)->whereIn('match_id', $pastMatchIds)->get();
        $field = Ball::whereIn('caught_by_id', $playerIds)->whereIn('match_id', $pastMatchIds)->get();

        $matchIds = $bat->pluck('match_id')
            ->concat($bowl->pluck('match_id'))
            ->concat($field->pluck('match_id'))
            ->unique()
            ->values()
            ->all();

        // Career Statistics
        $runs = $bat->sum('runs');
        $fours = $bat->where('runs', 4)->count();
        $sixes = $bat->where('runs', 6)->count();
        $dismissals = $bat->where('is_wicket', true)->count();
        $faced = $bat->where('extra_type', '!=', 'wide')->count();
        $batAvg = $dismissals > 0 ? number_format($runs / $dismissals, 2) : ($runs > 0 ? $runs . '*' : '—');
        $sr = $faced > 0 ? number_format(($runs / $faced) * 100, 1) : '—';
        $highestScore = $bat->groupBy('match_id')->map(fn($g) => $g->sum('runs'))->max() ?? 0;

        $wickets = $bowl->where('is_wicket', true)->count();
        $runsConceded = $bowl->sum('runs') + $bowl->whereIn('extra_type', ['wide', 'no_ball'])->sum('extra_runs');
        $legalBalls = $bowl->where('is_legal', true)->count();
        $bowlAvg = $wickets > 0 ? number_format($runsConceded / $wickets, 2) : '—';
        $econ = $legalBalls > 0 ? number_format($runsConceded / ($legalBalls / 6), 2) : '—';

        // Calculate maidens
        $oversGrouped = $bowl->groupBy(function($b) {
            return $b->innings_id . '_' . $b->over_number;
        });
        $maidens = 0;
        foreach ($oversGrouped as $overBalls) {
            if ($overBalls->where('is_legal', true)->count() >= 6) {
                $overRuns = $overBalls->sum('runs') + $overBalls->whereIn('extra_type', ['wide', 'no_ball'])->sum('extra_runs');
                if ($overRuns === 0) {
                    $maidens++;
                }
            }
        }

        // Best bowling
        $bestBowling = '—';
        if ($bowl->isNotEmpty()) {
            $groupedBowl = $bowl->groupBy('match_id');
            $bestWickets = -1;
            $bestRuns = 999;
            foreach ($groupedBowl as $mId => $matchBowl) {
                $w = $matchBowl->where('is_wicket', true)->count();
                $r = $matchBowl->sum('runs') + $matchBowl->whereIn('extra_type', ['wide', 'no_ball'])->sum('extra_runs');
                if ($w > $bestWickets || ($w === $bestWickets && $r < $bestRuns)) {
                    $bestWickets = $w;
                    $bestRuns = $r;
                    $bestBowling = "$w/$r";
                }
            }
        }

        // Calculate Awards
        $momCount = 0;
        $bestBatsmanCount = 0;
        $bestBowlerCount = 0;

        if (count($matchIds) > 0) {
            $allMatchesBalls = Ball::whereIn('match_id', $matchIds)->get();
            $matches = CricketMatch::whereIn('id', $matchIds)->get();
            foreach ($matchIds as $mId) {
                $mBalls = $allMatchesBalls->where('match_id', $mId);
                if ($mBalls->isEmpty()) continue;

                $mBatterIds = $mBalls->pluck('batter_id')->filter()->unique()->all();
                $mBowlerIds = $mBalls->pluck('bowler_id')->filter()->unique()->all();
                $mPlayerIds = array_unique(array_merge($mBatterIds, $mBowlerIds));

                $mPlayerStats = [];
                foreach ($mPlayerIds as $pId) {
                    $batBalls = $mBalls->where('batter_id', $pId);
                    $runsScored = $batBalls->sum('runs');
                    $ballsFaced = $batBalls->where('extra_type', '!=', 'wide')->count();
                    $mSr = $ballsFaced > 0 ? ($runsScored / $ballsFaced) * 100 : 0;
                    $mSixes = $batBalls->where('runs', 6)->count();
                    $mFours = $batBalls->where('runs', 4)->count();

                    $bowlBalls = $mBalls->where('bowler_id', $pId);
                    $wicketsCount = $bowlBalls->where('is_wicket', true)->whereNotIn('wicket_type', ['run_out', 'retired_hurt'])->count();
                    $mRunsConceded = $bowlBalls->sum('runs') + $bowlBalls->whereIn('extra_type', ['wide', 'no_ball'])->sum('extra_runs');
                    $legalBowled = $bowlBalls->where('is_legal', true)->count();
                    $mEcon = $legalBowled > 0 ? ($mRunsConceded / ($legalBowled / 6)) : 0;

                    $catchesCount = $mBalls->where('is_wicket', true)->where('wicket_type', 'caught')->where('caught_by_id', $pId)->count();

                    $mvpPoints = ($runsScored * 1) 
                        + ($wicketsCount * 20) 
                        + ($catchesCount * 10) 
                        + ($mSixes * 5) 
                        + ($mFours * 2);

                    $mPlayerStats[$pId] = [
                        'player_id' => $pId,
                        'runsScored' => $runsScored,
                        'ballsFaced' => $ballsFaced,
                        'sr' => $mSr,
                        'wickets' => $wicketsCount,
                        'runsConceded' => $mRunsConceded,
                        'econ' => $mEcon,
                        'mvp' => $mvpPoints,
                    ];
                }

                $bestBat = collect($mPlayerStats)->sortByDesc(fn($x) => $x['runsScored'])->first();
                $bestBowl = collect($mPlayerStats)->sortByDesc(fn($x) => $x['wickets'])->first();
                $calculatedMoM = collect($mPlayerStats)->sortByDesc(fn($x) => $x['mvp'])->first();

                $matchModel = $matches->firstWhere('id', $mId);
                $momId = ($matchModel && $matchModel->man_of_the_match_id) 
                    ? $matchModel->man_of_the_match_id 
                    : ($calculatedMoM ? $calculatedMoM['player_id'] : null);

                if ($momId && in_array($momId, $playerIds)) {
                    $momCount++;
                }

                if ($bestBat && in_array($bestBat['player_id'], $playerIds) && $bestBat['runsScored'] > 0) {
                    $bestBatsmanCount++;
                }
                if ($bestBowl && in_array($bestBowl['player_id'], $playerIds) && $bestBowl['wickets'] > 0) {
                    $bestBowlerCount++;
                }
            }
        }

        $fieldCatches = Player::whereIn('id', $playerIds)->sum('catches') + $field->count();
        $fieldRunOuts = Player::whereIn('id', $playerIds)->sum('run_outs');

        return response()->json([
            'awards' => [
                'man_of_the_match' => $momCount,
                'best_batsman' => $bestBatsmanCount,
                'best_bowler' => $bestBowlerCount,
            ],
            'career' => [
                'matches' => count($matchIds),
                'innings' => $bat->pluck('match_id')->unique()->count(),
                'runs' => $runs,
                'highest_score' => $highestScore,
                'average' => $batAvg,
                'strike_rate' => $sr,
                'fours' => $fours,
                'sixes' => $sixes,
                'wickets' => $wickets,
                'bowling_average' => $bowlAvg,
                'economy' => $econ,
                'best_bowling' => $bestBowling,
                'maidens' => $maidens,
                'catches' => $fieldCatches,
                'run_outs' => $fieldRunOuts,
            ],
            'tournament' => [
                'runs' => $runs,
                'wickets' => $wickets,
                'average' => $batAvg,
                'strike_rate' => $sr,
            ]
        ]);
    }

    public function matches($id)
    {
        $player = Player::withTrashed()->findOrFail($id);
        $playerIds = $player->mobile ? Player::withTrashed()->where('mobile', $player->mobile)->pluck('id')->all() : [$player->id];

        $pastMatchIds = CricketMatch::where('status', 'past')->pluck('id')->all();

        $matchIds = Ball::whereIn('match_id', $pastMatchIds)
            ->where(function($q) use ($playerIds) {
                $q->whereIn('batter_id', $playerIds)
                  ->orWhereIn('bowler_id', $playerIds)
                  ->orWhereIn('caught_by_id', $playerIds);
            })
            ->pluck('match_id')
            ->unique()
            ->all();

        $matches = CricketMatch::with(['teamA', 'teamB'])
            ->whereIn('id', $matchIds)
            ->orderBy('match_date', 'desc')
            ->get();

        return response()->json($matches);
    }

    public function career($id)
    {
        $player = Player::withTrashed()->findOrFail($id);
        $playerIds = $player->mobile ? Player::withTrashed()->where('mobile', $player->mobile)->pluck('id')->all() : [$player->id];

        $pastMatchIds = CricketMatch::where('status', 'past')->pluck('id')->all();

        $bat = Ball::whereIn('batter_id', $playerIds)->whereIn('match_id', $pastMatchIds)->get();
        $bowl = Ball::whereIn('bowler_id', $playerIds)->whereIn('match_id', $pastMatchIds)->get();
        $field = Ball::whereIn('caught_by_id', $playerIds)->whereIn('match_id', $pastMatchIds)->get();

        $matchIds = $bat->pluck('match_id')
            ->concat($bowl->pluck('match_id'))
            ->concat($field->pluck('match_id'))
            ->unique()
            ->values()
            ->all();

        $matches = CricketMatch::with(['teamA', 'teamB', 'innings'])
            ->whereIn('id', $matchIds)
            ->orderBy('match_date', 'desc')
            ->get();

        $history = [];
        foreach ($matches as $m) {
            $mBat = $bat->where('match_id', $m->id);
            $mBowl = $bowl->where('match_id', $m->id);

            $mRuns = $mBat->sum('runs');
            $mFaced = $mBat->where('extra_type', '!=', 'wide')->count();
            $mIsOut = $mBat->where('is_wicket', true)->count() > 0;

            $mWickets = $mBowl->where('is_wicket', true)->count();
            $mBowlRuns = $mBowl->sum('runs') + $mBowl->whereIn('extra_type', ['wide', 'no_ball'])->sum('extra_runs');
            $mBowlBalls = $mBowl->where('is_legal', true)->count();
            $mBowlOvers = floor($mBowlBalls / 6) . '.' . ($mBowlBalls % 6);

            $playerTeamId = null;
            if ($mBat->first()) {
                $inn = $m->innings->firstWhere('id', $mBat->first()->innings_id);
                if ($inn) $playerTeamId = $inn->batting_team_id;
            } elseif ($mBowl->first()) {
                $inn = $m->innings->firstWhere('id', $mBowl->first()->innings_id);
                if ($inn) $playerTeamId = $inn->bowling_team_id;
            }

            if (!$playerTeamId) {
                $playerTeamId = $player->preferred_team_id;
            }

            $opponentTeamId = ($playerTeamId === $m->team_a_id) ? $m->team_b_id : $m->team_a_id;
            $opponentName = ($opponentTeamId === $m->team_a_id) ? ($m->teamA->name ?? '—') : ($m->teamB->name ?? '—');

            $history[] = [
                'match_id' => $m->id,
                'match_date' => $m->match_date,
                'opponent' => $opponentName,
                'runs' => $mRuns,
                'balls' => $mFaced,
                'is_out' => $mIsOut,
                'wickets' => $mWickets,
                'bowling_runs' => $mBowlRuns,
                'bowling_overs' => $mBowlOvers,
                'result' => $m->result ?? 'No Result',
            ];
        }

        return response()->json($history);
    }

    public function rankings()
    {
        $players = Player::all();
        $pastMatchIds = CricketMatch::where('status', 'past')->pluck('id')->all();
        $balls = Ball::whereIn('match_id', $pastMatchIds)->get();

        $groupedPlayers = $players->groupBy(function($p) {
            return $p->mobile ?: $p->id;
        });

        $ranked = [];
        foreach ($groupedPlayers as $key => $playerGroup) {
            $p = $playerGroup->first();
            $playerIds = $playerGroup->pluck('id')->all();

            $bat = $balls->whereIn('batter_id', $playerIds);
            $bowl = $balls->whereIn('bowler_id', $playerIds);
            $field = $balls->whereIn('caught_by_id', $playerIds);

            if ($bat->isEmpty() && $bowl->isEmpty() && $field->isEmpty()) {
                continue;
            }

            $runs = $bat->sum('runs');
            $sixes = $bat->where('runs', 6)->count();
            $fours = $bat->where('runs', 4)->count();
            $wickets = $bowl->where('is_wicket', true)->count();

            $faced = $bat->where('extra_type', '!=', 'wide')->count();
            $sr = $faced > 0 ? ($runs / $faced) * 100 : 0;

            $oversGrouped = $bowl->groupBy(function($b) {
                return $b->innings_id . '_' . $b->over_number;
            });
            $maidens = 0;
            foreach ($oversGrouped as $overBalls) {
                if ($overBalls->where('is_legal', true)->count() >= 6) {
                    $overRuns = $overBalls->sum('runs') + $overBalls->whereIn('extra_type', ['wide', 'no_ball'])->sum('extra_runs');
                    if ($overRuns === 0) {
                        $maidens++;
                    }
                }
            }

            $catches = $playerGroup->sum('catches') + $field->count();
            $runOuts = $playerGroup->sum('run_outs');

            $mvpPoints = ($runs * 1) 
                + ($wickets * 20) 
                + ($catches * 10) 
                + ($runOuts * 10) 
                + ($sixes * 5) 
                + ($fours * 2) 
                + ($maidens * 25);

            $ranked[] = [
                'id' => $p->id,
                'name' => $p->full_name ?: $p->name,
                'team_name' => $p->preferredTeam->name ?? 'Free Agent',
                'avatar' => $p->profile_photo ?: $p->avatar,
                'runs' => $runs,
                'wickets' => $wickets,
                'sixes' => $sixes,
                'sr' => $faced >= 10 ? number_format($sr, 1) : '—',
                'sr_val' => $faced >= 10 ? $sr : 0,
                'mvp' => $mvpPoints,
            ];
        }

        $batters = collect($ranked)->sortByDesc('runs')->values()->take(10)->all();
        $bowlers = collect($ranked)->sortByDesc('wickets')->values()->take(10)->all();
        $sixesList = collect($ranked)->sortByDesc('sixes')->values()->take(10)->all();
        $strikeRates = collect($ranked)->sortByDesc('sr_val')->values()->take(10)->all();
        $mvps = collect($ranked)->sortByDesc('mvp')->values()->take(10)->all();

        return response()->json([
            'batters' => $batters,
            'bowlers' => $bowlers,
            'sixes' => $sixesList,
            'strike_rates' => $strikeRates,
            'mvp' => $mvps,
        ]);
    }

    public function manOfTheDay()
    {
        $matches = CricketMatch::where('status', 'past')
            ->where('updated_at', '>=', now()->subHours(12))
            ->get();
            
        $type = 'Last 12 Hours';

        if ($matches->isEmpty()) {
            $matches = CricketMatch::where('status', 'past')
                ->where('updated_at', '>=', now()->subHours(24))
                ->get();
            $type = 'Last 24 Hours';
        }

        if ($matches->isEmpty()) {
            $matches = CricketMatch::where('status', 'past')
                ->where('updated_at', '>=', now()->subDays(7))
                ->get();
            $type = 'Last 7 Days';
        }

        if ($matches->isEmpty()) {
            $latestMatch = CricketMatch::where('status', 'past')
                ->orderBy('updated_at', 'desc')
                ->first();
            if ($latestMatch) {
                $matches = collect([$latestMatch]);
                $type = 'Most Recent Match';
            }
        }

        if ($matches->isEmpty()) {
            return response()->json([
                'player' => null,
                'stats' => null,
                'timeframe' => null,
            ]);
        }

        $matchIds = $matches->pluck('id')->all();
        $balls = Ball::whereIn('match_id', $matchIds)->get();
        $playerIds = $balls->pluck('batter_id')->concat($balls->pluck('bowler_id'))->filter()->unique()->all();
        $players = Player::whereIn('id', $playerIds)->with('preferredTeam')->get();

        $playerStats = [];
        foreach ($players as $p) {
            $batBalls = $balls->where('batter_id', $p->id);
            $runsScored = $batBalls->sum('runs');
            $ballsFaced = $batBalls->where('extra_type', '!=', 'wide')->count();
            $sixes = $batBalls->where('runs', 6)->count();
            $fours = $batBalls->where('runs', 4)->count();

            $bowlBalls = $balls->where('bowler_id', $p->id);
            $wickets = $bowlBalls->where('is_wicket', true)->whereNotIn('wicket_type', ['run_out', 'retired_hurt'])->count();
            $runsConceded = $bowlBalls->sum('runs') + $bowlBalls->whereIn('extra_type', ['wide', 'no_ball'])->sum('extra_runs');
            $legalBowled = $bowlBalls->where('is_legal', true)->count();

            $oversGrouped = $bowlBalls->groupBy(function($b) {
                return $b->innings_id . '_' . $b->over_number;
            });
            $maidens = 0;
            foreach ($oversGrouped as $overBalls) {
                if ($overBalls->where('is_legal', true)->count() >= 6) {
                    $overRuns = $overBalls->sum('runs') + $overBalls->whereIn('extra_type', ['wide', 'no_ball'])->sum('extra_runs');
                    if ($overRuns === 0) {
                        $maidens++;
                    }
                }
            }

            $catches = $balls->where('is_wicket', true)->where('wicket_type', 'caught')->where('caught_by_id', $p->id)->count();

            $mvpPoints = $runsScored + ($wickets * 20) + ($catches * 10) + ($sixes * 5) + ($fours * 2) + ($maidens * 25);

            if ($mvpPoints > 0) {
                $playerStats[] = [
                    'player' => $p,
                    'mvp' => $mvpPoints,
                    'runs' => $runsScored,
                    'wickets' => $wickets,
                    'catches' => $catches,
                    'timeframe' => $type
                ];
            }
        }

        if (empty($playerStats)) {
            return response()->json([
                'player' => null,
                'stats' => null,
                'timeframe' => null,
            ]);
        }

        usort($playerStats, function ($a, $b) {
            return $b['mvp'] <=> $a['mvp'];
        });

        $best = $playerStats[0];

        return response()->json([
            'player' => [
                'id' => $best['player']->id,
                'name' => $best['player']->full_name ?: $best['player']->name,
                'team_name' => $best['player']->preferredTeam->name ?? 'Free Agent',
                'avatar' => $best['player']->profile_photo ?: $best['player']->avatar,
            ],
            'stats' => [
                'mvp' => $best['mvp'],
                'runs' => $best['runs'],
                'wickets' => $best['wickets'],
                'catches' => $best['catches'],
            ],
            'timeframe' => $best['timeframe']
        ]);
    }
}
