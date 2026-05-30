<?php

namespace App\Services;

use App\Models\Account;
use App\Models\Player;
use Illuminate\Support\Facades\Hash;

class AdminAccountService
{
    /** @var array<string, array{name: string, username: string, password: string, role: string}> */
    private const BOOTSTRAP_ACCOUNTS = [
        '9429442013' => [
            'name' => 'Vivek Dhedhi',
            'username' => 'vivek',
            'password' => 'admin123',
            'role' => 'admin',
        ],
        '9999999999' => [
            'name' => 'Admin User',
            'username' => 'admin',
            'password' => 'admin123',
            'role' => 'admin',
        ],
        '8888888888' => [
            'name' => 'Scorer User',
            'username' => 'scorer',
            'password' => 'scorer123',
            'role' => 'scorer',
        ],
    ];

    public static function normalizeMobile(string $mobile): string
    {
        return preg_replace('/\D+/', '', $mobile) ?? $mobile;
    }

    public static function isBootstrapLogin(string $mobile, string $password, string $expectedRole): bool
    {
        $mobile = self::normalizeMobile($mobile);
        $account = self::BOOTSTRAP_ACCOUNTS[$mobile] ?? null;

        return $account !== null
            && $account['password'] === $password
            && $account['role'] === $expectedRole;
    }

    public static function syncDefaultAccounts(): void
    {
        foreach (self::BOOTSTRAP_ACCOUNTS as $mobile => $account) {
            self::ensureAccount(
                $mobile,
                $account['name'],
                $account['username'],
                $account['password'],
                $account['role'],
            );
        }
    }

    public static function ensureBootstrapAccount(string $mobile, string $expectedRole): ?Account
    {
        $mobile = self::normalizeMobile($mobile);
        $account = self::BOOTSTRAP_ACCOUNTS[$mobile] ?? null;

        if ($account === null || $account['role'] !== $expectedRole) {
            return null;
        }

        return self::ensureAccount(
            $mobile,
            $account['name'],
            $account['username'],
            $account['password'],
            $account['role'],
        );
    }

    public static function ensureAccount(
        string $mobile,
        string $name,
        string $username,
        string $plainPassword,
        string $role,
    ): Account {
        $mobile = self::normalizeMobile($mobile);

        $account = Account::updateOrCreate(
            ['mobile' => $mobile],
            [
                'name' => $name,
                'username' => $username,
                'password' => Hash::make($plainPassword),
                'role' => $role,
            ],
        );

        try {
            $player = Player::where('mobile', $mobile)->first();
            if ($player) {
                $player->update([
                    'user_id' => $account->id,
                    'name' => $name,
                ]);
            } else {
                Player::create([
                    'name' => $name,
                    'mobile' => $mobile,
                    'user_id' => $account->id,
                ]);
            }
        } catch (\Throwable) {
            // Player link is optional.
        }

        return $account;
    }
}
