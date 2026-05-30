#!/bin/bash
set -e

echo "Running database migrations..."
php artisan migrate --force

echo "Syncing default admin and scorer accounts..."
php artisan criclab:sync-admins

echo "Starting Apache..."
apache2-foreground
