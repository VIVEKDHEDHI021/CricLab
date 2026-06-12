<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;

class BallEvent extends Model
{
    use HasUuid;

    protected $primaryKey = 'event_uuid';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'event_uuid', 'event_type', 'sequence_number', 'match_id', 'innings_no',
        'over_no', 'ball_no', 'striker_id', 'non_striker_id', 'bowler_id',
        'batting_team_id', 'bowling_team_id', 'runs_off_bat', 'extras', 'extra_type',
        'wicket', 'wicket_type', 'dismissed_player_id', 'legal_delivery', 'scorer_id',
        'device_timestamp', 'metadata'
    ];

    protected $casts = [
        'wicket' => 'boolean',
        'legal_delivery' => 'boolean',
        'metadata' => 'array',
        'device_timestamp' => 'integer'
    ];

    public function match()
    {
        return $this->belongsTo(CricketMatch::class, 'match_id');
    }

    public function striker()
    {
        return $this->belongsTo(Player::class, 'striker_id')->withTrashed();
    }

    public function nonStriker()
    {
        return $this->belongsTo(Player::class, 'non_striker_id')->withTrashed();
    }

    public function bowler()
    {
        return $this->belongsTo(Player::class, 'bowler_id')->withTrashed();
    }

    public function dismissedPlayer()
    {
        return $this->belongsTo(Player::class, 'dismissed_player_id')->withTrashed();
    }
}
