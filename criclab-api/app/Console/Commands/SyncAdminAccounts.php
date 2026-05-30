<?php

namespace App\Console\Commands;

use App\Services\AdminAccountService;
use Illuminate\Console\Command;

class SyncAdminAccounts extends Command
{
    protected $signature = 'criclab:sync-admins';

    protected $description = 'Create or repair default admin and scorer accounts';

    public function handle(): int
    {
        AdminAccountService::syncDefaultAccounts();
        $this->info('Default CricLab accounts synced.');

        return self::SUCCESS;
    }
}
