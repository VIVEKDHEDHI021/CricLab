<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

if ($argc < 3) {
    echo "Usage: php reset_passwords.php [mobile] [new_password]\n";
    echo "Example: php reset_passwords.php 9313097619 123456\n";
    exit(1);
}

$mobile = $argv[1];
$newPassword = $argv[2];

$user = App\Models\Account::where('mobile', $mobile)->first();
if (!$user) {
    echo "User with mobile {$mobile} not found.\n";
    exit(1);
}

$user->password = Illuminate\Support\Facades\Hash::make($newPassword);
$user->save();

echo "Successfully updated password for {$user->name} ({$user->mobile}) to '{$newPassword}'.\n";
