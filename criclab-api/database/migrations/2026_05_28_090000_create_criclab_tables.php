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
        Schema::create('teams', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->uuid('created_by')->nullable();
            $table->timestamps();

            $table->foreign('created_by')->references('id')->on('users')->onDelete('set null');
        });

        Schema::create('players', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->uuid('team_id')->nullable();
            $table->string('mobile')->nullable();
            $table->timestamps();

            $table->foreign('team_id')->references('id')->on('teams')->onDelete('set null');
        });

        Schema::create('matches', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('team_a_id');
            $table->uuid('team_b_id');
            $table->integer('overs')->default(6);
            $table->integer('wide_run')->default(1);
            $table->integer('noball_run')->default(1);
            $table->string('match_type')->nullable();
            $table->string('ground')->nullable();
            $table->timestamp('match_date')->useCurrent();
            $table->string('status')->default('upcoming'); // upcoming | live | past
            $table->string('result')->nullable();
            $table->uuid('batting_first_id')->nullable();
            $table->integer('current_innings')->default(1);
            $table->uuid('created_by')->nullable();
            $table->timestamps();

            $table->foreign('team_a_id')->references('id')->on('teams')->onDelete('cascade');
            $table->foreign('team_b_id')->references('id')->on('teams')->onDelete('cascade');
            $table->foreign('batting_first_id')->references('id')->on('teams')->onDelete('set null');
            $table->foreign('created_by')->references('id')->on('users')->onDelete('set null');
        });

        Schema::create('innings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('match_id');
            $table->integer('innings_no');
            $table->uuid('batting_team_id');
            $table->uuid('bowling_team_id');
            $table->integer('runs')->default(0);
            $table->integer('wickets')->default(0);
            $table->integer('legal_balls')->default(0);
            $table->boolean('is_closed')->default(false);
            $table->timestamps();

            $table->unique(['match_id', 'innings_no']);
            $table->foreign('match_id')->references('id')->on('matches')->onDelete('cascade');
            $table->foreign('batting_team_id')->references('id')->on('teams')->onDelete('cascade');
            $table->foreign('bowling_team_id')->references('id')->on('teams')->onDelete('cascade');
        });

        Schema::create('balls', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('innings_id');
            $table->uuid('match_id');
            $table->integer('ball_index');
            $table->integer('over_number');
            $table->integer('ball_in_over');
            $table->uuid('batter_id')->nullable();
            $table->uuid('non_striker_id')->nullable();
            $table->uuid('bowler_id')->nullable();
            $table->integer('runs')->default(0);
            $table->integer('extra_runs')->default(0);
            $table->string('extra_type')->nullable(); // wide | no_ball | bye | leg_bye | null
            $table->boolean('is_wicket')->default(false);
            $table->string('wicket_type')->nullable();
            $table->boolean('is_legal')->default(true);
            $table->timestamps();

            $table->foreign('innings_id')->references('id')->on('innings')->onDelete('cascade');
            $table->foreign('match_id')->references('id')->on('matches')->onDelete('cascade');
            $table->foreign('batter_id')->references('id')->on('players')->onDelete('set null');
            $table->foreign('non_striker_id')->references('id')->on('players')->onDelete('set null');
            $table->foreign('bowler_id')->references('id')->on('players')->onDelete('set null');
        });

        Schema::create('friends', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id');
            $table->uuid('friend_user_id');
            $table->timestamps();

            $table->unique(['user_id', 'friend_user_id']);
            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
            $table->foreign('friend_user_id')->references('id')->on('users')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('friends');
        Schema::dropIfExists('balls');
        Schema::dropIfExists('innings');
        Schema::dropIfExists('matches');
        Schema::dropIfExists('players');
        Schema::dropIfExists('teams');
    }
};
