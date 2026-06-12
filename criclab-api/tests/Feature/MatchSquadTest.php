<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\CricketMatch;
use App\Models\MatchSquad;
use App\Models\Player;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class MatchSquadTest extends TestCase
{
    use RefreshDatabase;

    private function getScorer()
    {
        $id = (string) Str::uuid();

        $user = new User();
        $user->id = $id;
        $user->name = 'Scorer User';
        $user->username = 'scorer_' . Str::random(5);
        $user->mobile = '98989898' . rand(10, 99);
        $user->password = Hash::make('scorer123');
        $user->role = 'admin';
        $user->save();

        $account = new Account();
        $account->id = $id;
        $account->name = $user->name;
        $account->username = $user->username;
        $account->mobile = $user->mobile;
        $account->password = $user->password;
        $account->role = $user->role;
        $account->save();

        return $account;
    }

    public function test_creating_match_initializes_squad_snapshot()
    {
        $scorer = $this->getScorer();

        $teamA = Team::create(['id' => Str::uuid(), 'name' => 'Team A']);
        $teamB = Team::create(['id' => Str::uuid(), 'name' => 'Team B']);

        $playerA = Player::create([
            'id' => Str::uuid(),
            'name' => 'Player A',
            'team_id' => $teamA->id,
            'role' => 'batsman',
            'jersey_number' => '10'
        ]);

        $playerB = Player::create([
            'id' => Str::uuid(),
            'name' => 'Player B',
            'team_id' => $teamB->id,
            'role' => 'bowler',
            'jersey_number' => '99'
        ]);

        $response = $this->actingAs($scorer)->postJson('/api/matches', [
            'team_a_id' => $teamA->id,
            'team_b_id' => $teamB->id,
            'overs' => 6,
            'wide_run' => 1,
            'noball_run' => 1,
            'match_date' => now()->toISOString(),
            'status' => 'upcoming',
            'batting_first_id' => $teamA->id,
        ]);

        $response->assertStatus(201);
        $matchId = $response->json('id');

        $this->assertDatabaseHas('match_squads', [
            'match_id' => $matchId,
            'player_id' => $playerA->id,
            'display_name' => 'Player A',
            'jersey_number' => '10',
            'role' => 'batsman',
        ]);

        $this->assertDatabaseHas('match_squads', [
            'match_id' => $matchId,
            'player_id' => $playerB->id,
            'display_name' => 'Player B',
            'jersey_number' => '99',
            'role' => 'bowler',
        ]);
    }

    public function test_updating_squad_modifies_match_squads()
    {
        $scorer = $this->getScorer();

        $teamA = Team::create(['id' => Str::uuid(), 'name' => 'Team A']);
        $teamB = Team::create(['id' => Str::uuid(), 'name' => 'Team B']);

        $match = CricketMatch::create([
            'id' => Str::uuid(),
            'team_a_id' => $teamA->id,
            'team_b_id' => $teamB->id,
            'overs' => 6,
            'wide_run' => 1,
            'noball_run' => 1,
            'status' => 'upcoming',
            'batting_first_id' => $teamA->id,
            'created_by' => $scorer->id,
        ]);

        $guestPlayerId = (string) Str::uuid();

        // Update squad with a guest player and custom attributes
        $response = $this->actingAs($scorer)->putJson("/api/matches/{$match->id}/squad", [
            'squad_a' => [
                [
                    'player_id' => $guestPlayerId,
                    'display_name' => 'Guest Player A',
                    'role' => 'all-rounder',
                    'jersey_number' => '7',
                    'captain' => true,
                    'wicket_keeper' => false,
                    'is_guest' => true,
                ]
            ],
            'squad_b' => []
        ]);

        $response->assertStatus(200);

        // Guest player should exist in match_squads
        $this->assertDatabaseHas('match_squads', [
            'match_id' => $match->id,
            'player_id' => $guestPlayerId,
            'display_name' => 'Guest Player A',
            'role' => 'all-rounder',
            'jersey_number' => '7',
            'captain' => true,
            'is_guest' => true,
        ]);

        // But guest player should NOT exist in global players table
        $this->assertDatabaseMissing('players', [
            'id' => $guestPlayerId
        ]);
    }

    public function test_cannot_update_squad_or_replace_player_once_match_is_frozen()
    {
        $scorer = $this->getScorer();

        $teamA = Team::create(['id' => Str::uuid(), 'name' => 'Team A']);
        $teamB = Team::create(['id' => Str::uuid(), 'name' => 'Team B']);

        $match = CricketMatch::create([
            'id' => Str::uuid(),
            'team_a_id' => $teamA->id,
            'team_b_id' => $teamB->id,
            'overs' => 6,
            'wide_run' => 1,
            'noball_run' => 1,
            'status' => 'live', // Frozen because status is live
            'batting_first_id' => $teamA->id,
            'created_by' => $scorer->id,
        ]);

        // Update squad should fail
        $response = $this->actingAs($scorer)->putJson("/api/matches/{$match->id}/squad", [
            'squad_a' => [],
            'squad_b' => []
        ]);
        $response->assertStatus(422);
        $response->assertJsonFragment(['message' => 'Cannot update squad. Scoring has already started.']);

        // Replace player should fail
        $newPlayer = Player::create([
            'id' => Str::uuid(),
            'name' => 'New Player',
            'team_id' => $teamA->id,
        ]);

        $responseReplace = $this->actingAs($scorer)->postJson("/api/matches/{$match->id}/replace-player", [
            'old_player_id' => Str::uuid(),
            'new_player_id' => $newPlayer->id,
        ]);
        $responseReplace->assertStatus(422);
        $responseReplace->assertJsonFragment(['message' => 'Cannot replace player. Scoring has already started.']);
    }
}
