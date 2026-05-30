<?php

namespace App\Http\Controllers;

use App\Models\Account;
use App\Models\Player;
use App\Services\AdminAccountService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

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
            ],
        ]);
    }
}
