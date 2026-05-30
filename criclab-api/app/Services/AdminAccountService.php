<?php

namespace App\Services;

use App\Models\Player;
use App\Models\User;

class AdminAccountService
{
    public static function normalizeMobile(string $mobile): string
    {
        return preg_replace('/\D+/', '', $mobile) ?? $mobile;
    }

    public static function syncDefaultAccounts(): void
    {
        self::ensureAccount('9429442013', 'Vivek Dhedhi', 'vivek', 'admin123', 'admin');
        self::ensureAccount('9999999999', 'Admin User', 'admin', 'admin123', 'admin');
        self::ensureAccount('8888888888', 'Scorer User', 'scorer', 'scorer123', 'scorer');
    }

    public static function ensureAccount(
        string $mobile,
        string $name,
        string $username,
        string $plainPassword,
        string $role,
    ): User {
        $mobile = self::normalizeMobile($mobile);

        $user = User::updateOrCreate(
            ['mobile' => $mobile],
            [
                'name' => $name,
                'username' => $username,
                // User model uses the "hashed" cast — pass plain text only.
                'password' => $plainPassword,
                'role' => $role,
            ],
        );

        $player = Player::where('mobile', $mobile)->first();
        if ($player) {
            $player->update([
                'user_id' => $user->id,
                'name' => $name,
            ]);
        } else {
            Player::create([
                'name' => $name,
                'mobile' => $mobile,
                'user_id' => $user->id,
            ]);
        }

        return $user;
    }
}
