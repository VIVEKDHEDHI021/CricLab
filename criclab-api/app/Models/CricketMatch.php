<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Attributes\Fillable;

#[Fillable([
    'team_a_id', 'team_b_id', 'overs', 'wide_run', 'noball_run',
    'match_type', 'ground', 'match_date', 'status', 'result',
    'batting_first_id', 'current_innings', 'created_by', 'last_man_batting'
])]
class CricketMatch extends Model
{
    use HasUuid;

    protected $table = 'matches';

    protected $casts = [
        'last_man_batting' => 'boolean',
    ];

    public function teamA()
    {
        return $this->belongsTo(Team::class, 'team_a_id');
    }

    public function teamB()
    {
        return $this->belongsTo(Team::class, 'team_b_id');
    }

    public function battingFirst()
    {
        return $this->belongsTo(Team::class, 'batting_first_id');
    }

    public function innings()
    {
        return $this->hasMany(Innings::class, 'match_id');
    }

    public function balls()
    {
        return $this->hasMany(Ball::class, 'match_id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
