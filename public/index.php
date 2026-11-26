<?php

use Illuminate\Foundation\Application;
use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

/*
 * Worker-режим FrankenPHP (Laravel Octane): приложение загружается один раз
 * и обслуживает запросы в цикле. Воркером назначен этот же файл, поэтому
 * адреса /index.php/api/… не меняются. Без worker-режима — обычный путь ниже.
 */
if (($_SERVER['FRANKENPHP_WORKER'] ?? false) && function_exists('frankenphp_handle_request')) {
    $_SERVER['APP_BASE_PATH'] ??= dirname(__DIR__);
    require __DIR__.'/../vendor/laravel/octane/bin/frankenphp-worker.php';

    return;
}

// Determine if the application is in maintenance mode...
if (file_exists($maintenance = __DIR__.'/../storage/framework/maintenance.php')) {
    require $maintenance;
}

// Register the Composer autoloader...
require __DIR__.'/../vendor/autoload.php';

// Bootstrap Laravel and handle the request...
/** @var Application $app */
$app = require_once __DIR__.'/../bootstrap/app.php';

$app->handleRequest(Request::capture());
