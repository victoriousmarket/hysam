<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\DataSyncController;

Route::get('/data', [DataSyncController::class, 'pull']);
Route::post('/data', [DataSyncController::class, 'push']);

Route::post('/external-db/test', [DataSyncController::class, 'testConnection']);
Route::post('/external-db/init-schema', [DataSyncController::class, 'initSchema']);
Route::post('/external-db/push', [DataSyncController::class, 'pushExternal']);
Route::post('/external-db/pull', [DataSyncController::class, 'pullExternal']);
