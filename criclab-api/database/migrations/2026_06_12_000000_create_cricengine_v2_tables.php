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
        Schema::create('ball_events', function (Blueprint $table) {
            $table->uuid('event_uuid')->primary();
            $table->string('event_type');
            $table->integer('sequence_number');
            $table->uuid('match_id');
            $table->integer('innings_no');
            $table->integer('over_no')->nullable();
            $table->integer('ball_no')->nullable();
            $table->uuid('striker_id')->nullable();
            $table->uuid('non_striker_id')->nullable();
            $table->uuid('bowler_id')->nullable();
            $table->uuid('batting_team_id')->nullable();
            $table->uuid('bowling_team_id')->nullable();
            $table->integer('runs_off_bat')->default(0);
            $table->integer('extras')->default(0);
            $table->string('extra_type')->nullable(); // wide | no_ball | bye | leg_bye
            $table->boolean('wicket')->default(false);
            $table->string('wicket_type')->nullable();
            $table->uuid('dismissed_player_id')->nullable();
            $table->boolean('legal_delivery')->default(true);
            $table->uuid('scorer_id')->nullable();
            $table->bigInteger('device_timestamp');
            $table->text('metadata')->nullable(); // JSON data
            $table->timestamps();

            $table->foreign('match_id')->references('id')->on('matches')->onDelete('cascade');
        });

        Schema::create('match_summaries', function (Blueprint $table) {
            $table->uuid('match_id')->primary();
            $table->integer('runs_team_a')->default(0);
            $table->integer('runs_team_b')->default(0);
            $table->integer('wickets_team_a')->default(0);
            $table->integer('wickets_team_b')->default(0);
            $table->integer('balls_team_a')->default(0);
            $table->integer('balls_team_b')->default(0);
            $table->integer('current_innings')->default(1);
            $table->string('status')->default('upcoming');
            $table->string('result')->nullable();
            $table->text('summary_data')->nullable(); // JSON details
            $table->timestamps();

            $table->foreign('match_id')->references('id')->on('matches')->onDelete('cascade');
        });

        Schema::create('match_snapshots', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('match_id');
            $table->integer('innings_no');
            $table->integer('over_no');
            $table->integer('sequence_number');
            $table->text('state_snapshot'); // JSON representation of Replay state
            $table->timestamps();

            $table->foreign('match_id')->references('id')->on('matches')->onDelete('cascade');
            $table->unique(['match_id', 'innings_no', 'over_no']);
        });

        Schema::create('sync_queue', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('event_uuid');
            $table->uuid('match_id');
            $table->string('status')->default('pending'); // pending, synced, failed
            $table->integer('attempts')->default(0);
            $table->text('last_error')->nullable();
            $table->timestamps();
        });

        Schema::create('audit_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('match_id');
            $table->uuid('event_uuid')->nullable();
            $table->string('action_type');
            $table->uuid('user_id')->nullable();
            $table->text('description');
            $table->text('old_state')->nullable();
            $table->text('new_state')->nullable();
            $table->bigInteger('device_timestamp');
            $table->timestamps();

            $table->foreign('match_id')->references('id')->on('matches')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('sync_queue');
        Schema::dropIfExists('match_snapshots');
        Schema::dropIfExists('match_summaries');
        Schema::dropIfExists('ball_events');
    }
};
