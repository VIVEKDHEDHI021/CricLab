<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureScorer
{
    /**
     * Handle an incoming request.
     * Allows access if the user is an admin OR a scorer.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user() && in_array($request->user()->role, ['admin', 'scorer'])) {
            return $next($request);
        }

        return response()->json(['message' => 'Unauthorized. Scorer or Admin access required.'], 403);
    }
}
