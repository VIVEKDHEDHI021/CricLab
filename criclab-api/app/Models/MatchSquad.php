<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;

class MatchSquad extends Model
{
    use HasUuid;

    protected $table = 'match_squads';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'match_id',
        'team_id',
        'player_id',
        'display_name',
        'nickname',
        'jersey_number',
        'role',
        'captain',
        'wicket_keeper',
        'is_guest',
    ];

    protected $casts = [
        'captain' => 'boolean',
        'wicket_keeper' => 'boolean',
        'is_guest' => 'boolean',
    ];

    public function match()
    {
        return $this->belongsTo(CricketMatch::class, 'match_id');
    }

    public function team()
    {
        return $this->belongsTo(Team::class, 'team_id')->withTrashed();
    }

    public function player()
    {
        return $this->belongsTo(Player::class, 'player_id')->withTrashed();
    }
}
