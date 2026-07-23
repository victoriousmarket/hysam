<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\DataSyncController;
use App\Http\Controllers\AuthController;

Route::prefix('api')->group(function () {
    // Auth routes
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    // Secure Data Sync & DB endpoints (requires active session)
    Route::middleware('auth')->group(function () {
        Route::get('/data', [DataSyncController::class, 'pull']);
        Route::post('/data', [DataSyncController::class, 'push']);
    });
});

// Catch-all SPA route
Route::get('{any}', function () {
    return view('app');
})->where('any', '.*');
