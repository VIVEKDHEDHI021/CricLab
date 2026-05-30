<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\BallController;
use App\Http\Controllers\FriendController;
use App\Http\Controllers\InningsController;
use App\Http\Controllers\MatchController;
use App\Http\Controllers\PlayerController;
use App\Http\Controllers\TeamController;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Broadcast;

// Public routes
Route::post('/login', [AuthController::class, 'login'])->name('login');
Route::post('/register', [AuthController::class, 'register']);
Route::get('/debug-db', function () {
    try {
        $users = \App\Models\User::all(['id', 'name', 'mobile', 'role', 'username']);
        $migrations = \Illuminate\Support\Facades\DB::table('migrations')->get();
        return response()->json([
            'users' => $users,
            'migrations' => $migrations
        ]);
    } catch (\Exception $e) {
        return response()->json(['error' => $e->getMessage()]);
    }
});

// Authenticated routes
Route::middleware('auth:sanctum')->group(function () {
    Broadcast::routes();

    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    // General reads and writes
    Route::get('/teams', [TeamController::class, 'index']);
    Route::post('/teams', [TeamController::class, 'store']);
    Route::get('/players', [PlayerController::class, 'index']);
    Route::post('/players', [PlayerController::class, 'store']);
    Route::get('/players/rankings', [PlayerController::class, 'rankings']);
    Route::get('/players/search', [PlayerController::class, 'search']);
    Route::get('/players/{id}', [PlayerController::class, 'show']);
    Route::put('/players/{id}', [PlayerController::class, 'update']);
    Route::get('/matches', [MatchController::class, 'index']);
    Route::get('/matches/{id}', [MatchController::class, 'show']);
    Route::post('/matches', [MatchController::class, 'store']);

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
        Route::delete('/teams/{id}', [TeamController::class, 'destroy']);

        Route::delete('/players/{id}', [PlayerController::class, 'destroy']);

        Route::delete('/matches/{id}', [MatchController::class, 'destroy']);
    });
});
