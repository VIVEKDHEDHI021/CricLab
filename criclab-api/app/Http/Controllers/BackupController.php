<?php

namespace App\Http\Controllers;

use App\Models\Team;
use App\Models\Player;
use App\Models\CricketMatch;
use App\Models\Innings;
use App\Models\Ball;
use App\Models\Account;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class BackupController extends Controller
{
    /**
     * Export all scoring data to JSON.
     */
    public function export()
    {
        $data = [
            'version' => '1.0.0',
            'exported_at' => now()->toIso8601String(),
            'teams' => Team::withTrashed()->get(),
            'players' => Player::withTrashed()->get(),
            'matches' => CricketMatch::all(),
            'innings' => Innings::all(),
            'balls' => Ball::all(),
        ];

        return response()->json($data);
    }

    /**
     * Import scoring data from JSON.
     */
    public function import(Request $request)
    {
        $request->validate([
            'backup_file' => 'required|file|mimes:json,txt',
        ]);

        try {
            $content = file_get_contents($request->file('backup_file')->getRealPath());
            $data = json_decode($content, true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                return response()->json(['message' => 'Invalid JSON structure in backup file.'], 400);
            }

            // Verify basic keys
            $requiredKeys = ['teams', 'players', 'matches', 'innings', 'balls'];
            foreach ($requiredKeys as $key) {
                if (!isset($data[$key]) || !is_array($data[$key])) {
                    return response()->json(['message' => "Missing or invalid data list: '{$key}'."], 400);
                }
            }

            $currentUserId = $request->user()->id;

            // Cache existing accounts to avoid redundant database hits
            $userExists = function ($userId) {
                if (!$userId) return false;
                return Account::where('id', $userId)->exists();
            };

            DB::transaction(function () use ($data, $currentUserId, $userExists) {
                $driver = DB::connection()->getDriverName();
                
                // Temporarily disable foreign keys for safe relational inserts
                if ($driver === 'sqlite') {
                    DB::statement('PRAGMA foreign_keys = OFF;');
                } elseif ($driver === 'mysql') {
                    DB::statement('SET FOREIGN_KEY_CHECKS = 0;');
                }

                // 1. Teams
                foreach ($data['teams'] as $row) {
                    $createdBy = $row['created_by'] ?? null;
                    if ($createdBy && !$userExists($createdBy)) {
                        $createdBy = $currentUserId;
                    }

                    $team = Team::withTrashed()->find($row['id']);
                    if (!$team) {
                        $team = new Team();
                        $team->id = $row['id'];
                    }
                    $team->forceFill([
                        'name' => $row['name'],
                        'created_by' => $createdBy,
                        'created_at' => $row['created_at'] ?? now(),
                        'updated_at' => $row['updated_at'] ?? now(),
                    ])->save();

                    if (isset($row['deleted_at']) && $row['deleted_at']) {
                        $team->deleted_at = $row['deleted_at'];
                        $team->save();
                    } else {
                        $team->restore();
                    }
                }

                // 2. Players
                foreach ($data['players'] as $row) {
                    $player = Player::withTrashed()->find($row['id']);
                    if (!$player) {
                        $player = new Player();
                        $player->id = $row['id'];
                    }
                    $player->forceFill([
                        'name' => $row['name'],
                        'team_id' => $row['team_id'] ?? null,
                        'mobile' => $row['mobile'] ?? null,
                        'user_id' => $row['user_id'] ?? null,
                        'avatar' => $row['avatar'] ?? null,
                        'role' => $row['role'] ?? null,
                        'batting_style' => $row['batting_style'] ?? null,
                        'bowling_style' => $row['bowling_style'] ?? null,
                        'jersey_number' => $row['jersey_number'] ?? null,
                        'catches' => $row['catches'] ?? 0,
                        'run_outs' => $row['run_outs'] ?? 0,
                        'age' => $row['age'] ?? null,
                        'city' => $row['city'] ?? null,
                        'created_at' => $row['created_at'] ?? now(),
                        'updated_at' => $row['updated_at'] ?? now(),
                    ])->save();

                    if (isset($row['deleted_at']) && $row['deleted_at']) {
                        $player->deleted_at = $row['deleted_at'];
                        $player->save();
                    } else {
                        $player->restore();
                    }
                }

                // 3. Matches
                foreach ($data['matches'] as $row) {
                    $createdBy = $row['created_by'] ?? null;
                    if ($createdBy && !$userExists($createdBy)) {
                        $createdBy = $currentUserId;
                    }

                    $match = CricketMatch::find($row['id']);
                    if (!$match) {
                        $match = new CricketMatch();
                        $match->id = $row['id'];
                    }
                    $match->forceFill([
                        'team_a_id' => $row['team_a_id'],
                        'team_b_id' => $row['team_b_id'],
                        'overs' => $row['overs'] ?? 6,
                        'wide_run' => $row['wide_run'] ?? 1,
                        'noball_run' => $row['noball_run'] ?? 1,
                        'match_type' => $row['match_type'] ?? null,
                        'ground' => $row['ground'] ?? null,
                        'match_date' => $row['match_date'],
                        'status' => $row['status'] ?? 'upcoming',
                        'result' => $row['result'] ?? null,
                        'batting_first_id' => $row['batting_first_id'] ?? null,
                        'current_innings' => $row['current_innings'] ?? 1,
                        'created_by' => $createdBy,
                        'last_man_batting' => $row['last_man_batting'] ?? false,
                        'man_of_the_match_id' => $row['man_of_the_match_id'] ?? null,
                        'created_at' => $row['created_at'] ?? now(),
                        'updated_at' => $row['updated_at'] ?? now(),
                    ])->save();
                }

                // 4. Innings
                foreach ($data['innings'] as $row) {
                    $innings = Innings::find($row['id']);
                    if (!$innings) {
                        $innings = new Innings();
                        $innings->id = $row['id'];
                    }
                    $innings->forceFill([
                        'match_id' => $row['match_id'],
                        'innings_no' => $row['innings_no'],
                        'batting_team_id' => $row['batting_team_id'],
                        'bowling_team_id' => $row['bowling_team_id'],
                        'runs' => $row['runs'] ?? 0,
                        'wickets' => $row['wickets'] ?? 0,
                        'legal_balls' => $row['legal_balls'] ?? 0,
                        'is_closed' => $row['is_closed'] ?? false,
                        'created_at' => $row['created_at'] ?? now(),
                        'updated_at' => $row['updated_at'] ?? now(),
                    ])->save();
                }

                // 5. Balls
                foreach ($data['balls'] as $row) {
                    $ball = Ball::find($row['id']);
                    if (!$ball) {
                        $ball = new Ball();
                        $ball->id = $row['id'];
                    }
                    $ball->forceFill([
                        'innings_id' => $row['innings_id'],
                        'match_id' => $row['match_id'],
                        'ball_index' => $row['ball_index'],
                        'over_number' => $row['over_number'],
                        'ball_in_over' => $row['ball_in_over'],
                        'batter_id' => $row['batter_id'] ?? null,
                        'non_striker_id' => $row['non_striker_id'] ?? null,
                        'bowler_id' => $row['bowler_id'] ?? null,
                        'runs' => $row['runs'] ?? 0,
                        'extra_runs' => $row['extra_runs'] ?? 0,
                        'extra_type' => $row['extra_type'] ?? null,
                        'is_wicket' => $row['is_wicket'] ?? false,
                        'wicket_type' => $row['wicket_type'] ?? null,
                        'is_legal' => $row['is_legal'] ?? true,
                        'caught_by_id' => $row['caught_by_id'] ?? null,
                        'created_at' => $row['created_at'] ?? now(),
                        'updated_at' => $row['updated_at'] ?? now(),
                    ])->save();
                }

                // Re-enable foreign keys
                if ($driver === 'sqlite') {
                    DB::statement('PRAGMA foreign_keys = ON;');
                } elseif ($driver === 'mysql') {
                    DB::statement('SET FOREIGN_KEY_CHECKS = 1;');
                }
            });

            return response()->json([
                'status' => 'success',
                'message' => 'Database backup restored successfully.'
            ]);

        } catch (\Exception $e) {
            Log::error('Backup Restore Failed: ' . $e->getMessage());
            return response()->json([
                'status' => 'error',
                'message' => 'Failed to restore backup: ' . $e->getMessage()
            ], 500);
        }
    }
}
