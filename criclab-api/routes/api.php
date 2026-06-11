<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\BallController;
use App\Http\Controllers\FriendController;
use App\Http\Controllers\InningsController;
use App\Http\Controllers\MatchController;
use App\Http\Controllers\PlayerController;
use App\Http\Controllers\TeamController;
use App\Http\Controllers\BackupController;
use App\Services\AdminAccountService;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Broadcast;

// Public routes
Route::post('/login', [AuthController::class, 'login'])->name('login')->middleware('throttle:6,1');
Route::post('/register', [AuthController::class, 'register']);
Route::post('/register/admin', [AuthController::class, 'registerAdmin']);
Route::post('/auth/google/login', [AuthController::class, 'loginWithGoogle']);
Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);
Route::get('/make-admin-manual', function () {
    try {
        AdminAccountService::syncDefaultAccounts();
        $user = \App\Models\Account::where('mobile', '9429442013')->first();

        return response()->json([
            'status' => 'success',
            'message' => 'Admin accounts created/updated successfully!',
            'user' => $user,
        ]);
    } catch (\Exception $e) {
        return response()->json([
            'status' => 'error',
            'message' => $e->getMessage(),
        ], 500);
    }
});

// Authenticated routes
Route::middleware(['auth:sanctum', 'force_password_change'])->group(function () {
    Broadcast::routes();

    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/auth/google/link', [AuthController::class, 'linkGoogleAccount']);
    Route::post('/change-password', [AuthController::class, 'changePassword']);

    // General reads and writes
    Route::get('/teams', [TeamController::class, 'index']);
    Route::post('/teams', [TeamController::class, 'store']);
    Route::get('/players', [PlayerController::class, 'index']);
    Route::post('/players', [PlayerController::class, 'store']);
    Route::get('/players/rankings', [PlayerController::class, 'rankings']);
    Route::get('/players/search', [PlayerController::class, 'search']);
    Route::get('/players/man-of-the-day', [PlayerController::class, 'manOfTheDay']);
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
        Route::patch('/innings/{id}/close', [InningsController::class, 'closeInnings']);
        Route::post('/innings/{inningsId}/balls', [BallController::class, 'store']);
        Route::delete('/balls/{id}', [BallController::class, 'destroy']);
        Route::put('/balls/{id}', [BallController::class, 'update']);
        Route::patch('/matches/{id}/end', [MatchController::class, 'end']);
        Route::put('/matches/{id}', [MatchController::class, 'update']);
        Route::post('/matches/{id}/replace-player', [MatchController::class, 'replacePlayer']);
    });

    // Friend connections
    Route::get('/friends', [FriendController::class, 'index']);
    Route::post('/friends', [FriendController::class, 'store']);
    Route::delete('/friends/{id}', [FriendController::class, 'destroy']);

    // Backup & Restore
    Route::get('/backup/export', [BackupController::class, 'export']);
    Route::post('/backup/import', [BackupController::class, 'import']);

    // Admin-only management
    Route::middleware('admin')->group(function () {
        Route::delete('/teams/{id}', [TeamController::class, 'destroy']);
        Route::delete('/players/{id}', [PlayerController::class, 'destroy']);
        Route::get('/admin/users', [AuthController::class, 'listUsers']);
        Route::post('/admin/users/{id}/reset-password', [AuthController::class, 'resetPassword']);
    });
});
