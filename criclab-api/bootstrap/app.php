<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        channels: __DIR__.'/../routes/channels.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'admin'  => \App\Http\Middleware\EnsureAdmin::class,
            'scorer' => \App\Http\Middleware\EnsureScorer::class,
            'force_password_change' => \App\Http\Middleware\ForcePasswordChange::class,
        ]);
        // Never redirect API requests — always return JSON 401 for unauthenticated calls
        $middleware->redirectGuestsTo(fn (Request $request) => null);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // All api/* requests should always receive JSON, never HTML
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
        // Unauthenticated on API → 401 JSON, never an HTML redirect
        $exceptions->render(function (\Illuminate\Auth\AuthenticationException $e, Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return response()->json(['message' => 'Unauthenticated.'], 401);
            }
        });
    })->create();

