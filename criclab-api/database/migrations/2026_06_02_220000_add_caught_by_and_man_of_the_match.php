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
        Schema::table('balls', function (Blueprint $table) {
            $table->uuid('caught_by_id')->nullable();
            $table->foreign('caught_by_id')->references('id')->on('players')->onDelete('set null');
        });

        Schema::table('matches', function (Blueprint $table) {
            $table->uuid('man_of_the_match_id')->nullable();
            $table->foreign('man_of_the_match_id')->references('id')->on('players')->onDelete('set null');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('matches', function (Blueprint $table) {
            $table->dropForeign(['man_of_the_match_id']);
            $table->dropColumn('man_of_the_match_id');
        });

        Schema::table('balls', function (Blueprint $table) {
            $table->dropForeign(['caught_by_id']);
            $table->dropColumn('caught_by_id');
        });
    }
};
