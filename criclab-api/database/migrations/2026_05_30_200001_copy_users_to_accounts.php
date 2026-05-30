<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('users') || !Schema::hasTable('accounts')) {
            return;
        }

        $users = DB::table('users')->get();

        foreach ($users as $user) {
            DB::table('accounts')->updateOrInsert(
                ['mobile' => $user->mobile],
                [
                    'id' => $user->id,
                    'name' => $user->name,
                    'username' => $user->username ?? null,
                    'password' => $user->password,
                    'role' => $user->role ?? 'user',
                    'created_at' => $user->created_at,
                    'updated_at' => $user->updated_at,
                ],
            );
        }
    }

    public function down(): void
    {
        // Keep accounts data on rollback.
    }
};
