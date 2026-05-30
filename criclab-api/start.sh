#!/bin/bash
set -e

echo "Running database migrations..."
php artisan migrate --force

echo "Seeding admin and scorer accounts..."
php artisan tinker --execute="
use App\Models\User;
use App\Models\Player;
use Illuminate\Support\Facades\Hash;

// Ensure Vivek admin account
\$vivek = User::updateOrCreate(
    ['mobile' => '9429442013'],
    ['name' => 'Vivek Dhedhi', 'username' => 'vivek', 'password' => Hash::make('admin123'), 'role' => 'admin']
);
\$player = Player::where('mobile', '9429442013')->first();
if (\$player) {
    \$player->update(['user_id' => \$vivek->id, 'name' => 'Vivek Dhedhi']);
} else {
    Player::create(['name' => 'Vivek Dhedhi', 'mobile' => '9429442013', 'user_id' => \$vivek->id]);
}

// Ensure default admin account
User::updateOrCreate(
    ['mobile' => '9999999999'],
    ['name' => 'Admin User', 'username' => 'admin', 'password' => Hash::make('admin123'), 'role' => 'admin']
);

// Ensure default scorer account
User::updateOrCreate(
    ['mobile' => '8888888888'],
    ['name' => 'Scorer User', 'username' => 'scorer', 'password' => Hash::make('scorer123'), 'role' => 'scorer']
);

echo 'Admin and Scorer accounts synced successfully.';
"

echo "Starting Apache..."
apache2-foreground
