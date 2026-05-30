<?php

namespace App\Http\Controllers;

use App\Models\Friend;
use App\Models\User;
use Illuminate\Http\Request;

class FriendController extends Controller
{
    public function index(Request $request)
    {
        $userId = $request->user()->id;
        $friends = Friend::where('user_id', $userId)->with('friend')->get();

        return response()->json($friends->map(function ($f) {
            return [
                'id' => $f->id,
                'profile' => $f->friend ? [
                    'id' => $f->friend->id,
                    'name' => $f->friend->name,
                    'mobile' => $f->friend->mobile,
                ] : null,
            ];
        }));
    }

    public function store(Request $request)
    {
        $request->validate([
            'mobile' => 'required|string',
        ]);

        $currentUser = $request->user();
        $friendUser = \App\Models\Account::where('mobile', $request->mobile)->first();

        if (!$friendUser) {
            return response()->json(['message' => 'No user with that mobile.'], 404);
        }

        if ($friendUser->id === $currentUser->id) {
            return response()->json(['message' => "That's you."], 400);
        }

        $exists = Friend::where('user_id', $currentUser->id)
            ->where('friend_user_id', $friendUser->id)
            ->exists();

        if ($exists) {
            return response()->json(['message' => 'Already added as a friend.'], 400);
        }

        $friendship = Friend::create([
            'user_id' => $currentUser->id,
            'friend_user_id' => $friendUser->id,
        ]);

        return response()->json([
            'id' => $friendship->id,
            'profile' => [
                'id' => $friendUser->id,
                'name' => $friendUser->name,
                'mobile' => $friendUser->mobile,
            ]
        ], 201);
    }

    public function destroy($id)
    {
        $friend = Friend::findOrFail($id);
        $friend->delete();
        return response()->json(['message' => 'Friend removed successfully.']);
    }
}
