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
        Schema::table('players', function (Blueprint $table) {
            if (DB::getDriverName() !== 'sqlite') {
                try {
                    $table->dropForeign(['team_id']);
                } catch (\Exception $e) {
                    // Ignore if foreign key doesn't exist
                }
                $table->dropColumn('team_id');
            }

            $table->string('full_name')->nullable();
            $table->string('email')->nullable();
            $table->string('dob')->nullable();
            $table->string('state')->nullable();
            $table->string('country')->nullable();
            $table->string('profile_photo')->nullable();
            $table->text('bio')->nullable();
            $table->string('primary_role')->nullable();
            $table->string('bowling_type')->nullable();
            $table->uuid('preferred_team_id')->nullable();
            $table->uuid('created_by')->nullable();

            $table->foreign('preferred_team_id')->references('id')->on('teams')->onDelete('set null');
            $table->foreign('created_by')->references('id')->on('accounts')->onDelete('set null');
        });

        // Copy existing values of name to full_name
        DB::table('players')->whereNull('full_name')->update([
            'full_name' => DB::raw('name')
        ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('players', function (Blueprint $table) {
            if (DB::getDriverName() !== 'sqlite') {
                try {
                    $table->dropForeign(['preferred_team_id']);
                    $table->dropForeign(['created_by']);
                } catch (\Exception $e) {
                    // Ignore
                }
            }
            $table->dropColumn([
                'full_name', 'email', 'dob', 'state', 'country', 'profile_photo',
                'bio', 'primary_role', 'bowling_type', 'preferred_team_id', 'created_by'
            ]);

            if (DB::getDriverName() !== 'sqlite') {
                $table->uuid('team_id')->nullable();
                $table->foreign('team_id')->references('id')->on('teams')->onDelete('set null');
            }
        });
    }
};
