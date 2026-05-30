#!/bin/bash
set -e

echo "Running database migrations..."
php artisan migrate --force

echo "Seeding admin accounts..."
php artisan tinker --execute="
use App\Models\User;
use App\Models\Player;
use Illuminate\Support\Facades\Hash;

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
User::updateOrCreate(
    ['mobile' => '9999999999'],
    ['name' => 'Admin User', 'username' => 'admin', 'password' => Hash::make('admin123'), 'role' => 'admin']
);
echo 'Admin accounts synced successfully.';
"

echo "Starting Apache..."
apache2-foreground
