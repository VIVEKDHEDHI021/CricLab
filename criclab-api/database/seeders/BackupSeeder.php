<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class BackupSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $backupDir = database_path('seeders/backup');
        if (!is_dir($backupDir)) {
            $this->command->warn("Backup directory not found at: {$backupDir}");
            return;
        }

        $files = glob($backupDir . '/*.json');
        if (empty($files)) {
            $this->command->info("No backup JSON files found in: {$backupDir}");
            return;
        }

        $driver = DB::connection()->getDriverName();
        if ($driver === 'sqlite') {
            DB::statement('PRAGMA foreign_keys = OFF;');
        } elseif ($driver === 'mysql') {
            DB::statement('SET FOREIGN_KEY_CHECKS = 0;');
        }

        $userCounter = 1;
        $userExists = function ($userId) {
            if (!$userId) return false;
            return DB::table('accounts')->where('id', $userId)->exists();
        };

        // Align Vivek's account ID if it exists with mobile 9429442013
        $vivek = DB::table('accounts')->where('mobile', '9429442013')->first();
        if ($vivek && $vivek->id !== 'eaf2961d-af3c-43d6-84af-c0a7d0caf67b') {
            DB::table('accounts')->where('mobile', '9429442013')->update(['id' => 'eaf2961d-af3c-43d6-84af-c0a7d0caf67b']);
            DB::table('users')->where('mobile', '9429442013')->update(['id' => 'eaf2961d-af3c-43d6-84af-c0a7d0caf67b']);
            DB::table('players')->where('mobile', '9429442013')->update(['user_id' => 'eaf2961d-af3c-43d6-84af-c0a7d0caf67b']);
        }

        foreach ($files as $file) {
            $this->command->info("Processing backup file: " . basename($file));
            $content = file_get_contents($file);
            $data = json_decode($content, true);

            if (json_last_error() !== JSON_ERROR_NONE || !$data) {
                $this->command->error("Invalid JSON in file: " . basename($file));
                continue;
            }

            // Verify basic keys
            $requiredKeys = ['teams', 'players', 'matches', 'innings', 'balls'];
            foreach ($requiredKeys as $key) {
                if (!isset($data[$key]) || !is_array($data[$key])) {
                    $this->command->warn("Missing key '{$key}' in file: " . basename($file));
                    continue 2;
                }
            }

            // 1. Scan for created_by UUIDs and ensure they exist
            $referencedUserIds = [];
            foreach ($data['teams'] as $team) {
                if (!empty($team['created_by'])) {
                    $referencedUserIds[] = $team['created_by'];
                }
            }
            foreach ($data['matches'] as $match) {
                if (!empty($match['created_by'])) {
                    $referencedUserIds[] = $match['created_by'];
                }
            }
            $referencedUserIds = array_unique($referencedUserIds);

            foreach ($referencedUserIds as $userId) {
                if (!$userExists($userId)) {
                    // Create a placeholder user/account
                    $dummyMobile = '980000' . str_pad($userCounter++, 4, '0', STR_PAD_LEFT);
                    
                    // Insert into accounts
                    DB::table('accounts')->insertOrIgnore([
                        'id' => $userId,
                        'name' => 'Imported User ' . $userId,
                        'username' => 'imported_user_' . $userId,
                        'mobile' => $dummyMobile,
                        'password' => Hash::make('admin123'),
                        'role' => 'user',
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);

                    // Insert into users (old table structure)
                    DB::table('users')->insertOrIgnore([
                        'id' => $userId,
                        'name' => 'Imported User ' . $userId,
                        'mobile' => $dummyMobile,
                        'password' => Hash::make('admin123'),
                        'role' => 'user',
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            }

            // 2. Import Teams
            foreach ($data['teams'] as $row) {
                $createdBy = $row['created_by'] ?? null;
                if ($createdBy && !$userExists($createdBy)) {
                    $createdBy = null;
                }

                DB::table('teams')->updateOrInsert(
                    ['id' => $row['id']],
                    [
                        'name' => $row['name'],
                        'created_by' => $createdBy,
                        'created_at' => $row['created_at'] ?? now(),
                        'updated_at' => $row['updated_at'] ?? now(),
                        'deleted_at' => $row['deleted_at'] ?? null,
                    ]
                );
            }

            // 3. Import Players
            $playerNames = [];
            foreach ($data['players'] as $row) {
                $playerNames[$row['id']] = $row['name'];

                DB::table('players')->updateOrInsert(
                    ['id' => $row['id']],
                    [
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
                        'deleted_at' => $row['deleted_at'] ?? null,
                    ]
                );
            }

            // 4. Import Matches
            foreach ($data['matches'] as $row) {
                $createdBy = $row['created_by'] ?? null;
                if ($createdBy && !$userExists($createdBy)) {
                    $createdBy = null;
                }

                $squadAIds = $row['squad_a_ids'] ?? [];
                $squadBIds = $row['squad_b_ids'] ?? [];

                // Encode arrays as json for DB storage if it's MySQL/SQLite text field
                $squadAJson = is_array($squadAIds) ? json_encode($squadAIds) : $squadAIds;
                $squadBJson = is_array($squadBIds) ? json_encode($squadBIds) : $squadBIds;

                DB::table('matches')->updateOrInsert(
                    ['id' => $row['id']],
                    [
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
                        'squad_a_ids' => $squadAJson,
                        'squad_b_ids' => $squadBJson,
                        'created_at' => $row['created_at'] ?? now(),
                        'updated_at' => $row['updated_at'] ?? now(),
                    ]
                );

                // Populate match_squads table from squad_a_ids and squad_b_ids
                if (is_array($squadAIds)) {
                    foreach ($squadAIds as $playerId) {
                        DB::table('match_squads')->updateOrInsert(
                            ['match_id' => $row['id'], 'player_id' => $playerId],
                            [
                                'id' => (string) Str::uuid(),
                                'team_id' => $row['team_a_id'],
                                'display_name' => $playerNames[$playerId] ?? 'Player',
                                'created_at' => now(),
                                'updated_at' => now(),
                            ]
                        );
                    }
                }

                if (is_array($squadBIds)) {
                    foreach ($squadBIds as $playerId) {
                        DB::table('match_squads')->updateOrInsert(
                            ['match_id' => $row['id'], 'player_id' => $playerId],
                            [
                                'id' => (string) Str::uuid(),
                                'team_id' => $row['team_b_id'],
                                'display_name' => $playerNames[$playerId] ?? 'Player',
                                'created_at' => now(),
                                'updated_at' => now(),
                            ]
                        );
                    }
                }
            }

            // 5. Import Innings
            foreach ($data['innings'] as $row) {
                DB::table('innings')->updateOrInsert(
                    ['id' => $row['id']],
                    [
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
                    ]
                );
            }

            // 6. Import Balls
            foreach ($data['balls'] as $row) {
                DB::table('balls')->updateOrInsert(
                    ['id' => $row['id']],
                    [
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
                    ]
                );
            }
        }

        if ($driver === 'sqlite') {
            DB::statement('PRAGMA foreign_keys = ON;');
        } elseif ($driver === 'mysql') {
            DB::statement('SET FOREIGN_KEY_CHECKS = 1;');
        }

        $this->command->info("Backup restore complete!");
    }
}
