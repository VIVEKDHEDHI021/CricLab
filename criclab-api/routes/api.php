<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\BallController;
use App\Http\Controllers\FriendController;
use App\Http\Controllers\InningsController;
use App\Http\Controllers\MatchController;
use App\Http\Controllers\PlayerController;
use App\Http\Controllers\TeamController;
use App\Services\AdminAccountService;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Broadcast;

// Public routes
Route::post('/login', [AuthController::class, 'login'])->name('login');
Route::post('/register', [AuthController::class, 'register']);
Route::post('/register/admin', [AuthController::class, 'registerAdmin']);
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

Route::get('/reset-db-manual', function () {
    try {
        \Illuminate\Support\Facades\Artisan::call('migrate:fresh', ['--force' => true]);
        \Illuminate\Support\Facades\Artisan::call('criclab:sync-admins');

        return response()->json([
            'status' => 'success',
            'message' => 'Live database reset and seeded successfully!',
        ]);
    } catch (\Exception $e) {
        return response()->json([
            'status' => 'error',
            'message' => $e->getMessage(),
        ], 500);
    }
});

Route::get('/test-db-connection', function () {
    try {
        $connection = \Illuminate\Support\Facades\DB::connection();
        $connection->getPdo();
        $dbName = $connection->getDatabaseName();

        return response()->json([
            'status' => 'success',
            'message' => 'Successfully connected to database!',
            'database' => $dbName,
            'driver' => $connection->getDriverName(),
        ]);
    } catch (\Exception $e) {
        return response()->json([
            'status' => 'error',
            'message' => $e->getMessage(),
            'host' => env('DB_HOST'),
            'port' => env('DB_PORT'),
            'database' => env('DB_DATABASE'),
            'username' => env('DB_USERNAME'),
            'connection_name' => env('DB_CONNECTION'),
        ], 500);
    }
});

Route::get('/test-register-error', function () {
    try {
        DB::beginTransaction();

        $username = 'test_' . time();
        $mobile = '9' . str_pad(rand(0, 999999999), 9, '0', STR_PAD_LEFT);
        
        $account = \App\Models\Account::create([
            'name' => 'Test User ' . time(),
            'username' => $username,
            'mobile' => $mobile,
            'password' => Hash::make('password123'),
            'role' => 'user',
        ]);

        $player = \App\Models\Player::where('mobile', $account->mobile)->first();
        if ($player) {
            $player->update([
                'user_id' => $account->id,
                'name' => $account->name,
            ]);
        } else {
            \App\Models\Player::create([
                'name' => $account->name,
                'mobile' => $account->mobile,
                'user_id' => $account->id,
            ]);
        }

        DB::rollBack();

        return response()->json([
            'status' => 'success',
            'message' => 'Simulated registration completed successfully!',
            'account' => $account,
        ]);
    } catch (\Exception $e) {
        DB::rollBack();
        return response()->json([
            'status' => 'error',
            'message' => $e->getMessage(),
            'trace' => $e->getTraceAsString(),
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
