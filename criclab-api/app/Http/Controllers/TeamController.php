<?php

namespace App\Http\Controllers;

use App\Models\Team;
use Illuminate\Http\Request;

class TeamController extends Controller
{
    public function index()
    {
        return response()->json(Team::orderBy('name')->get());
    }

    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
        ]);

        $team = Team::create([
            'name' => $request->name,
            'created_by' => $request->user()->id,
        ]);

        return response()->json($team, 201);
    }

    public function destroy($id)
    {
        $team = Team::findOrFail($id);

        // Dissociate players from the deleted team
        $team->players()->update(['team_id' => null]);

        $team->delete();
        return response()->json(['message' => 'Team deleted successfully.']);
    }
}
