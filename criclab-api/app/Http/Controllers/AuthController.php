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
        Log::info("Login attempt initiated", [
            'mobile' => $request->mobile,
            'expected_role' => $request->expected_role,
            'ip' => $request->ip()
        ]);

        try {
            $request->validate([
                'mobile' => 'required|string',
                'password' => 'required|string',
                'expected_role' => 'required|string|in:admin,user,scorer',
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            Log::warning("Login request validation failed", [
                'mobile' => $request->mobile,
                'errors' => $e->errors()
            ]);
            throw $e;
        }

        try {
            $mobile = AdminAccountService::normalizeMobile($request->mobile);
            Log::debug("Mobile number normalized", ['original' => $request->mobile, 'normalized' => $mobile]);

            if (AdminAccountService::isBootstrapLogin($mobile, $request->password, $request->expected_role)) {
                Log::info("Bootstrap login match found", ['mobile' => $mobile, 'role' => $request->expected_role]);
                $account = AdminAccountService::ensureBootstrapAccount($mobile, $request->expected_role);
                if ($account) {
                    Log::info("Bootstrap login succeeded", ['user_id' => $account->id]);
                    return $this->loginResponse($account);
                }
            }

            $account = Account::where('mobile', $mobile)->first();
            Log::debug("User lookup complete", ['found' => $account !== null, 'mobile' => $mobile]);

            if (!$account) {
                Log::warning("Login failed: User not found in database", ['mobile' => $mobile]);
                return response()->json(['message' => 'Invalid credentials.'], 401);
            }

            if (!Hash::check($request->password, $account->password)) {
                Log::warning("Login failed: Password mismatch", ['user_id' => $account->id]);
                return response()->json(['message' => 'Invalid credentials.'], 401);
            }

            if ($account->role !== $request->expected_role) {
                $tabForRole = [
                    'admin'  => 'Admin',
                    'scorer' => 'Scorer',
                    'user'   => 'User',
                ];
                $requiredTab = $tabForRole[$account->role] ?? ucfirst($account->role);

                Log::warning("Login failed: Role mismatch", [
                    'user_id' => $account->id,
                    'actual_role' => $account->role,
                    'expected_role' => $request->expected_role
                ]);

                return response()->json([
                    'message' => "This account is a {$requiredTab}. Use the {$requiredTab} login tab, not " . ($tabForRole[$request->expected_role] ?? $request->expected_role) . '.',
                ], 403);
            }

            Log::info("User credentials validated. Sending response.", ['user_id' => $account->id]);
            return $this->loginResponse($account);

        } catch (\Exception $e) {
            Log::error("Unhandled exception during login process", [
                'message' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
                'payload' => $request->except('password')
            ]);
            return response()->json(['message' => 'An internal server error occurred during login.'], 500);
        }
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
        try {
            $token = $account->createToken('criclab-token')->plainTextToken;
            Log::info("Sanctum token successfully generated", ['user_id' => $account->id]);

            return response()->json([
                'success' => true,
                'token' => $token,
                'user' => [
                    'id' => $account->id,
                    'name' => $account->name,
                    'username' => $account->username,
                    'mobile' => $account->mobile,
                    'role' => $account->role,
                    'email' => $account->email,
                    'must_change_password' => $account->must_change_password,
                ],
            ]);
        } catch (\Exception $e) {
            Log::error("Sanctum token generation failed", [
                'user_id' => $account->id,
                'message' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            return response()->json(['message' => 'Failed to initialize session.'], 500);
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
