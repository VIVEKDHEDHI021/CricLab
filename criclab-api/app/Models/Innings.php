<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Attributes\Fillable;

#[Fillable([
    'match_id', 'innings_no', 'batting_team_id', 'bowling_team_id',
    'runs', 'wickets', 'legal_balls', 'is_closed'
])]
class Innings extends Model
{
    use HasUuid;

    protected $casts = [
        'is_closed' => 'boolean',
    ];

    public function match()
    {
        return $this->belongsTo(CricketMatch::class, 'match_id');
    }

    public function battingTeam()
    {
        return $this->belongsTo(Team::class, 'batting_team_id');
    }

    public function bowlingTeam()
    {
        return $this->belongsTo(Team::class, 'bowling_team_id');
    }

    public function balls()
    {
        return $this->hasMany(Ball::class);
    }
}
