<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ForcePasswordChange
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && $user->must_change_password) {
            $allowedPaths = [
                'api/change-password',
                'api/logout',
                'api/me',
            ];

            // Normalize path by trimming slashes
            $currentPath = trim($request->path(), '/');

            if (!in_array($currentPath, $allowedPaths)) {
                return response()->json([
                    'message' => 'You must change your password before you can proceed.',
                    'code' => 'MUST_CHANGE_PASSWORD',
                ], 403);
            }
        }

        return $next($request);
    }
}
