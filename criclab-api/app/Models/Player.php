<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Attributes\Fillable;

#[Fillable(['name', 'team_id', 'mobile'])]
class Player extends Model
{
    use HasUuid;

    public function team()
    {
        return $this->belongsTo(Team::class);
    }
}
