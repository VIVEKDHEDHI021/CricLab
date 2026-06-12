<?php

namespace App\Http\Controllers;

use App\Models\Account;
use App\Models\Player;
use App\Services\AdminAccountService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use App\Http\Requests\ForgotPasswordRequest;
use App\Http\Requests\ChangePasswordRequest;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $request->validate([
            'mobile' => 'required|string',
            'password' => 'required|string',
            'expected_role' => 'required|string|in:admin,user,scorer',
        ]);

        $mobile = AdminAccountService::normalizeMobile($request->mobile);

        if (AdminAccountService::isBootstrapLogin($mobile, $request->password, $request->expected_role)) {
            $account = AdminAccountService::ensureBootstrapAccount($mobile, $request->expected_role);
            if ($account) {
                return $this->loginResponse($account);
            }
        }

        $account = Account::where('mobile', $mobile)->first();

        if (!$account || !Hash::check($request->password, $account->password)) {
            return response()->json(['message' => 'Invalid credentials.'], 401);
        }

        if ($account->role !== $request->expected_role) {
            $tabForRole = [
                'admin'  => 'Admin',
                'scorer' => 'Scorer',
                'user'   => 'User',
            ];
            $requiredTab = $tabForRole[$account->role] ?? ucfirst($account->role);

            return response()->json([
                'message' => "This account is a {$requiredTab}. Use the {$requiredTab} login tab, not " . ($tabForRole[$request->expected_role] ?? $request->expected_role) . '.',
            ], 403);
        }

        return $this->loginResponse($account);
    }

    public function register(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'username' => [
                'required',
                'string',
                'min:3',
                'max:50',
                'alpha_dash',
                'unique:accounts,username',
            ],
            'mobile' => [
                'required',
                'string',
                'regex:/^[0-9]{10,15}$/',
                'unique:accounts,mobile',
            ],
            'password' => 'required|string|min:6|confirmed',
        ], [
            'username.unique' => 'This username is already taken.',
            'username.alpha_dash' => 'The username may only contain letters, numbers, dashes, and underscores.',
            'mobile.regex' => 'The mobile number must be between 10 and 15 digits.',
            'mobile.unique' => 'This mobile number is already registered.',
            'password.confirmed' => 'The password confirmation does not match.',
        ]);

        $mobile = AdminAccountService::normalizeMobile($request->mobile);

        $account = Account::create([
            'name' => $request->name,
            'username' => $request->username,
            'mobile' => $mobile,
            'password' => Hash::make($request->password),
            'role' => 'user',
        ]);

        $this->linkPlayerProfile($account);

        return $this->loginResponse($account);
    }

    public function registerAdmin(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'username' => [
                'required',
                'string',
                'min:3',
                'max:50',
                'alpha_dash',
                'unique:accounts,username',
            ],
            'mobile' => [
                'required',
                'string',
                'regex:/^[0-9]{10,15}$/',
                'unique:accounts,mobile',
            ],
            'password' => 'required|string|min:6|confirmed',
            'developer_password' => 'required|string',
        ], [
            'username.unique' => 'This username is already taken.',
            'mobile.unique' => 'This mobile number is already registered.',
            'password.confirmed' => 'The password confirmation does not match.',
        ]);

        $devPassword = config('criclab.admin_registration_password');
        if (!hash_equals((string) $devPassword, (string) $request->developer_password)) {
            return response()->json(['message' => 'Invalid developer password.'], 403);
        }

        $mobile = AdminAccountService::normalizeMobile($request->mobile);

        $account = Account::create([
            'name' => $request->name,
            'username' => $request->username,
            'mobile' => $mobile,
            'password' => Hash::make($request->password),
            'role' => 'admin',
        ]);

        $this->linkPlayerProfile($account);

        return $this->loginResponse($account);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'Logged out successfully.']);
    }

    public function me(Request $request)
    {
        $account = $request->user();

        return response()->json([
            'id' => $account->id,
            'name' => $account->name,
            'username' => $account->username,
            'mobile' => $account->mobile,
            'role' => $account->role,
            'google_id' => $account->google_id,
            'email' => $account->email,
            'must_change_password' => $account->must_change_password,
            'is_profile_setup_completed' => $this->isProfileSetupCompleted($account),
        ]);
    }

    private function linkPlayerProfile(Account $account): void
    {
        $player = Player::where('mobile', $account->mobile)->first();
        if ($player) {
            $player->update([
                'user_id' => $account->id,
                'name' => $account->name,
            ]);
        } else {
            Player::create([
                'name' => $account->name,
                'mobile' => $account->mobile,
                'user_id' => $account->id,
            ]);
        }
    }

    private function isProfileSetupCompleted(Account $account): bool
    {
        $player = Player::where('user_id', $account->id)->first();
        if (!$player) {
            $player = Player::where('mobile', $account->mobile)->first();
        }

        return (bool) ($player && $player->role && $player->batting_style);
    }

    private function loginResponse(Account $account)
    {
        $token = $account->createToken('criclab-token')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => [
                'id' => $account->id,
                'name' => $account->name,
                'username' => $account->username,
                'mobile' => $account->mobile,
                'role' => $account->role,
                'google_id' => $account->google_id,
                'email' => $account->email,
                'must_change_password' => $account->must_change_password,
            ],
        ]);
    }

    public function loginWithGoogle(Request $request)
    {
        $request->validate([
            'credential' => 'required|string',
        ]);

        $credential = $request->credential;

        try {
            $response = \Illuminate\Support\Facades\Http::get("https://oauth2.googleapis.com/tokeninfo", [
                'id_token' => $credential,
            ]);

            if (!$response->successful()) {
                return response()->json([
                    'message' => 'Invalid Google credential token.'
                ], 400);
            }

            $payload = $response->json();

            if (!isset($payload['sub']) || !isset($payload['email'])) {
                return response()->json([
                    'message' => 'Invalid token structure from Google.'
                ], 400);
            }

            $googleId = $payload['sub'];
            $email = $payload['email'];

            $account = Account::where('google_id', $googleId)
                ->orWhere('email', $email)
                ->first();

            if (!$account) {
                return response()->json([
                    'message' => 'No CricLab account is connected to this Google profile. Please log in normally first and connect Google in your settings.'
                ], 404);
            }

            if (empty($account->google_id)) {
                $account->update([
                    'google_id' => $googleId,
                    'email' => $email,
                ]);
            }

            return $this->loginResponse($account);

        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::error('Google Login Error: ' . $e->getMessage());
            return response()->json([
                'message' => 'An error occurred during Google sign-in: ' . $e->getMessage()
            ], 500);
        }
    }

    public function linkGoogleAccount(Request $request)
    {
        $request->validate([
            'credential' => 'required|string',
        ]);

        $credential = $request->credential;
        $user = $request->user();

        try {
            $response = \Illuminate\Support\Facades\Http::get("https://oauth2.googleapis.com/tokeninfo", [
                'id_token' => $credential,
            ]);

            if (!$response->successful()) {
                return response()->json([
                    'message' => 'Invalid Google credential token.'
                ], 400);
            }

            $payload = $response->json();

            if (!isset($payload['sub']) || !isset($payload['email'])) {
                return response()->json([
                    'message' => 'Invalid token structure from Google.'
                ], 400);
            }

            $googleId = $payload['sub'];
            $email = $payload['email'];

            $existing = Account::where(function($query) use ($googleId, $email) {
                    $query->where('google_id', $googleId)
                          ->orWhere('email', $email);
                })
                ->where('id', '!=', $user->id)
                ->first();

            if ($existing) {
                return response()->json([
                    'message' => 'This Google account is already connected to another CricLab account.'
                ], 422);
            }

            $user->update([
                'google_id' => $googleId,
                'email' => $email,
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Google account connected successfully.',
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'username' => $user->username,
                    'mobile' => $user->mobile,
                    'role' => $user->role,
                    'google_id' => $user->google_id,
                    'email' => $user->email,
                    'must_change_password' => $user->must_change_password,
                ]
            ]);

        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::error('Google Link Error: ' . $e->getMessage());
            return response()->json([
                'message' => 'An error occurred while connecting Google account: ' . $e->getMessage()
            ], 500);
        }
    }

    public function forgotPassword(ForgotPasswordRequest $request)
    {
        $mobile = AdminAccountService::normalizeMobile($request->mobile);
        $account = Account::where('mobile', $mobile)->first();

        if (!$account) {
            return response()->json([
                'message' => 'Mobile number not found.'
            ], 404);
        }

        return response()->json([
            'message' => 'Please contact the tournament administrator to reset your password.'
        ]);
    }

    public function changePassword(ChangePasswordRequest $request)
    {
        $account = $request->user();

        if (!Hash::check($request->current_password, $account->password)) {
            return response()->json([
                'message' => 'The current password you entered is incorrect.'
            ], 422);
        }

        $account->update([
            'password' => Hash::make($request->new_password),
            'must_change_password' => false,
        ]);

        Log::info("User ID: {$account->id} changed their password successfully.");

        return response()->json([
            'message' => 'Your password has been changed successfully.'
        ]);
    }

    public function listUsers(Request $request)
    {
        $users = Account::select('id', 'name', 'mobile', 'email', 'role', 'must_change_password')->get();
        return response()->json($users);
    }

    public function resetPassword(Request $request, $id)
    {
        $account = Account::findOrFail($id);

        // Generate secure temporary password
        $tempPassword = bin2hex(random_bytes(4)); // 8-character hex string

        $account->update([
            'password' => Hash::make($tempPassword),
            'must_change_password' => true,
        ]);

        Log::info("Admin reset password for user ID: {$account->id} ({$account->name})");

        return response()->json([
            'message' => 'Password reset successfully.',
            'temporary_password' => $tempPassword,
        ]);
    }
}
