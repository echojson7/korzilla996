<?php

use App\Http\Middleware\CheckSignIn;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        /* Входа отдельной страницей нет: гость уходит на портал, там форма. */
        $middleware->redirectGuestsTo(fn (Request $request) => $request->getBasePath().'/portal/index.html');
        /* Выход на других устройствах при смене пароля и выключении учётки. */
        $middleware->web(append: [CheckSignIn::class]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
        /*
         * Единые ответы «нет доступа» и «не найдено» для API: reason —
         * forbidden | not_found, по нему портал рисует экран NoAccess.
         * 404 не называет модель и id (Laravel пишет «No query results
         * for model [App\Models\Task] 5»), 403 — только текст из abort().
         */
        $exceptions->render(function (HttpExceptionInterface $e, Request $request) {
            $status = $e->getStatusCode();
            if (! in_array($status, [403, 404], true) || ! ($request->is('api/*') || $request->expectsJson())) {
                return null;
            }
            $message = $status === 404 ? 'Не найдено' : ($e->getMessage() !== '' && $e->getMessage() !== 'This action is unauthorized.' ? $e->getMessage() : 'Нет доступа');

            return response()->json(['message' => $message, 'reason' => $status === 404 ? 'not_found' : 'forbidden'], $status, $e->getHeaders());
        });
    })->create();
