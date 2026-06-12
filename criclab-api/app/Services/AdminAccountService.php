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

        $existing = Account::where('mobile', $mobile)->first();
        if ($existing && $existing->role === $expectedRole) {
            $updates = [];
            if ($existing->name !== $account['name']) {
                $updates['name'] = $account['name'];
            }
            if ($existing->username !== $account['username']) {
                $updates['username'] = $account['username'];
            }
            if (!empty($updates)) {
                $existing->update($updates);
            }

            try {
                $player = Player::where('mobile', $mobile)->first();
                if ($player) {
                    if ($player->user_id !== $existing->id || $player->name !== $account['name']) {
                        $player->update([
                            'user_id' => $existing->id,
                            'name' => $account['name'],
                        ]);
                    }
                } else {
                    Player::create([
                        'name' => $account['name'],
                        'mobile' => $mobile,
                        'user_id' => $existing->id,
                    ]);
                }
            } catch (\Throwable) {
                // Player link is optional.
            }

            return $existing;
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

        $account = Account::where('mobile', $mobile)->first();

        if ($account) {
            $updates = [];
            if ($account->name !== $name) {
                $updates['name'] = $name;
            }
            if ($account->username !== $username) {
                $updates['username'] = $username;
            }
            if ($account->role !== $role) {
                $updates['role'] = $role;
            }
            if (!Hash::check($plainPassword, $account->password)) {
                $updates['password'] = Hash::make($plainPassword);
            }

            if (!empty($updates)) {
                $account->update($updates);
            }
        } else {
            $account = Account::create([
                'mobile' => $mobile,
                'name' => $name,
                'username' => $username,
                'password' => Hash::make($plainPassword),
                'role' => $role,
            ]);
        }

        try {
            $player = Player::where('mobile', $mobile)->first();
            if ($player) {
                if ($player->user_id !== $account->id || $player->name !== $name) {
                    $player->update([
                        'user_id' => $account->id,
                        'name' => $name,
                    ]);
                }
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
