<?php

use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('matches.{matchId}', function ($user, $matchId) {
    return true; // Any authenticated user can listen to live match updates
});

Broadcast::channel('matches', function ($user) {
    return true; // Any authenticated user can listen to the global matches channel
});
