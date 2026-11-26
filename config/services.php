<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Resend, Postmark, AWS, and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    /* Мессенджер в реальном времени: хаб Mercure во FrankenPHP. Без секрета —
       только опрос. url — куда публиковать с сервера (если нет mercure_publish),
       public_url — адрес хаба для браузера. */
    'mercure' => [
        'secret' => env('MERCURE_JWT_SECRET'),
        'url' => env('MERCURE_URL'),
        'public_url' => env('MERCURE_PUBLIC_URL', '/.well-known/mercure'),
    ],

    /* Поиск GIF и стикеров в чатах. Запросы идут через сервер портала, ключ
       в браузер не попадает. provider: klipy | giphy; пусто — какой ключ есть
       (сначала KLIPY). Ключ KLIPY — partner.klipy.com, GIPHY — developers.giphy.com. */
    'gifs' => [
        'provider' => env('GIF_PROVIDER'),
        'klipy_key' => env('KLIPY_API_KEY'),
        'giphy_key' => env('GIPHY_API_KEY'),
        'locale' => env('GIF_LOCALE', 'ru'),
        'rating' => env('GIF_RATING', 'pg-13'),
    ],

];
