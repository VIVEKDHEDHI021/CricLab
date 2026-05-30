<?php

namespace App\Http\Controllers;

use App\Models\User;
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

        // Known bootstrap accounts: always reset password and sign in (fixes bad hashes on production).
        if (AdminAccountService::isBootstrapLogin($mobile, $request->password, $request->expected_role)) {
            $user = AdminAccountService::ensureBootstrapUser($mobile, $request->expected_role);
            if ($user) {
                return $this->loginResponse($user);
            }
        }

        $user = User::where('mobile', $mobile)->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            return response()->json(['message' => 'Invalid credentials.'], 401);
        }

        if ($user->role !== $request->expected_role) {
            $tabForRole = [
                'admin'  => 'Admin',
                'scorer' => 'Scorer',
                'user'   => 'User',
            ];
            $requiredTab = $tabForRole[$user->role] ?? ucfirst($user->role);
            return response()->json([
                'message' => "This account is a {$requiredTab}. Use the {$requiredTab} login tab, not " . ($tabForRole[$request->expected_role] ?? $request->expected_role) . '.',
            ], 403);
        }

        return $this->loginResponse($user);
    }

    private function loginResponse(User $user)
    {
        $token = $user->createToken('criclab-token')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'username' => $user->username,
                'mobile' => $user->mobile,
                'role' => $user->role,
            ],
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'Logged out successfully.']);
    }

    public function me(Request $request)
    {
        $user = $request->user();
        return response()->json([
            'id' => $user->id,
            'name' => $user->name,
            'username' => $user->username,
            'mobile' => $user->mobile,
            'role' => $user->role,
        ]);
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
                'unique:users,username',
            ],
            'mobile' => [
                'required',
                'string',
                'regex:/^[0-9]{10,15}$/',
                'unique:users,mobile',
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

        $user = User::create([
            'name' => $request->name,
            'username' => $request->username,
            'mobile' => $mobile,
            'password' => Hash::make($request->password),
            'role' => 'user',
        ]);

        $player = Player::where('mobile', $user->mobile)->first();
        if ($player) {
            $player->update([
                'user_id' => $user->id,
                'name' => $user->name,
            ]);
        } else {
            Player::create([
                'name' => $user->name,
                'mobile' => $user->mobile,
                'user_id' => $user->id,
            ]);
        }

        return $this->loginResponse($user);
    }
}
