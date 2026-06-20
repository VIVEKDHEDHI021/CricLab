<?php

namespace App\Models;

use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Attributes\Fillable;

#[Fillable([
    'name', 'full_name', 'mobile', 'email', 'user_id', 'dob', 'city', 'state', 'country', 
    'profile_photo', 'avatar', 'bio', 'primary_role', 'role', 'batting_style', 'bowling_style', 
    'bowling_type', 'jersey_number', 'preferred_team_id', 'team_id', 'created_by', 'catches', 'run_outs', 'age'
])]
class Player extends Model
{
    use HasUuid, SoftDeletes;

    public function preferredTeam()
    {
        return $this->belongsTo(Team::class, 'preferred_team_id')->withTrashed();
    }

    public function user()
    {
        return $this->belongsTo(Account::class, 'user_id');
    }

    public function creator()
    {
        return $this->belongsTo(Account::class, 'created_by');
    }

    public function getNameAttribute($value)
    {
        $name = $value ?: ($this->attributes['full_name'] ?? '');
        return $this->trashed() ? $name . ' (Deleted)' : $name;
    }

    public function setNameAttribute($value)
    {
        $this->attributes['name'] = $value;
        $this->attributes['full_name'] = $value;
    }

    public function getRoleAttribute($value)
    {
        return $value ?: ($this->attributes['primary_role'] ?? '');
    }

    public function setRoleAttribute($value)
    {
        $this->attributes['role'] = $value;
        $this->attributes['primary_role'] = $value;
    }

    public function getAvatarAttribute($value)
    {
        return $value ?: ($this->attributes['profile_photo'] ?? '');
    }

    public function setAvatarAttribute($value)
    {
        $this->attributes['avatar'] = $value;
        $this->attributes['profile_photo'] = $value;
    }

    public function getTeamIdAttribute($value)
    {
        return $value ?: ($this->attributes['preferred_team_id'] ?? null);
    }

    public function setTeamIdAttribute($value)
    {
        $this->attributes['team_id'] = $value;
        $this->attributes['preferred_team_id'] = $value;
    }
}
