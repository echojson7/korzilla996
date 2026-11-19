<?php

use App\Http\Controllers\AuthController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
 * Портал раздаётся из подпапки стенда (/996/), поэтому адреса считаются
 * от базового пути запроса, а не от корня хоста.
 */
Route::get('/', fn (Request $request) => redirect()->to($request->getSchemeAndHttpHost().$request->getBasePath().'/portal/index.html'));

/* Контракт экрана входа admin2: GET auth, POST auth/login, POST auth/logout. */
Route::prefix('api')->group(function () {
    Route::get('auth', [AuthController::class, 'show']);
    Route::post('auth/login', [AuthController::class, 'login']);
    Route::post('auth/logout', [AuthController::class, 'logout']);
});
