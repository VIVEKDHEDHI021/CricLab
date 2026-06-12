<?php

namespace App\Http\Controllers;

use App\Models\BallEvent;
use App\Models\CricketMatch;
use App\Models\Innings;
use App\Models\Ball;
use App\Models\Player;
use App\Models\Team;
use App\Services\MatchEngine;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\DB;

class BallController extends Controller
{
    /**
     * Store a new ball event.
     */
    public function store(Request $request, $inningsId)
    {
        $request->validate([
            'match_id' => 'required|uuid|exists:matches,id',
            'ball_index' => 'required|integer',
            'over_number' => 'required|integer',
            'ball_in_over' => 'required|integer',
            'batter_id' => 'required|uuid|exists:players,id',
            'non_striker_id' => 'nullable|uuid|exists:players,id',
            'bowler_id' => 'required|uuid|exists:players,id',
            'runs' => 'required|integer',
            'extra_runs' => 'required|integer',
            'extra_type' => 'nullable|string',
            'is_wicket' => 'required|boolean',
            'wicket_type' => 'nullable|string',
            'is_legal' => 'required|boolean',
            'caught_by_id' => 'nullable|uuid|exists:players,id',
        ]);

        $matchId = $request->match_id;
        $innings = Innings::findOrFail($inningsId);
        $match = CricketMatch::findOrFail($matchId);

        if ($match->status === 'past') {
            return response()->json(['message' => 'Scoring is locked for this match.'], 422);
        }

        if ($request->user()->role !== 'admin' && $match->created_by !== $request->user()->id) {
            return response()->json(['message' => 'You are not authorized to score this match.'], 403);
        }

        // Duplicate Tap Protection (Backend)
        $exists = BallEvent::where('match_id', $matchId)
            ->where('innings_no', $innings->innings_no)
            ->where('over_no', $request->over_number)
            ->where('ball_no', $request->ball_in_over)
            ->where('striker_id', $request->batter_id)
            ->where('runs_off_bat', $request->runs)
            ->where('extras', $request->extra_runs)
            ->where('created_at', '>=', now()->subSeconds(2))
            ->exists();

        if ($exists) {
            return response()->json(['message' => 'Duplicate tap rejected.'], 422);
        }

        $eventUuid = (string) Str::uuid();
        $nextSeq = BallEvent::where('match_id', $matchId)->max('sequence_number') + 1;

        $event = BallEvent::create([
            'event_uuid' => $eventUuid,
            'event_type' => 'BALL_EVENT',
            'sequence_number' => $nextSeq,
            'match_id' => $matchId,
            'innings_no' => $innings->innings_no,
            'over_no' => $request->over_number,
            'ball_no' => $request->ball_in_over,
            'striker_id' => $request->batter_id,
            'non_striker_id' => $request->non_striker_id,
            'bowler_id' => $request->bowler_id,
            'batting_team_id' => $innings->batting_team_id,
            'bowling_team_id' => $innings->bowling_team_id,
            'runs_off_bat' => $request->runs,
            'extras' => $request->extra_runs,
            'extra_type' => $request->extra_type,
            'wicket' => $request->is_wicket,
            'wicket_type' => $request->wicket_type,
            'dismissed_player_id' => $request->is_wicket ? ($request->wicket_type === 'run_out' ? $request->non_striker_id : $request->batter_id) : null,
            'legal_delivery' => $request->is_legal,
            'scorer_id' => $request->user()->id,
            'device_timestamp' => round(microtime(true) * 1000),
            'metadata' => [
                'caught_by_id' => $request->caught_by_id
            ]
        ]);

        // Replay and project
        MatchEngine::replay($matchId);

        // Fetch replayed ball projection to match original return structure
        $projectedBall = Ball::find($eventUuid);

        $match->refresh();
        \App\Events\MatchUpdated::dispatchSafe($match);

        return response()->json($projectedBall, 201);
    }

