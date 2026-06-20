<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class ImportMigrationJsonSeeder extends Seeder
{
    public function run(): void
    {
        $filePath = database_path('seeders/backup/migration.json');

        if (!file_exists($filePath)) {
            $this->command->error("Migration file not found at: {$filePath}");
            return;
        }

        $this->command->info("Reading migration.json...");
        $content = file_get_contents($filePath);
        $data = json_decode($content, true);

        if (json_last_error() !== JSON_ERROR_NONE || !$data) {
            $this->command->error("Invalid JSON content in migration.json");
            return;
        }

        $this->command->info("Disabling foreign keys check...");
        DB::statement('PRAGMA foreign_keys = OFF;');

        try {
            DB::transaction(function () use ($data) {
                // Clear existing tables
                $this->command->info("Clearing existing tables...");
                DB::table('ball_events')->delete();
                DB::table('innings')->delete();
                DB::table('match_squads')->delete();
                DB::table('matches')->delete();
                DB::table('players')->delete();
                DB::table('teams')->delete();
                DB::table('accounts')->delete();
                DB::table('users')->delete();

                // 1. Import Users (accounts & users tables)
                $users = $data['users'] ?? [];
                $this->command->info("Importing " . count($users) . " users...");
                foreach ($users as $u) {
                    // Seed accounts table
                    DB::table('accounts')->insert([
                        'id' => $u['id'],
                        'name' => $u['name'],
                        'username' => $u['username'] ?? null,
                        'mobile' => $u['mobile'],
                        'password' => $u['password'],
                        'role' => $u['role'] ?? 'user',
                        'email' => $u['email'] ?? null,
                        'must_change_password' => $u['must_change_password'] ?? 0,
                        'created_at' => $u['created_at'] ?? now(),
                        'updated_at' => $u['updated_at'] ?? now(),
                    ]);

                    // Seed users table for backward compatibility
                    DB::table('users')->insert([
                        'id' => $u['id'],
                        'name' => $u['name'],
                        'mobile' => $u['mobile'],
                        'password' => $u['password'],
                        'role' => $u['role'] ?? 'user',
                        'created_at' => $u['created_at'] ?? now(),
                        'updated_at' => $u['updated_at'] ?? now(),
                    ]);
                }

                // 2. Import Teams
                $teams = $data['teams'] ?? [];
                $this->command->info("Importing " . count($teams) . " teams...");
                foreach ($teams as $t) {
                    DB::table('teams')->insert([
                        'id' => $t['id'],
                        'name' => $t['name'],
                        'created_by' => $t['created_by'] ?? null,
                        'created_at' => $t['created_at'] ?? now(),
                        'updated_at' => $t['updated_at'] ?? now(),
                        'deleted_at' => $t['deleted_at'] ?? null,
                    ]);
                }

                // 3. Import Players
                $players = $data['players'] ?? [];
                $this->command->info("Importing " . count($players) . " players...");
                foreach ($players as $p) {
                    DB::table('players')->insert([
                        'id' => $p['id'],
                        'name' => $p['name'],
                        'team_id' => $p['team_id'] ?? null,
                        'mobile' => $p['mobile'] ?? null,
                        'user_id' => $p['user_id'] ?? null,
                        'avatar' => $p['avatar'] ?? null,
                        'role' => $p['role'] ?? null,
                        'batting_style' => $p['batting_style'] ?? null,
                        'bowling_style' => $p['bowling_style'] ?? null,
                        'jersey_number' => $p['jersey_number'] ?? null,
                        'catches' => $p['catches'] ?? 0,
                        'run_outs' => $p['run_outs'] ?? 0,
                        'age' => $p['age'] ?? null,
                        'city' => $p['city'] ?? null,
                        'created_at' => $p['created_at'] ?? now(),
                        'updated_at' => $p['updated_at'] ?? now(),
                        'deleted_at' => $p['deleted_at'] ?? null,
                    ]);
                }

                // 4. Import Matches
                $matches = $data['matches'] ?? [];
                $this->command->info("Importing " . count($matches) . " matches...");
                foreach ($matches as $m) {
                    $squadA = isset($m['squad_a_ids']) ? (is_array($m['squad_a_ids']) ? json_encode($m['squad_a_ids']) : $m['squad_a_ids']) : null;
                    $squadB = isset($m['squad_b_ids']) ? (is_array($m['squad_b_ids']) ? json_encode($m['squad_b_ids']) : $m['squad_b_ids']) : null;

                    DB::table('matches')->insert([
                        'id' => $m['id'],
                        'team_a_id' => $m['team_a_id'],
                        'team_b_id' => $m['team_b_id'],
                        'overs' => $m['overs'] ?? 6,
                        'wide_run' => $m['wide_run'] ?? 1,
                        'noball_run' => $m['noball_run'] ?? 1,
                        'match_type' => $m['match_type'] ?? null,
                        'ground' => $m['ground'] ?? null,
                        'match_date' => $m['match_date'],
                        'status' => $m['status'] ?? 'upcoming',
                        'result' => $m['result'] ?? null,
                        'batting_first_id' => $m['batting_first_id'] ?? null,
                        'current_innings' => $m['current_innings'] ?? 1,
                        'last_man_batting' => $m['last_man_batting'] ?? 0,
                        'man_of_the_match_id' => $m['man_of_the_match_id'] ?? null,
                        'squad_a_ids' => $squadA,
                        'squad_b_ids' => $squadB,
                        'created_by' => $m['created_by'] ?? null,
                        'created_at' => $m['created_at'] ?? now(),
                        'updated_at' => $m['updated_at'] ?? now(),
                    ]);
                }

                // 5. Import Match Squads
                $matchSquads = $data['match_squads'] ?? [];
                $this->command->info("Importing " . count($matchSquads) . " match squads...");
                foreach ($matchSquads as $ms) {
                    DB::table('match_squads')->insert([
                        'id' => $ms['id'],
                        'match_id' => $ms['match_id'],
                        'player_id' => $ms['player_id'],
                        'team_id' => $ms['team_id'],
                        'display_name' => $ms['display_name'] ?? 'Player',
                        'role' => $ms['role'] ?? null,
                        'jersey_number' => $ms['jersey_number'] ?? null,
                        'captain' => $ms['captain'] ?? 0,
                        'wicket_keeper' => $ms['wicket_keeper'] ?? 0,
                        'is_guest' => $ms['is_guest'] ?? 0,
                        'nickname' => $ms['nickname'] ?? null,
                        'created_at' => $ms['created_at'] ?? now(),
                        'updated_at' => $ms['updated_at'] ?? now(),
                    ]);
                }

                // 6. Import Innings
                $innings = $data['innings'] ?? [];
                $this->command->info("Importing " . count($innings) . " innings...");
                foreach ($innings as $inn) {
                    DB::table('innings')->insert([
                        'id' => $inn['id'],
                        'match_id' => $inn['match_id'],
                        'innings_no' => $inn['innings_no'],
                        'batting_team_id' => $inn['batting_team_id'],
                        'bowling_team_id' => $inn['bowling_team_id'],
                        'runs' => $inn['runs'] ?? 0,
                        'wickets' => $inn['wickets'] ?? 0,
                        'legal_balls' => $inn['legal_balls'] ?? 0,
                        'is_closed' => $inn['is_closed'] ?? 0,
                        'created_at' => $inn['created_at'] ?? now(),
                        'updated_at' => $inn['updated_at'] ?? now(),
                    ]);
                }

                // 7. Import Ball Events
                $ballEvents = $data['ball_events'] ?? [];
                $this->command->info("Importing " . count($ballEvents) . " ball events...");
                foreach ($ballEvents as $e) {
                    $metadata = isset($e['metadata']) ? (is_array($e['metadata']) ? json_encode($e['metadata']) : $e['metadata']) : null;

                    DB::table('ball_events')->insert([
                        'event_uuid' => $e['event_uuid'],
                        'event_type' => $e['event_type'],
                        'sequence_number' => $e['sequence_number'],
                        'match_id' => $e['match_id'],
                        'innings_no' => $e['innings_no'],
                        'over_no' => $e['over_no'] ?? null,
                        'ball_no' => $e['ball_no'] ?? null,
                        'striker_id' => $e['striker_id'] ?? null,
                        'non_striker_id' => $e['non_striker_id'] ?? null,
                        'bowler_id' => $e['bowler_id'] ?? null,
                        'batting_team_id' => $e['batting_team_id'] ?? null,
                        'bowling_team_id' => $e['bowling_team_id'] ?? null,
                        'runs_off_bat' => $e['runs_off_bat'] ?? 0,
                        'extras' => $e['extras'] ?? 0,
                        'extra_type' => $e['extra_type'] ?? null,
                        'wicket' => $e['wicket'] ?? 0,
                        'wicket_type' => $e['wicket_type'] ?? null,
                        'dismissed_player_id' => $e['dismissed_player_id'] ?? null,
                        'legal_delivery' => $e['legal_delivery'] ?? 1,
                        'scorer_id' => $e['scorer_id'] ?? null,
                        'device_timestamp' => $e['device_timestamp'] ?? null,
                        'metadata' => $metadata,
                        'created_at' => $e['created_at'] ?? now(),
                        'updated_at' => $e['updated_at'] ?? now(),
                    ]);
                }
            });

            $this->command->info("Data seeding from migration.json completed successfully!");
        } catch (\Exception $e) {
            $this->command->error("Transaction failed: " . $e->getMessage());
            Log::error("Seeder failed", ['msg' => $e->getMessage(), 'trace' => $e->getTraceAsString()]);
        } finally {
            $this->command->info("Re-enabling foreign keys check...");
            DB::statement('PRAGMA foreign_keys = ON;');
        }
    }
}
