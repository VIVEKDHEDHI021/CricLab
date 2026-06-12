<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MatchSummary extends Model
{
    protected $primaryKey = 'match_id';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'match_id', 'runs_team_a', 'runs_team_b', 'wickets_team_a', 'wickets_team_b',
        'balls_team_a', 'balls_team_b', 'current_innings', 'status', 'result', 'summary_data'
    ];

    protected $casts = [
        'summary_data' => 'array',
        'runs_team_a' => 'integer',
        'runs_team_b' => 'integer',
        'wickets_team_a' => 'integer',
        'wickets_team_b' => 'integer',
        'balls_team_a' => 'integer',
        'balls_team_b' => 'integer',
        'current_innings' => 'integer'
    ];

    public function match()
    {
        return $this->belongsTo(CricketMatch::class, 'match_id');
    }
}
