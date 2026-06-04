<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Attributes\Fillable;

#[Fillable(['name', 'team_id', 'mobile', 'user_id', 'avatar', 'role', 'batting_style', 'bowling_style', 'jersey_number', 'catches', 'run_outs', 'age', 'city'])]
class Player extends Model
{
    use HasUuid;

    public function team()
    {
        return $this->belongsTo(Team::class);
    }

    public function user()
    {
        return $this->belongsTo(Account::class, 'user_id');
    }
}
