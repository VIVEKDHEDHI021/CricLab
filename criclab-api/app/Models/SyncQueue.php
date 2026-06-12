<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;

class SyncQueue extends Model
{
    use HasUuid;

    protected $table = 'sync_queue';

    protected $fillable = [
        'id', 'event_uuid', 'match_id', 'status', 'attempts', 'last_error'
    ];

    protected $casts = [
        'attempts' => 'integer'
    ];
}
