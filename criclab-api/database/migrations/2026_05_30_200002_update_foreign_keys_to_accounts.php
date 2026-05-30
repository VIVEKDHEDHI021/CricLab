<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Disable foreign keys temporarily to avoid constraint checks during modification
        Schema::disableForeignKeyConstraints();

        // 1. players table
        Schema::table('players', function (Blueprint $table) {
            if (DB::getDriverName() !== 'sqlite') {
                $table->dropForeign('players_user_id_foreign');
            }
            $table->foreign('user_id')->references('id')->on('accounts')->onDelete('set null');
        });

        // 2. teams table
        Schema::table('teams', function (Blueprint $table) {
            if (DB::getDriverName() !== 'sqlite') {
                $table->dropForeign('teams_created_by_foreign');
            }
            $table->foreign('created_by')->references('id')->on('accounts')->onDelete('set null');
        });

        // 3. matches table
        Schema::table('matches', function (Blueprint $table) {
            if (DB::getDriverName() !== 'sqlite') {
                $table->dropForeign('matches_created_by_foreign');
            }
            $table->foreign('created_by')->references('id')->on('accounts')->onDelete('set null');
        });

        // 4. friends table
        Schema::table('friends', function (Blueprint $table) {
            if (DB::getDriverName() !== 'sqlite') {
                $table->dropForeign('friends_user_id_foreign');
                $table->dropForeign('friends_friend_user_id_foreign');
            }
            $table->foreign('user_id')->references('id')->on('accounts')->onDelete('cascade');
            $table->foreign('friend_user_id')->references('id')->on('accounts')->onDelete('cascade');
        });

        Schema::enableForeignKeyConstraints();
    }

    public function down(): void
    {
        // No down migration needed as we are migrating permanently to accounts
    }
};
