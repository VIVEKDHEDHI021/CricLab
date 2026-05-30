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
            \App\Models\User::updateOrCreate(
                ['mobile' => '9999999999'],
                [
                    'name' => 'Admin User',
                    'username' => 'admin',
                    'password' => \Illuminate\Support\Facades\Hash::make('admin123'),
                    'role' => 'admin'
                ]
            );
        } catch (\Throwable $e) {
            // Log the error but allow startup to succeed
            \Illuminate\Support\Facades\Log::error('Migration ensure_admin_user_exists failed: ' . $e->getMessage());
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        \App\Models\User::where('mobile', '9999999999')->delete();
    }
};
