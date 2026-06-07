<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Ball;
use App\Models\CricketMatch;
use App\Models\Innings;
use App\Models\Player;
use App\Models\Team;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class BallCorrectionTest extends TestCase
{
    use RefreshDatabase;

    public function test_ball_correction_and_recalculation_flow()
    {
        // 1. Setup scorer account
        $scorerId = \Illuminate\Support\Str::uuid();
        $scorerData = [
            'id' => $scorerId,
            'name' => 'Scorer User',
            'username' => 'scorer',
            'mobile' => '9898989898',
            'password' => Hash::make('scorer123'),
            'role' => 'admin',
        ];

        \App\Models\User::create($scorerData);
        $scorer = Account::create($scorerData);

        // 2. Setup Teams and Players
        $teamA = Team::create([
            'id' => \Illuminate\Support\Str::uuid(),
            'name' => 'Team A',
        ]);
        $teamB = Team::create([
            'id' => \Illuminate\Support\Str::uuid(),
            'name' => 'Team B',
        ]);

        $batter1 = Player::create([
            'id' => \Illuminate\Support\Str::uuid(),
            'name' => 'Batter 1',
            'team_id' => $teamA->id,
            'role' => 'batsman',
        ]);
        $batter2 = Player::create([
            'id' => \Illuminate\Support\Str::uuid(),
            'name' => 'Batter 2',
            'team_id' => $teamA->id,
            'role' => 'batsman',
        ]);
        $bowler = Player::create([
            'id' => \Illuminate\Support\Str::uuid(),
            'name' => 'Bowler 1',
            'team_id' => $teamB->id,
            'role' => 'bowler',
        ]);

        // 3. Setup Match
        $match = CricketMatch::create([
            'id' => \Illuminate\Support\Str::uuid(),
            'team_a_id' => $teamA->id,
            'team_b_id' => $teamB->id,
            'overs' => 5,
            'wide_run' => 1,
            'noball_run' => 1,
            'match_date' => now()->toDateTimeString(),
            'status' => 'live',
            'batting_first_id' => $teamA->id,
            'created_by' => null,
        ]);

        $innings = Innings::create([
            'id' => \Illuminate\Support\Str::uuid(),
            'match_id' => $match->id,
            'innings_no' => 1,
            'batting_team_id' => $teamA->id,
            'bowling_team_id' => $teamB->id,
            'runs' => 0,
            'wickets' => 0,
            'legal_balls' => 0,
            'is_closed' => false,
        ]);

        // 4. Add Ball 1 (Index 0, Batter 1 on strike, runs = 1, legal)
        $response = $this->actingAs($scorer, 'sanctum')->postJson("/api/innings/{$innings->id}/balls", [
            'match_id' => $match->id,
            'ball_index' => 0,
            'over_number' => 0,
            'ball_in_over' => 1,
            'batter_id' => $batter1->id,
            'non_striker_id' => $batter2->id,
            'bowler_id' => $bowler->id,
            'runs' => 1,
            'extra_runs' => 0,
            'extra_type' => null,
            'is_wicket' => false,
            'wicket_type' => null,
            'is_legal' => true,
            'caught_by_id' => null,
        ]);
        $response->assertStatus(201);
        $ball1Id = $response->json('id');

        // 5. Add Ball 2 (Index 1, Batter 2 on strike because of single, runs = 0, legal)
        $response = $this->actingAs($scorer, 'sanctum')->postJson("/api/innings/{$innings->id}/balls", [
            'match_id' => $match->id,
            'ball_index' => 1,
            'over_number' => 0,
            'ball_in_over' => 2,
            'batter_id' => $batter2->id,
            'non_striker_id' => $batter1->id,
            'bowler_id' => $bowler->id,
            'runs' => 0,
            'extra_runs' => 0,
            'extra_type' => null,
            'is_wicket' => false,
            'wicket_type' => null,
            'is_legal' => true,
            'caught_by_id' => null,
        ]);
        $response->assertStatus(201);
        $ball2Id = $response->json('id');

        // Verify innings status before edit
        $innings->refresh();
        $this->assertEquals(1, $innings->runs);
        $this->assertEquals(2, $innings->legal_balls);

        // 6. Edit Ball 1 (Index 0) to have runs = 2 (No strike rotation)
        $response = $this->actingAs($scorer, 'sanctum')->putJson("/api/balls/{$ball1Id}", [
            'batter_id' => $batter1->id,
            'non_striker_id' => $batter2->id,
            'bowler_id' => $bowler->id,
            'runs' => 2, // Changing runs from 1 to 2
            'extra_runs' => 0,
            'extra_type' => null,
            'is_wicket' => false,
            'wicket_type' => null,
            'is_legal' => true,
            'caught_by_id' => null,
        ]);
        $response->assertStatus(200);

        // 7. Verify Innings was recalculated:
        // Runs should now be 2 (from ball 1) + 0 (from ball 2) = 2.
        $innings->refresh();
        $this->assertEquals(2, $innings->runs);
        $this->assertEquals(2, $innings->legal_balls);

        // Ball 2 should have been recalculated so Batter 1 is on strike!
        $ball2 = Ball::find($ball2Id);
        $this->assertEquals($batter1->id, $ball2->batter_id);
        $this->assertEquals($batter2->id, $ball2->non_striker_id);

        // 8. Delete Ball 2
        $response = $this->actingAs($scorer, 'sanctum')->deleteJson("/api/balls/{$ball2Id}");
        $response->assertStatus(200);

        // Verify Innings after delete
        $innings->refresh();
        $this->assertEquals(2, $innings->runs);
        $this->assertEquals(1, $innings->legal_balls);
    }
}
