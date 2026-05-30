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
Route::get('/make-admin-manual', function () {
    try {
        $user = \App\Models\User::updateOrCreate(
            ['mobile' => '9429442013'],
            [
                'name' => 'Vivek Dhedhi',
                'username' => 'vivek',
                'password' => \Illuminate\Support\Facades\Hash::make('admin123'),
                'role' => 'admin'
            ]
        );

        $player = \App\Models\Player::where('mobile', $user->mobile)->first();
        if ($player) {
            $player->update([
                'user_id' => $user->id,
                'name' => $user->name,
            ]);
        } else {
            $player = \App\Models\Player::create([
                'name' => $user->name,
                'mobile' => $user->mobile,
                'user_id' => $user->id,
            ]);
        }

        return response()->json([
            'status' => 'success',
            'message' => 'Admin created/updated successfully!',
            'user' => $user,
            'player' => $player
        ]);
    } catch (\Exception $e) {
        return response()->json([
            'status' => 'error',
            'message' => $e->getMessage()
        ], 500);
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

    // Scorer-only actions (admin can also do these)
    Route::middleware('scorer')->group(function () {
        Route::post('/matches', [MatchController::class, 'store']);
        Route::delete('/matches/{id}', [MatchController::class, 'destroy']);

        // Live scoring actions
        Route::post('/matches/{matchId}/innings', [InningsController::class, 'startInnings']);
        Route::post('/innings/{inningsId}/balls', [BallController::class, 'store']);
        Route::delete('/balls/{id}', [BallController::class, 'destroy']);
        Route::patch('/matches/{id}/end', [MatchController::class, 'end']);
    });

    // Friend connections
    Route::get('/friends', [FriendController::class, 'index']);
    Route::post('/friends', [FriendController::class, 'store']);
    Route::delete('/friends/{id}', [FriendController::class, 'destroy']);

    // Admin-only management
    Route::middleware('admin')->group(function () {
        Route::delete('/teams/{id}', [TeamController::class, 'destroy']);
        Route::delete('/players/{id}', [PlayerController::class, 'destroy']);
    });
});
