<?php

use App\Http\Controllers\AccessController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CrmClientController;
use App\Http\Controllers\CrmController;
use App\Http\Controllers\CrmDocumentController;
use App\Http\Controllers\LeadController;
use App\Http\Controllers\DealController;
use App\Http\Controllers\GifController;
use App\Http\Controllers\MessengerController;
use App\Http\Controllers\ProfileController;
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

    /* Настройки: сотрудники, роли и права (владелец и администраторы). */
    Route::prefix('access')->middleware('auth')->controller(AccessController::class)->group(function () {
        Route::get('/', 'index');
        Route::post('roles', 'storeRole');
        Route::patch('roles/{role}', 'updateRole');
        Route::delete('roles/{role}', 'destroyRole');
        Route::post('users', 'storeUser');
        Route::patch('users/{user}', 'updateUser');
        Route::post('users/{user}/password', 'password');
    });

    /* Профили сотрудников и аватары. */
    Route::middleware('auth')->controller(ProfileController::class)->group(function () {
        Route::get('profiles/{user}', 'show');
        Route::patch('profiles/{user}', 'update');
        Route::post('profiles/{user}/avatar', 'uploadAvatar');
        Route::delete('profiles/{user}/avatar', 'deleteAvatar');
        Route::get('avatars/{user}/{version}/{size}', 'avatar')->where(['version' => '[a-z0-9]+', 'size' => '[0-9]+']);
        Route::post('profile/password', 'password');
    });

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
        Route::post('messages/{message}/pin', 'pinMessage');
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

    /* CRM: сделки, воронки, стадии и свои поля (как в Битрикс24). */
    Route::middleware('auth')->group(function () {
        Route::get('crm/schema', [CrmController::class, 'schema']);
        Route::post('crm/pipelines', [CrmController::class, 'storePipeline']);
        Route::post('crm/pipelines/order', [CrmController::class, 'orderPipelines']);
        Route::patch('crm/pipelines/{pipeline}', [CrmController::class, 'updatePipeline']);
        Route::delete('crm/pipelines/{pipeline}', [CrmController::class, 'destroyPipeline']);
        Route::post('crm/pipelines/{pipeline}/stages', [CrmController::class, 'storeStage']);
        Route::post('crm/pipelines/{pipeline}/stages/order', [CrmController::class, 'orderStages']);
        Route::patch('crm/stages/{stage}', [CrmController::class, 'updateStage']);
        Route::delete('crm/stages/{stage}', [CrmController::class, 'destroyStage']);
        Route::post('crm/fields', [CrmController::class, 'storeField']);
        Route::post('crm/fields/order', [CrmController::class, 'orderFields']);
        Route::patch('crm/fields/{field}', [CrmController::class, 'updateField']);
        Route::delete('crm/fields/{field}', [CrmController::class, 'destroyField']);

        Route::get('crm/documents/{document}/file', [CrmDocumentController::class, 'file'])->whereNumber('document');
        Route::get('crm/lead-schema', [LeadController::class, 'schema']);
        Route::get('crm/leads', [LeadController::class, 'index']);
        Route::get('crm/leads/{lead}', [LeadController::class, 'show']);
        Route::get('crm/companies', [CrmClientController::class, 'companies']);
        Route::get('crm/companies/{company}', [CrmClientController::class, 'showCompany']);
        Route::get('crm/contacts', [CrmClientController::class, 'contacts']);
        Route::get('crm/contacts/{contact}', [CrmClientController::class, 'showContact']);
        Route::get('crm/deals', [DealController::class, 'index']);
        Route::get('crm/summary', [DealController::class, 'summary']);
        Route::post('crm/deals', [DealController::class, 'store']);
        Route::get('crm/deals/{deal}', [DealController::class, 'show']);
        Route::patch('crm/deals/{deal}', [DealController::class, 'update']);
        Route::post('crm/deals/{deal}/move', [DealController::class, 'move']);
        Route::delete('crm/deals/{deal}', [DealController::class, 'destroy']);
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
        Route::patch('task-time/{entry}', 'updateTime');
        Route::delete('task-time/{entry}', 'deleteTime');
        Route::post('editor-images', 'uploadImage');
        Route::get('editor-images/{name}', 'image');
    });
});
