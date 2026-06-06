<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['name', 'mobile', 'username', 'password', 'role', 'google_id', 'email', 'must_change_password'])]
#[Hidden(['password', 'remember_token'])]
class Account extends Authenticatable
{
    use HasFactory, Notifiable, HasUuid, HasApiTokens;

    protected $table = 'accounts';

    protected function casts(): array
    {
        return [
            'must_change_password' => 'boolean',
        ];
    }
}
