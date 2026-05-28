<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\BallController;
use App\Http\Controllers\FriendController;
use App\Http\Controllers\InningsController;
use App\Http\Controllers\MatchController;
use App\Http\Controllers\PlayerController;
use App\Http\Controllers\TeamController;
use Illuminate\Support\Facades\Route;

// Public routes
Route::post('/login', [AuthController::class, 'login']);

// Authenticated routes
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    // General reads
    Route::get('/teams', [TeamController::class, 'index']);
    Route::get('/players', [PlayerController::class, 'index']);
    Route::get('/matches', [MatchController::class, 'index']);
    Route::get('/matches/{id}', [MatchController::class, 'show']);

    // Live scoring actions (allowed for scorer users)
    Route::post('/matches/{matchId}/innings', [InningsController::class, 'startInnings']);
    Route::post('/innings/{inningsId}/balls', [BallController::class, 'store']);
    Route::delete('/balls/{id}', [BallController::class, 'destroy']);
    Route::patch('/matches/{id}/end', [MatchController::class, 'end']);

    // Friend connections
    Route::get('/friends', [FriendController::class, 'index']);
    Route::post('/friends', [FriendController::class, 'store']);
    Route::delete('/friends/{id}', [FriendController::class, 'destroy']);

    // Admin-only management
    Route::middleware('admin')->group(function () {
        Route::post('/teams', [TeamController::class, 'store']);
        Route::delete('/teams/{id}', [TeamController::class, 'destroy']);

        Route::post('/players', [PlayerController::class, 'store']);
        Route::delete('/players/{id}', [PlayerController::class, 'destroy']);

        Route::post('/matches', [MatchController::class, 'store']);
        Route::delete('/matches/{id}', [MatchController::class, 'destroy']);
    });
});
