<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\MessengerController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
 * Портал может лежать и в подпапке, поэтому адреса считаются
 * от базового пути запроса, а не от корня хоста.
 */
Route::get('/', fn (Request $request) => redirect()->to($request->getSchemeAndHttpHost().$request->getBasePath().'/portal/index.html'));

/* Контракт экрана входа admin2: GET auth, POST auth/login, POST auth/logout. */
Route::prefix('api')->group(function () {
    Route::get('auth', [AuthController::class, 'show']);
    Route::post('auth/login', [AuthController::class, 'login']);
    Route::post('auth/logout', [AuthController::class, 'logout']);

    /* Мессенджер: только для вошедших. */
    Route::prefix('messenger')->middleware('auth')->controller(MessengerController::class)->group(function () {
        Route::get('users', 'users');
        Route::get('chats', 'chats');
        Route::post('chats', 'createChat');
        Route::patch('chats/{chat}', 'updateChat');
        Route::post('chats/{chat}/members', 'addMembers');
        Route::delete('chats/{chat}/members/{user}', 'removeMember');
        Route::post('chats/{chat}/pin', 'pin');
        Route::post('chats/{chat}/read', 'read');
        Route::get('chats/{chat}/avatar', 'avatar');
        Route::post('chats/{chat}/avatar', 'uploadAvatar');
        Route::delete('chats/{chat}/avatar', 'deleteAvatar');
        Route::get('chats/{chat}/messages', 'messages');
        Route::post('chats/{chat}/messages', 'send');
        Route::patch('messages/{message}', 'edit');
        Route::delete('messages/{message}', 'destroy');
        Route::post('messages/{message}/reactions', 'react');
        Route::get('files/{file}', 'file');
    });
});
