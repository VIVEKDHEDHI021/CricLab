<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\SoftDeletes;

#[Fillable([
    'innings_id', 'match_id', 'ball_index', 'over_number', 'ball_in_over',
    'batter_id', 'non_striker_id', 'bowler_id', 'runs', 'extra_runs',
    'extra_type', 'is_wicket', 'wicket_type', 'is_legal', 'caught_by_id'
])]
class Ball extends Model
{
    use HasUuid, SoftDeletes;

    protected $casts = [
        'is_wicket' => 'boolean',
        'is_legal' => 'boolean',
    ];

    public function innings()
    {
        return $this->belongsTo(Innings::class);
    }

    public function match()
    {
        return $this->belongsTo(CricketMatch::class, 'match_id');
    }

    public function batter()
    {
        return $this->belongsTo(Player::class, 'batter_id')->withTrashed();
    }

    public function nonStriker()
    {
        return $this->belongsTo(Player::class, 'non_striker_id')->withTrashed();
    }

    public function bowler()
    {
        return $this->belongsTo(Player::class, 'bowler_id')->withTrashed();
    }

    public function caughtBy()
    {
        return $this->belongsTo(Player::class, 'caught_by_id')->withTrashed();
    }
}
