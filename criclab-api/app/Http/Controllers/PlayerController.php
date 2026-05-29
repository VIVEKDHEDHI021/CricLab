<?php

namespace App\Http\Controllers;

use App\Models\Player;
use App\Models\Ball;
use App\Models\CricketMatch;
use App\Models\User;
use Illuminate\Http\Request;

class PlayerController extends Controller
{
    public function index()
    {
        $players = Player::orderBy('name')->get();
        $pastMatchIds = CricketMatch::where('status', 'past')->pluck('id')->all();
        $balls = Ball::whereIn('match_id', $pastMatchIds)->get();

        $result = [];
        foreach ($players as $p) {
            // Aggregate by mobile if available, else by unique ID
            $playerIds = $p->mobile ? Player::where('mobile', $p->mobile)->pluck('id')->all() : [$p->id];

            $bat = $balls->whereIn('batter_id', $playerIds);
            $bowl = $balls->whereIn('bowler_id', $playerIds);

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
                'user_id' => $p->user_id,
                'avatar' => $p->avatar,
                'role' => $p->role,
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

        $user = null;
        if ($request->mobile) {
            $user = User::where('mobile', $request->mobile)->first();
        }

        $player = Player::create([
            'name' => $request->name,
            'team_id' => $request->team_id,
            'mobile' => $request->mobile,
            'user_id' => $user ? $user->id : null,
        ]);

        return response()->json($player, 201);
    }

    public function show($id)
    {
        $player = Player::with('team')->findOrFail($id);
        
        // Aggregate by mobile if available, else by unique ID
        $playerIds = $player->mobile ? Player::where('mobile', $player->mobile)->pluck('id')->all() : [$player->id];

        // Only look at finished matches for official player profiles
        $pastMatchIds = CricketMatch::where('status', 'past')->pluck('id')->all();

        $bat = Ball::whereIn('batter_id', $playerIds)->whereIn('match_id', $pastMatchIds)->get();
        $bowl = Ball::whereIn('bowler_id', $playerIds)->whereIn('match_id', $pastMatchIds)->get();

        $matchIds = $bat->pluck('match_id')->concat($bowl->pluck('match_id'))->unique()->values()->all();
        $matches = CricketMatch::with(['teamA', 'teamB', 'innings'])
            ->whereIn('id', $matchIds)
            ->orderBy('match_date', 'desc')
            ->get();

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

        // Teams history
        $teamIds = $matches->pluck('team_a_id')->concat($matches->pluck('team_b_id'))->unique()->values()->all();
        if ($player->team_id) {
            $teamIds[] = $player->team_id;
        }
        $teams = \App\Models\Team::whereIn('id', array_unique($teamIds))->get(['id', 'name']);

        // Match-by-match history
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
                $playerTeamId = $player->team_id;
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

        // Sum catches and run-outs across all profiles with the same mobile
        $catches = Player::whereIn('id', $playerIds)->sum('catches');
        $runOuts = Player::whereIn('id', $playerIds)->sum('run_outs');

        return response()->json([
            'player' => $player,
            'career' => [
                'matches' => count($matchIds),
                'innings' => $bat->pluck('innings_id')->unique()->count(),
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
                'catches' => $catches,
                'run_outs' => $runOuts,
            ],
            'tournament' => [
                'runs' => $runs,
                'wickets' => $wickets,
                'average' => $batAvg,
                'strike_rate' => $sr,
            ],
            'recent' => array_slice($history, 0, 5),
            'history' => $history,
            'teams' => $teams,
        ]);
    }

    public function update(Request $request, $id)
    {
        $player = Player::findOrFail($id);
        $user = $request->user();

        if ($user->role !== 'admin' && $player->user_id !== $user->id) {
            // Allow authenticated scorers to assign/move players to teams, or update basic player info
            if ($request->has('team_id') || $request->has('name') || $request->has('mobile')) {
                $allowedKeys = ['team_id', 'name', 'mobile'];
                foreach ($request->all() as $key => $val) {
                    if (!in_array($key, $allowedKeys)) {
                        return response()->json(['message' => 'You are not authorized to update this profile.'], 403);
                    }
                }
            } else {
                return response()->json(['message' => 'You are not authorized to update this profile.'], 403);
            }
        }

        $request->validate([
            'name' => 'nullable|string|max:255',
            'avatar' => 'nullable|string',
            'role' => 'nullable|string',
            'batting_style' => 'nullable|string',
            'bowling_style' => 'nullable|string',
            'jersey_number' => 'nullable|string',
            'catches' => 'nullable|integer|min:0',
            'run_outs' => 'nullable|integer|min:0',
            'mobile' => 'nullable|string',
            'team_id' => 'nullable|uuid|exists:teams,id',
        ]);

        $player->update($request->only([
            'name', 'avatar', 'role', 'batting_style',
            'bowling_style', 'jersey_number', 'catches', 'run_outs', 'mobile', 'team_id'
        ]));

        if ($player->user_id && $request->has('name')) {
            $matchingUser = User::find($player->user_id);
            if ($matchingUser) {
                $matchingUser->update(['name' => $request->name]);
            }
        }

        if ($request->has('mobile') && $request->mobile) {
            $matchingUser = User::where('mobile', $request->mobile)->first();
            if ($matchingUser) {
                $player->update(['user_id' => $matchingUser->id]);
            }
        }

        return response()->json($player);
    }

    public function rankings()
    {
        $players = Player::all();
        
        // Only look at finished matches for official rankings
        $pastMatchIds = CricketMatch::where('status', 'past')->pluck('id')->all();
        $balls = Ball::whereIn('match_id', $pastMatchIds)->get();

        // Group players by mobile if present, otherwise by their unique player ID
        $groupedPlayers = $players->groupBy(function($p) {
            return $p->mobile ?: $p->id;
        });

        $ranked = [];
        foreach ($groupedPlayers as $key => $playerGroup) {
            $p = $playerGroup->first();
            $playerIds = $playerGroup->pluck('id')->all();

            $bat = $balls->whereIn('batter_id', $playerIds);
            $bowl = $balls->whereIn('bowler_id', $playerIds);

            $runs = $bat->sum('runs');
            $sixes = $bat->where('runs', 6)->count();
            $fours = $bat->where('runs', 4)->count();
            $wickets = $bowl->where('is_wicket', true)->count();

            $faced = $bat->where('extra_type', '!=', 'wide')->count();
            $sr = $faced > 0 ? ($runs / $faced) * 100 : 0;

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

            $catches = $playerGroup->sum('catches');
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
                'name' => $p->name,
                'team_name' => $p->team->name ?? '—',
                'avatar' => $p->avatar,
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

    public function destroy($id)
    {
        $player = Player::findOrFail($id);
        $player->delete();
        return response()->json(['message' => 'Player deleted successfully.']);
    }
}
