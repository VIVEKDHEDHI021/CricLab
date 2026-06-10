<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Attributes\Fillable;

#[Fillable(['name', 'created_by'])]
class Team extends Model
{
    use HasUuid, SoftDeletes;

    public function players()
    {
        return $this->hasMany(Player::class);
    }

    public function creator()
    {
        return $this->belongsTo(Account::class, 'created_by');
    }

    public function getNameAttribute($value)
    {
        return $this->trashed() ? $value . ' (Deleted)' : $value;
    }
}