    /**
     * Correct a ball event (Correction).
     */
    public function update(Request $request, $id)
    {
        $oldBall = Ball::findOrFail($id);
        $innings = Innings::findOrFail($oldBall->innings_id);
        $match = CricketMatch::findOrFail($innings->match_id);
        $matchId = $match->id;

        if ($match->status === 'past') {
            return response()->json(['message' => 'Scoring is locked for this match.'], 422);
        }

        if ($request->user()->role !== 'admin' && $match->created_by !== $request->user()->id) {
            return response()->json(['message' => 'You are not authorized to score this match.'], 403);
        }

        $request->validate([
            'batter_id' => 'required|uuid|exists:players,id',
            'non_striker_id' => 'nullable|uuid|exists:players,id',
            'bowler_id' => 'required|uuid|exists:players,id',
            'runs' => 'required|integer',
            'extra_runs' => 'required|integer',
            'extra_type' => 'nullable|string',
            'is_wicket' => 'required|boolean',
            'wicket_type' => 'nullable|string',
            'is_legal' => 'required|boolean',
            'caught_by_id' => 'nullable|uuid|exists:players,id',
        ]);

        $eventUuid = (string) Str::uuid();
        $nextSeq = BallEvent::where('match_id', $matchId)->max('sequence_number') + 1;

        BallEvent::create([
            'event_uuid' => $eventUuid,
            'event_type' => 'CORRECTION_EVENT',
            'sequence_number' => $nextSeq,
            'match_id' => $matchId,
            'innings_no' => $innings->innings_no,
            'over_no' => $oldBall->over_number,
            'ball_no' => $oldBall->ball_in_over,
            'scorer_id' => $request->user()->id,
            'device_timestamp' => round(microtime(true) * 1000),
            'metadata' => [
                'target_event_uuid' => $id,
                'striker_id' => $request->batter_id,
                'non_striker_id' => $request->non_striker_id,
                'bowler_id' => $request->bowler_id,
                'runs_off_bat' => $request->runs,
                'extras' => $request->extra_runs,
                'extra_type' => $request->extra_type,
                'wicket' => $request->is_wicket,
                'wicket_type' => $request->wicket_type,
                'dismissed_player_id' => $request->is_wicket ? ($request->wicket_type === 'run_out' ? $request->non_striker_id : $request->batter_id) : null,
                'legal_delivery' => $request->is_legal,
                'caught_by_id' => $request->caught_by_id
            ]
        ]);

        MatchEngine::replay($matchId);

        $projectedBall = Ball::find($id);

        $match->refresh();
        \App\Events\MatchUpdated::dispatchSafe($match);

        return response()->json($projectedBall);
    }

    /**
     * Undo a ball event.
     */
    public function destroy(Request $request, $id)
    {
        $oldBall = Ball::findOrFail($id);
        $innings = Innings::findOrFail($oldBall->innings_id);
        $match = CricketMatch::findOrFail($innings->match_id);
        $matchId = $match->id;

        if ($match->status === 'past') {
            return response()->json(['message' => 'Scoring is locked for this match.'], 422);
        }

        if ($request->user()->role !== 'admin' && $match->created_by !== $request->user()->id) {
            return response()->json(['message' => 'You are not authorized to score this match.'], 403);
        }

        $nextSeq = BallEvent::where('match_id', $matchId)->max('sequence_number') + 1;

        BallEvent::create([
            'event_uuid' => (string) Str::uuid(),
            'event_type' => 'UNDO_EVENT',
            'sequence_number' => $nextSeq,
            'match_id' => $matchId,
            'innings_no' => $innings->innings_no,
            'scorer_id' => $request->user()->id,
            'device_timestamp' => round(microtime(true) * 1000),
            'metadata' => [
                'target_event_uuid' => $id
            ]
        ]);

        MatchEngine::replay($matchId);

        $match->refresh();
        \App\Events\MatchUpdated::dispatchSafe($match);

        return response()->json(['message' => 'Ball deleted successfully.']);
    }

