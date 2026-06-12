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
        Schema::create('match_squads', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('match_id');
            $table->uuid('team_id');
            $table->uuid('player_id')->nullable(); // Nullable to accommodate guest players without global IDs
            $table->string('display_name');
            $table->string('nickname')->nullable();
            $table->string('jersey_number')->nullable();
            $table->string('role')->nullable();
            $table->boolean('captain')->default(false);
            $table->boolean('wicket_keeper')->default(false);
            $table->boolean('is_guest')->default(false);
            $table->timestamps();

            $table->foreign('match_id')->references('id')->on('matches')->onDelete('cascade');
            $table->foreign('team_id')->references('id')->on('teams')->onDelete('cascade');
            
            // Non-guest players should only be registered once in a match's squad
            $table->unique(['match_id', 'player_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('match_squads');
    }
};
