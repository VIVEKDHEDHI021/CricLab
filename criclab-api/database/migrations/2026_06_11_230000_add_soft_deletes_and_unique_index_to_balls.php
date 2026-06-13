<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // 1. Clean up duplicate deliveries (keeping the oldest/first one)
        DB::table('balls')
            ->whereNotIn('id', function ($query) {
                $query->select('min_id')
                    ->from(function ($sub) {
                        $sub->select(DB::raw('MIN(id) as min_id'))
                            ->from('balls')
                            ->groupBy('innings_id', 'ball_index');
                    }, 'temp');
            })
            ->delete();

        Schema::table('balls', function (Blueprint $table) {
            // Add soft deletes if it doesn't exist
            if (!Schema::hasColumn('balls', 'deleted_at')) {
                $table->softDeletes();
            }
            
            // Add unique constraint on active deliveries
            $table->unique(['innings_id', 'ball_index'], 'unique_innings_ball_index');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('balls', function (Blueprint $table) {
            $table->dropUnique('unique_innings_ball_index');
            $table->dropSoftDeletes();
        });
    }
};
