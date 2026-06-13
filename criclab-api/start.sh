#!/bin/bash
set -e

echo "Running database migrations..."
php artisan migrate --force

echo "Syncing default admin and scorer accounts..."
php artisan criclab:sync-admins

echo "Ensuring database and storage permissions..."
chown -R www-data:www-data /var/www/html/database /var/www/html/storage
chmod -R 775 /var/www/html/database /var/www/html/storage

echo "Starting Apache..."
apache2-foreground
