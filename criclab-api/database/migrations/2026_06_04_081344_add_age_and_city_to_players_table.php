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
            if (!Schema::hasColumn('players', 'age')) {
                $table->integer('age')->nullable();
            }
            if (!Schema::hasColumn('players', 'city')) {
                $table->string('city')->nullable();
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('players', function (Blueprint $table) {
            if (Schema::hasColumn('players', 'age')) {
                $table->dropColumn('age');
            }
            if (Schema::hasColumn('players', 'city')) {
                $table->dropColumn('city');
            }
        });
    }
};
