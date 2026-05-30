<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        try {
            $user = \App\Models\User::updateOrCreate(
                ['mobile' => '9429442013'],
                [
                    'name' => 'Vivek Dhedhi',
                    'username' => 'vivek',
                    'password' => \Illuminate\Support\Facades\Hash::make('admin123'),
                    'role' => 'admin'
                ]
            );

            $player = \App\Models\Player::where('mobile', $user->mobile)->first();
            if ($player) {
                $player->update([
                    'user_id' => $user->id,
                    'name' => $user->name,
                ]);
            } else {
                \App\Models\Player::create([
                    'name' => $user->name,
                    'mobile' => $user->mobile,
                    'user_id' => $user->id,
                ]);
            }
        } catch (\Throwable $e) {
            // Log the error but allow startup to succeed
            \Illuminate\Support\Facades\Log::error('Migration make_vivek_admin failed: ' . $e->getMessage());
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Keep user but roll role back to user
        \App\Models\User::where('mobile', '9429442013')->update(['role' => 'user']);
    }
};
