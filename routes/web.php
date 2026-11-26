<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\GifController;
use App\Http\Controllers\MessengerController;
use App\Http\Controllers\RealtimeController;
use App\Http\Controllers\TaskController;
use App\Http\Middleware\BroadcastTaskChanges;
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

    /* Общий канал обновлений (real-time), см. App\Support\Realtime. */
    Route::get('realtime', [RealtimeController::class, 'sync'])->middleware('auth');

    /* Мессенджер: только для вошедших. */
    Route::prefix('messenger')->middleware('auth')->controller(MessengerController::class)->group(function () {
        Route::get('users', 'users');
        Route::get('chats', 'chats');
        Route::get('sync', 'sync');
        Route::post('chats', 'createChat');
        Route::post('entity-chats', 'entityChat');
        Route::patch('chats/{chat}', 'updateChat');
        Route::post('chats/{chat}/members', 'addMembers');
        Route::delete('chats/{chat}/members/{user}', 'removeMember');
        Route::post('chats/{chat}/pin', 'pin');
        Route::post('chats/{chat}/read', 'read');
        Route::post('chats/{chat}/typing', 'typing');
        Route::get('chats/{chat}/avatar', 'avatar');
        Route::post('chats/{chat}/avatar', 'uploadAvatar');
        Route::delete('chats/{chat}/avatar', 'deleteAvatar');
        Route::get('chats/{chat}/messages', 'messages');
        Route::post('chats/{chat}/messages', 'send');
        Route::patch('messages/{message}', 'edit');
        Route::delete('messages/{message}', 'destroy');
        Route::post('messages/{message}/reactions', 'react');
        Route::post('messages/{message}/forward', 'forward');
        Route::get('messages/{message}/views', 'views');
        Route::get('files/{file}', 'file');
    });

    /* GIF и стикеры для чатов: поиск через сервис и избранное. */
    Route::middleware('auth')->controller(GifController::class)->group(function () {
        Route::get('gifs', 'search')->middleware('throttle:60,1');
        Route::get('gifs/favorites', 'favorites');
        Route::post('gifs/favorites', 'addFavorite');
        Route::delete('gifs/favorites', 'removeFavorite');
    });

    /* Задачи: только для вошедших. */
    Route::middleware(['auth', BroadcastTaskChanges::class])->controller(TaskController::class)->group(function () {
        Route::get('tasks', 'index');
        Route::post('tasks', 'store');
        Route::get('tasks/{task}', 'show');
        Route::patch('tasks/{task}', 'update');
        Route::delete('tasks/{task}', 'destroy');
        Route::post('tasks/{task}/status', 'status');
        Route::post('tasks/{task}/move', 'move');
        Route::post('tasks/{task}/checklist', 'addCheck');
        Route::post('tasks/{task}/checklist/order', 'orderChecks');
        Route::patch('task-checklist/{item}', 'updateCheck');
        Route::delete('task-checklist/{item}', 'deleteCheck');
        Route::post('tasks/{task}/files', 'addFiles');
        Route::get('task-files/{file}', 'getFile');
        Route::delete('task-files/{file}', 'deleteFile');
        Route::post('tasks/{task}/comments', 'addComment');
        Route::patch('task-comments/{comment}', 'updateComment');
        Route::delete('task-comments/{comment}', 'deleteComment');
        Route::post('tasks/{task}/timer', 'timer');
        Route::post('tasks/{task}/time', 'addTime');
        Route::delete('task-time/{entry}', 'deleteTime');
        Route::post('editor-images', 'uploadImage');
        Route::get('editor-images/{name}', 'image');
    });
});