    /**
     * Sync over deliveries.
     */
    public function syncOver(Request $request, $matchId)
    {
        $request->validate([
            'innings_no' => 'required|integer',
            'over_no' => 'required|integer',
            'bowler_id' => 'required|uuid|exists:players,id',
            'deliveries' => 'required|array',
            'deliveries.*.id' => 'required|uuid',
            'deliveries.*.ball_index' => 'required|integer',
            'deliveries.*.ball_in_over' => 'required|integer',
            'deliveries.*.batter_id' => 'required|uuid|exists:players,id',
            'deliveries.*.non_striker_id' => 'nullable|uuid|exists:players,id',
            'deliveries.*.runs' => 'required|integer',
            'deliveries.*.extra_runs' => 'required|integer',
            'deliveries.*.extra_type' => 'nullable|string',
            'deliveries.*.is_wicket' => 'required|boolean',
            'deliveries.*.wicket_type' => 'nullable|string',
            'deliveries.*.is_legal' => 'required|boolean',
            'deliveries.*.caught_by_id' => 'nullable|uuid|exists:players,id',
        ]);

        $match = CricketMatch::findOrFail($matchId);
        if ($match->status === 'past') {
            return response()->json(['message' => 'Scoring is locked for this match.'], 422);
        }
        if ($request->user()->role !== 'admin' && $match->created_by !== $request->user()->id) {
            return response()->json(['message' => 'You are not authorized to score this match.'], 403);
        }

        DB::transaction(function () use ($matchId, $request, $match) {
            $inningsNo = $request->innings_no;
            $overNo = $request->over_no;
            $bowlerId = $request->bowler_id;
            $deliveries = $request->deliveries;

            $innings = Innings::where('match_id', $matchId)
                ->where('innings_no', $inningsNo)
                ->first();

            if (!$innings) {
                // Auto create innings in replay/sync if missing
                $innings = Innings::create([
                    'match_id' => $matchId,
                    'innings_no' => $inningsNo,
                    'batting_team_id' => ($inningsNo === 1) ? $match->batting_first_id : (($match->batting_first_id === $match->team_a_id) ? $match->team_b_id : $match->team_a_id),
                    'bowling_team_id' => ($inningsNo === 1) ? (($match->batting_first_id === $match->team_a_id) ? $match->team_b_id : $match->team_a_id) : $match->batting_first_id
                ]);
            }

            foreach ($deliveries as $del) {
                // If this ball event already exists, skip it to remain idempotent
                if (BallEvent::where('event_uuid', $del['id'])->exists()) {
                    continue;
                }

                $nextSeq = BallEvent::where('match_id', $matchId)->max('sequence_number') + 1;

                BallEvent::create([
                    'event_uuid' => $del['id'],
                    'event_type' => 'BALL_EVENT',
                    'sequence_number' => $nextSeq,
                    'match_id' => $matchId,
                    'innings_no' => $inningsNo,
                    'over_no' => $overNo,
                    'ball_no' => $del['ball_in_over'],
                    'striker_id' => $del['batter_id'],
                    'non_striker_id' => $del['non_striker_id'] ?? null,
                    'bowler_id' => $bowlerId,
                    'batting_team_id' => $innings->batting_team_id,
                    'bowling_team_id' => $innings->bowling_team_id,
                    'runs_off_bat' => $del['runs'] ?? 0,
                    'extras' => $del['extra_runs'] ?? 0,
                    'extra_type' => $del['extra_type'] ?? null,
                    'wicket' => !empty($del['is_wicket']),
                    'wicket_type' => $del['wicket_type'] ?? null,
                    'dismissed_player_id' => !empty($del['is_wicket']) ? (($del['wicket_type'] ?? '') === 'run_out' ? $del['non_striker_id'] : $del['batter_id']) : null,
                    'legal_delivery' => !empty($del['is_legal']),
                    'scorer_id' => $request->user()->id,
                    'device_timestamp' => round(microtime(true) * 1000),
                    'metadata' => [
                        'caught_by_id' => $del['caught_by_id'] ?? null
                    ]
                ]);
            }

            MatchEngine::replay($matchId);
        });

        $updatedMatch = CricketMatch::findOrFail($matchId);
        \App\Events\MatchUpdated::dispatchSafe($updatedMatch);

        return response()->json(['message' => 'Over synced successfully.']);
    }

    /**
     * Get all ball events for a match.
     */
    public function getEvents($matchId)
    {
        $events = BallEvent::where('match_id', $matchId)
            ->orderBy('sequence_number', 'asc')
            ->get();
        return response()->json($events);
    }

