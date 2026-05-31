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
            $playerId = null;
            if ($f->friend) {
                $player = \App\Models\Player::where('user_id', $f->friend->id)->first();
                if (!$player && $f->friend->mobile) {
                    $player = \App\Models\Player::where('mobile', $f->friend->mobile)->first();
                }
                if ($player) {
                    $playerId = $player->id;
                }
            }

            return [
                'id' => $f->id,
                'profile' => $f->friend ? [
                    'id' => $playerId ?: $f->friend->id,
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

        $player = \App\Models\Player::where('user_id', $friendUser->id)->first();
        if (!$player && $friendUser->mobile) {
            $player = \App\Models\Player::where('mobile', $friendUser->mobile)->first();
        }
        $playerId = $player ? $player->id : null;

        return response()->json([
            'id' => $friendship->id,
            'profile' => [
                'id' => $playerId ?: $friendUser->id,
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
