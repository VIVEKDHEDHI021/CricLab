<?php

namespace Tests\Feature;

use App\Models\Account;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class PasswordResetTest extends TestCase
{
    use RefreshDatabase;

    public function test_forgot_password_workflow()
    {
        $account = Account::create([
            'id' => \Illuminate\Support\Str::uuid(),
            'name' => 'Test Player',
            'username' => 'testplayer',
            'mobile' => '8888888888',
            'password' => Hash::make('player123'),
            'role' => 'user',
        ]);

        // Non-existent mobile should fail
        $response = $this->postJson('/api/forgot-password', [
            'mobile' => '1111111111',
        ]);
        $response->assertStatus(404);

        // Registered mobile should return specific message
        $response = $this->postJson('/api/forgot-password', [
            'mobile' => '8888888888',
        ]);
        $response->assertStatus(200)
            ->assertJson([
                'message' => 'Please contact the tournament administrator to reset your password.',
            ]);
    }

    public function test_admin_password_reset_and_forced_change_workflow()
    {
        $admin = Account::where('mobile', '9999999999')->first() ?? Account::create([
            'id' => \Illuminate\Support\Str::uuid(),
            'name' => 'Admin User',
            'username' => 'admin',
            'mobile' => '9999999999',
            'password' => Hash::make('admin123'),
            'role' => 'admin',
        ]);

        $user = Account::create([
            'id' => \Illuminate\Support\Str::uuid(),
            'name' => 'Test Player',
            'username' => 'testplayer',
            'mobile' => '8888888888',
            'password' => Hash::make('player123'),
            'role' => 'user',
        ]);

        // Admin lists users
        $response = $this->actingAs($admin)->getJson('/api/admin/users');
        $response->assertStatus(200)
            ->assertJsonFragment(['name' => 'Test Player']);

        // Admin resets user's password
        $response = $this->actingAs($admin)->postJson("/api/admin/users/{$user->id}/reset-password");
        $response->assertStatus(200)
            ->assertJsonStructure(['message', 'temporary_password']);

        $tempPassword = $response->json('temporary_password');
        $this->assertNotEmpty($tempPassword);

        // Fresh user model should show must_change_password is true
        $user->refresh();
        $this->assertTrue($user->must_change_password);

        // Logging in with old password should fail
        $response = $this->postJson('/api/login', [
            'mobile' => '8888888888',
            'password' => 'player123',
            'expected_role' => 'user',
        ]);
        $response->assertStatus(401);

        // Logging in with temporary password should succeed and return must_change_password: true
        $response = $this->postJson('/api/login', [
            'mobile' => '8888888888',
            'password' => $tempPassword,
            'expected_role' => 'user',
        ]);
        $response->assertStatus(200)
            ->assertJsonPath('user.must_change_password', true);

        $token = $response->json('token');

        // Trying to access generic authenticated route (e.g. GET /api/teams) should be blocked by ForcePasswordChange middleware
        $response = $this->actingAs($user, 'sanctum')
            ->getJson('/api/teams');
        $response->assertStatus(403)
            ->assertJson([
                'message' => 'You must change your password before you can proceed.',
                'code' => 'MUST_CHANGE_PASSWORD',
            ]);

        // Trying to access GET /api/me should be allowed
        $response = $this->actingAs($user, 'sanctum')
            ->getJson('/api/me');
        $response->assertStatus(200)
            ->assertJsonPath('must_change_password', true);

        // Change password request with invalid current password should fail
        $response = $this->actingAs($user, 'sanctum')
            ->postJson('/api/change-password', [
                'current_password' => 'wrongpass',
                'new_password' => 'player321',
                'new_password_confirmation' => 'player321',
            ]);
        $response->assertStatus(422);

        // Change password request with valid credentials should succeed
        $response = $this->actingAs($user, 'sanctum')
            ->postJson('/api/change-password', [
                'current_password' => $tempPassword,
                'new_password' => 'player321',
                'new_password_confirmation' => 'player321',
            ]);
        $response->assertStatus(200)
            ->assertJson([
                'message' => 'Your password has been changed successfully.',
            ]);

        // must_change_password should now be false
        $user->refresh();
        $this->assertFalse($user->must_change_password);
        $this->assertTrue(Hash::check('player321', $user->password));

        // Now accessing /api/teams should be allowed
        $response = $this->actingAs($user, 'sanctum')
            ->getJson('/api/teams');
        $response->assertStatus(200);
    }
}
