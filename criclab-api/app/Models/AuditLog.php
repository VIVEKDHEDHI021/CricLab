<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    use HasUuid;

    protected $fillable = [
        'id', 'match_id', 'event_uuid', 'action_type', 'user_id', 'description', 'old_state', 'new_state', 'device_timestamp'
    ];

    protected $casts = [
        'old_state' => 'array',
        'new_state' => 'array',
        'device_timestamp' => 'integer'
    ];

    public function match()
    {
        return $this->belongsTo(CricketMatch::class, 'match_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
