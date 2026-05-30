<?php

use App\Services\AdminAccountService;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->json([
        'app' => 'CricLab API',
        'health' => url('/up'),
        'login' => url('/api/login'),
    ]);
});

// Fallback bootstrap URL (also available at /api/make-admin-manual)
Route::get('/make-admin-manual', function () {
    try {
        AdminAccountService::syncDefaultAccounts();
        $user = \App\Models\User::where('mobile', '9429442013')->first();

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
