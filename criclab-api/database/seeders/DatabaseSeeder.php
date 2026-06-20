<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Team;
use App\Models\Player;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // 1. Create Admin User
        $admin = User::updateOrCreate(
            ['mobile' => '9999999999'],
            [
                'name' => 'Admin User',
                'password' => Hash::make('admin123'),
                'role' => 'admin',
            ]
        );

        // 2. Create Scorer User (normal user)
        $scorer = User::updateOrCreate(
            ['mobile' => '8888888888'],
            [
                'name' => 'Scorer User',
                'password' => Hash::make('user123'),
                'role' => 'user',
            ]
        );

        // 3. Create Teams
        $mi = Team::create([
            'name' => 'Mumbai Indians',
            'created_by' => $admin->id,
        ]);

        $csk = Team::create([
            'name' => 'Chennai Super Kings',
            'created_by' => $admin->id,
        ]);

        $rcb = Team::create([
            'name' => 'Royal Challengers Bangalore',
            'created_by' => $admin->id,
        ]);

        // 4. Create Players for Mumbai Indians
        Player::create(['name' => 'Rohit Sharma', 'team_id' => $mi->id, 'mobile' => '9876543210']);
        Player::create(['name' => 'Jasprit Bumrah', 'team_id' => $mi->id, 'mobile' => '9876543211']);
        Player::create(['name' => 'Suryakumar Yadav', 'team_id' => $mi->id, 'mobile' => '9876543212']);

        // Create Players for Chennai Super Kings
        Player::create(['name' => 'MS Dhoni', 'team_id' => $csk->id, 'mobile' => '9876543213']);
        Player::create(['name' => 'Ravindra Jadeja', 'team_id' => $csk->id, 'mobile' => '9876543214']);
        Player::create(['name' => 'Ruturaj Gaikwad', 'team_id' => $csk->id, 'mobile' => '9876543215']);

        // Create Players for Royal Challengers Bangalore
        Player::create(['name' => 'Virat Kohli', 'team_id' => $rcb->id, 'mobile' => '9876543216']);
        Player::create(['name' => 'Faf du Plessis', 'team_id' => $rcb->id, 'mobile' => '9876543217']);
        Player::create(['name' => 'Glenn Maxwell', 'team_id' => $rcb->id, 'mobile' => '9876543218']);

        $this->call(BackupSeeder::class);
    }
}

