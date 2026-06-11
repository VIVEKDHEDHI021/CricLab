<?php

namespace App\Services;

use App\Models\Ball;
use App\Models\Innings;
use App\Models\CricketMatch;
use App\Http\Controllers\BallController;
use App\Exceptions\ScoringException;
use Illuminate\Support\Facades\DB;

class ScoringService
{
    /**
     * Sync an entire over for a match.
     *
     * @param string $matchId
     * @param array $data
     * @return void
     * @throws ScoringException
     */
    public function syncOver(string $matchId, array $data)
    {
        $inningsNo = $data['innings_no'];
        $overNo = $data['over_no'];
        $bowlerId = $data['bowler_id'];
        $deliveries = $data['deliveries'] ?? [];

        DB::beginTransaction();

        try {
            // Find active innings and lock it to prevent race conditions
            $innings = Innings::where('match_id', $matchId)
                ->where('innings_no', $inningsNo)
                ->lockForUpdate()
                ->first();

            if (!$innings) {
                throw new ScoringException("Active innings does not exist.");
            }

            if ($innings->is_closed) {
                throw new ScoringException("Innings is closed.");
            }

            // Find match and lock it
            $match = CricketMatch::where('id', $matchId)->lockForUpdate()->firstOrFail();

            if ($match->status !== 'live') {
                throw new ScoringException("Match is not live.");
            }

            // 1. Validation Engine
            // Validate sequence: previous overs must exist unless over_no is 0
            if ($overNo > 0) {
                $prevOverExists = Ball::where('innings_id', $innings->id)
                    ->where('over_number', $overNo - 1)
                    ->exists();
                if (!$prevOverExists) {
                    throw new ScoringException("Previous overs must be synced first.");
                }
            }

            // Validate exactly 6 legal deliveries exist in the payload
            $legalCount = collect($deliveries)->filter(fn($d) => !empty($d['is_legal']))->count();
            if ($legalCount !== 6) {
                throw new ScoringException("An over must contain exactly 6 legal deliveries.");
            }

            // Validate consecutive bowler rule
            if ($overNo > 0) {
                $prevOverBowlerId = Ball::where('innings_id', $innings->id)
                    ->where('over_number', $overNo - 1)
                    ->orderBy('ball_index', 'desc')
                    ->value('bowler_id');

                if ($prevOverBowlerId && $prevOverBowlerId === $bowlerId) {
                    throw new ScoringException("Previous bowler cannot bowl consecutive overs.");
                }
            }

            // Validate that deliveries contain valid batter, bowler, striker IDs
            foreach ($deliveries as $index => $del) {
                if (empty($del['id'])) {
                    throw new ScoringException("Delivery ID is missing.");
                }
                if (empty($del['batter_id'])) {
                    throw new ScoringException("Striker is not selected.");
                }
            }

            // 2. Conflict Resolution
            // Hard delete (or forceDelete) any existing deliveries for this over
            // to allow clean overwriting and idempotency
            Ball::where('innings_id', $innings->id)
                ->where('over_number', $overNo)
                ->forceDelete();

            // 3. Insert deliveries
            foreach ($deliveries as $index => $del) {
                Ball::create([
                    'id' => $del['id'],
                    'innings_id' => $innings->id,
                    'match_id' => $matchId,
                    'ball_index' => $del['ball_index'],
                    'over_number' => $overNo,
                    'ball_in_over' => $del['ball_in_over'],
                    'batter_id' => $del['batter_id'],
                    'non_striker_id' => $del['non_striker_id'] ?? null,
                    'bowler_id' => $bowlerId,
                    'runs' => $del['runs'] ?? 0,
                    'extra_runs' => $del['extra_runs'] ?? 0,
                    'extra_type' => $del['extra_type'] ?? null,
                    'is_wicket' => !empty($del['is_wicket']),
                    'wicket_type' => $del['wicket_type'] ?? null,
                    'is_legal' => !empty($del['is_legal']),
                    'caught_by_id' => $del['caught_by_id'] ?? null,
                ]);

                // Update catches if relevant
                if (!empty($del['is_wicket']) && ($del['wicket_type'] ?? '') === 'caught' && !empty($del['caught_by_id'])) {
                    $catcher = \App\Models\Player::find($del['caught_by_id']);
                    if ($catcher) {
                        $catcher->increment('catches');
                    }
                }
            }

            // 4. Recalculate innings statistics
            BallController::recalculateInnings($innings->id);

            DB::commit();
        } catch (\Exception $e) {
            DB::rollBack();
            throw $e;
        }
    }
}
