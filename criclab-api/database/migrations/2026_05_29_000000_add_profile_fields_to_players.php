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
        Schema::table('players', function (Blueprint $table) {
            if (!Schema::hasColumn('players', 'user_id')) {
                $table->uuid('user_id')->nullable();
                $table->foreign('user_id')->references('id')->on('users')->onDelete('set null');
            }
            if (!Schema::hasColumn('players', 'avatar')) {
                $table->string('avatar')->nullable();
            }
            if (!Schema::hasColumn('players', 'role')) {
                $table->string('role')->nullable();
            }
            if (!Schema::hasColumn('players', 'batting_style')) {
                $table->string('batting_style')->nullable();
            }
            if (!Schema::hasColumn('players', 'bowling_style')) {
                $table->string('bowling_style')->nullable();
            }
            if (!Schema::hasColumn('players', 'jersey_number')) {
                $table->string('jersey_number')->nullable();
            }
            if (!Schema::hasColumn('players', 'catches')) {
                $table->integer('catches')->default(0);
            }
            if (!Schema::hasColumn('players', 'run_outs')) {
                $table->integer('run_outs')->default(0);
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('players', function (Blueprint $table) {
            // Keep empty to avoid dropping pre-existing columns
        });
    }
};
