<?php

namespace App\Http\Controllers;

use App\Models\Account;
use App\Models\Team;
use App\Models\Player;
use App\Models\CricketMatch;
use App\Models\MatchSquad;
use App\Models\Innings;
use App\Models\BallEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use ZipArchive;

class MigrationController extends Controller
{
    /**
     * Export all scoring data and media files as a compressed migration ZIP package.
     */
    public function exportMigration()
    {
        try {
            // Gather users (mapped from accounts table)
            $users = Account::all()->map(function ($row) {
                return [
                    'id' => $row->id,
                    'name' => $row->name,
                    'username' => $row->username,
                    'mobile' => $row->mobile,
                    'role' => $row->role ?? 'user',
                    'password' => $row->password,
                    'email' => $row->email,
                    'must_change_password' => $row->must_change_password ? 1 : 0,
                    'is_profile_setup_completed' => 1,
                    'created_at' => $row->created_at ? $row->created_at->toIso8601String() : now()->toIso8601String(),
                ];
            });

            // Gather other tables
            $teams = Team::withTrashed()->get();
            $players = Player::withTrashed()->get();
            $matches = CricketMatch::all();
            $matchSquads = MatchSquad::all();
            $innings = Innings::all();
            $ballEvents = BallEvent::all();
            $appSettings = []; // Empty or default settings

            // Build migration JSON
            $migrationData = [
                'version' => '1.0.0',
                'exported_at' => now()->toIso8601String(),
                'users' => $users,
                'teams' => $teams,
                'players' => $players,
                'matches' => $matches,
                'match_squads' => $matchSquads,
                'innings' => $innings,
                'ball_events' => $ballEvents,
                'app_settings' => $appSettings,
            ];

            $migrationJson = json_encode($migrationData, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

            // Create temporary zip archive
            $zipFile = tempnam(sys_get_temp_dir(), 'criclab_migration') . '.zip';
            $zip = new ZipArchive();

            if ($zip->open($zipFile, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
                return response()->json(['message' => 'Failed to create compressed migration package.'], 500);
            }

            // Add migration.json
            $zip->addFromString('migration.json', $migrationJson);

            // Scan players for media files on disk and add them
            foreach ($players as $player) {
                if ($player->avatar && !str_starts_with($player->avatar, 'data:') && !str_starts_with($player->avatar, 'http')) {
                    $possiblePaths = [
                        public_path($player->avatar),
                        storage_path('app/public/' . $player->avatar),
                        storage_path('app/' . $player->avatar),
                    ];
                    foreach ($possiblePaths as $path) {
                        if (is_file($path)) {
                            $zip->addFile($path, 'media/' . basename($player->avatar));
                            break;
                        }
                    }
                }
            }

            // Close zip archive
            $zip->close();

            // Return download response and automatically delete the temporary zip file after send
            return response()->download($zipFile, 'criclab_migration.zip')->deleteFileAfterSend(true);

        } catch (\Exception $e) {
            Log::error('Migration Export Failed: ' . $e->getMessage());
            return response()->json([
                'status' => 'error',
                'message' => 'Failed to export migration: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Export all scoring data as a JSON payload for automatic client caching.
     */
    public function exportMigrationData()
    {
        try {
            // Gather users (mapped from accounts table)
            $users = Account::all()->map(function ($row) {
                return [
                    'id' => $row->id,
                    'name' => $row->name,
                    'username' => $row->username,
                    'mobile' => $row->mobile,
                    'role' => $row->role ?? 'user',
                    'password' => $row->password,
                    'email' => $row->email,
                    'must_change_password' => $row->must_change_password ? 1 : 0,
                    'is_profile_setup_completed' => 1,
                    'created_at' => $row->created_at ? $row->created_at->toIso8601String() : now()->toIso8601String(),
                ];
            });

            $teams = Team::withTrashed()->get();
            $players = Player::withTrashed()->get();
            $matches = CricketMatch::all();
            $matchSquads = MatchSquad::all();
            $innings = Innings::all();
            $ballEvents = BallEvent::all();
            $appSettings = [];

            return response()->json([
                'version' => '1.0.0',
                'exported_at' => now()->toIso8601String(),
                'users' => $users,
                'teams' => $teams,
                'players' => $players,
                'matches' => $matches,
                'match_squads' => $matchSquads,
                'innings' => $innings,
                'ball_events' => $ballEvents,
                'app_settings' => $appSettings,
            ]);

        } catch (\Exception $e) {
            Log::error('JSON Sync Export Failed: ' . $e->getMessage());
            return response()->json([
                'status' => 'error',
                'message' => 'Failed to export sync data: ' . $e->getMessage()
            ], 500);
        }
    }
}