    /**
     * Universal log events endpoint.
     */
    public function logEvent(Request $request, $matchId)
    {
        $match = CricketMatch::findOrFail($matchId);
        if ($match->status === 'past') {
            return response()->json(['message' => 'Scoring is locked for this match.'], 422);
        }
        if ($request->user()->role !== 'admin' && $match->created_by !== $request->user()->id) {
            return response()->json(['message' => 'You are not authorized to score this match.'], 403);
        }

        $request->validate([
            'event_type' => 'required|string',
            'innings_no' => 'required|integer',
            'over_no' => 'nullable|integer',
            'ball_no' => 'nullable|integer',
            'striker_id' => 'nullable|uuid',
            'non_striker_id' => 'nullable|uuid',
            'bowler_id' => 'nullable|uuid',
            'runs_off_bat' => 'nullable|integer',
            'extras' => 'nullable|integer',
            'extra_type' => 'nullable|string',
            'wicket' => 'nullable|boolean',
            'wicket_type' => 'nullable|string',
            'dismissed_player_id' => 'nullable|uuid',
            'legal_delivery' => 'nullable|boolean',
            'metadata' => 'nullable|array'
        ]);

        $eventUuid = (string) Str::uuid();
        $nextSeq = BallEvent::where('match_id', $matchId)->max('sequence_number') + 1;

        BallEvent::create([
            'event_uuid' => $eventUuid,
            'event_type' => $request->event_type,
            'sequence_number' => $nextSeq,
            'match_id' => $matchId,
            'innings_no' => $request->innings_no,
            'over_no' => $request->over_no,
            'ball_no' => $request->ball_no,
            'striker_id' => $request->striker_id,
            'non_striker_id' => $request->non_striker_id,
            'bowler_id' => $request->bowler_id,
            'runs_off_bat' => $request->runs_off_bat ?? 0,
            'extras' => $request->extras ?? 0,
            'extra_type' => $request->extra_type,
            'wicket' => $request->wicket ?? false,
            'wicket_type' => $request->wicket_type,
            'dismissed_player_id' => $request->dismissed_player_id,
            'legal_delivery' => $request->legal_delivery ?? true,
            'scorer_id' => $request->user()->id,
            'device_timestamp' => round(microtime(true) * 1000),
            'metadata' => $request->metadata
        ]);

        MatchEngine::replay($matchId);

        $match->refresh();
        \App\Events\MatchUpdated::dispatchSafe($match);

        return response()->json(MatchSummary::find($matchId));
    }

    /**
     * Batch sync event log from client.
     */
    public function syncEvents(Request $request, $matchId)
    {
        $request->validate([
            'events' => 'required|array',
            'events.*.event_uuid' => 'required|uuid',
            'events.*.event_type' => 'required|string',
            'events.*.sequence_number' => 'required|integer',
            'events.*.innings_no' => 'required|integer',
            'events.*.device_timestamp' => 'required|integer',
        ]);

        $match = CricketMatch::findOrFail($matchId);
        if ($match->status === 'past') {
            return response()->json(['message' => 'Scoring is locked for this match.'], 422);
        }
        if ($request->user()->role !== 'admin' && $match->created_by !== $request->user()->id) {
            return response()->json(['message' => 'You are not authorized to score this match.'], 403);
        }

        DB::transaction(function () use ($matchId, $request) {
            foreach ($request->events as $evt) {
                if (BallEvent::where('event_uuid', $evt['event_uuid'])->exists()) {
                    continue;
                }

                BallEvent::create([
                    'event_uuid' => $evt['event_uuid'],
                    'event_type' => $evt['event_type'],
                    'sequence_number' => $evt['sequence_number'],
                    'match_id' => $matchId,
                    'innings_no' => $evt['innings_no'],
                    'over_no' => $evt['over_no'] ?? null,
                    'ball_no' => $evt['ball_no'] ?? null,
                    'striker_id' => $evt['striker_id'] ?? null,
                    'non_striker_id' => $evt['non_striker_id'] ?? null,
                    'bowler_id' => $evt['bowler_id'] ?? null,
                    'batting_team_id' => $evt['batting_team_id'] ?? null,
                    'bowling_team_id' => $evt['bowling_team_id'] ?? null,
                    'runs_off_bat' => $evt['runs_off_bat'] ?? 0,
                    'extras' => $evt['extras'] ?? 0,
                    'extra_type' => $evt['extra_type'] ?? null,
                    'wicket' => $evt['wicket'] ?? false,
                    'wicket_type' => $evt['wicket_type'] ?? null,
                    'dismissed_player_id' => $evt['dismissed_player_id'] ?? null,
                    'legal_delivery' => $evt['legal_delivery'] ?? true,
                    'scorer_id' => $request->user()->id,
                    'device_timestamp' => $evt['device_timestamp'],
                    'metadata' => $evt['metadata'] ?? null,
                ]);
            }

            MatchEngine::replay($matchId);
        });

        $updatedMatch = CricketMatch::findOrFail($matchId);
        \App\Events\MatchUpdated::dispatchSafe($updatedMatch);

        return response()->json(['message' => 'Events synced successfully.']);
    }
}
