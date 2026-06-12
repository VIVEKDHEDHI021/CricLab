<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;

class MatchSnapshot extends Model
{
    use HasUuid;

    protected $fillable = [
        'id', 'match_id', 'innings_no', 'over_no', 'sequence_number', 'state_snapshot'
    ];

    protected $casts = [
        'innings_no' => 'integer',
        'over_no' => 'integer',
        'sequence_number' => 'integer',
        'state_snapshot' => 'array'
    ];

    public function match()
    {
        return $this->belongsTo(CricketMatch::class, 'match_id');
    }
}
