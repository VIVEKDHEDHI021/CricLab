<?php

namespace App\Services;

use App\Models\BallEvent;
use App\Models\CricketMatch;
use App\Models\Innings;
use App\Models\Ball;
use App\Models\MatchSummary;
use App\Models\MatchSnapshot;
use App\Models\AuditLog;
use App\Models\Player;
use App\Models\Team;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class MatchEngine
{
    /**
     * Replay all events for a given match and rebuild the derived match state.
     * Writes the projections into matches, innings, balls, and match_summaries.
     *
     * @param string $matchId
     * @return array The derived state summary
     */
    public static function replay(string $matchId): array
    {
        return DB::transaction(function () use ($matchId) {
            $match = CricketMatch::findOrFail($matchId);

            // 1. Fetch and Preprocess Events
            $rawEvents = BallEvent::where('match_id', $matchId)
                ->orderBy('sequence_number', 'asc')
                ->get();

            // Find undone event UUIDs
            $undoneUuids = $rawEvents->filter(fn($e) => $e->event_type === 'UNDO_EVENT')
                ->map(fn($e) => $e->metadata['target_event_uuid'] ?? null)
                ->filter()
                ->toArray();

            // Find corrections: map target_event_uuid => correction details
            $corrections = [];
            foreach ($rawEvents as $event) {
                if ($event->event_type === 'CORRECTION_EVENT') {
                    $targetUuid = $event->metadata['target_event_uuid'] ?? null;
                    if ($targetUuid) {
                        $corrections[$targetUuid] = $event->metadata;
                    }
                }
            }

            // Filter active events: omit UNDO_EVENTs, CORRECTION_EVENTs, and undone events
            $activeEvents = $rawEvents->filter(function ($e) use ($undoneUuids) {
                return !in_array($e->event_uuid, $undoneUuids) && 
                       $e->event_type !== 'UNDO_EVENT' && 
                       $e->event_type !== 'CORRECTION_EVENT';
            });

            // Apply corrections inline
            $events = $activeEvents->map(function ($e) use ($corrections) {
                if (isset($corrections[$e->event_uuid])) {
                    $corr = $corrections[$e->event_uuid];
                    // Overlay corrected properties
                    foreach (['runs_off_bat', 'extras', 'extra_type', 'wicket', 'wicket_type', 'dismissed_player_id', 'legal_delivery', 'striker_id', 'non_striker_id', 'bowler_id'] as $field) {
                        if (array_key_exists($field, $corr)) {
                            $e->{$field} = $corr[$field];
                        }
                    }
                }
                return $e;
            })->values();

            // 2. Initialize Replay State Machine
            $state = [
                'match_id' => $matchId,
                'status' => 'live',
                'current_innings' => 1,
                'result' => null,
                'batting_first_id' => $match->batting_first_id,
                'squad_a_ids' => $match->squad_a_ids ?? [],
                'squad_b_ids' => $match->squad_b_ids ?? [],
                'overs_limit' => $match->overs,
                'wide_run' => $match->wide_run,
                'noball_run' => $match->noball_run,
                'last_man_batting' => $match->last_man_batting,
                'innings' => [],
                'balls' => [],
                'batter_states' => [], // playerId => [runs, balls, 4s, 6s, out, dismissed_by, partners]
                'bowler_states' => [], // playerId => [runs, legal_balls, wickets, maidens]
                'partnerships' => [], // innings_no => [[player1, player2, runs, balls, active]]
                'active_striker' => null,
                'active_non_striker' => null,
                'active_bowler' => null,
                'retired_hurt_player_ids' => []
            ];

            // Setup teams batting order
            $teamAId = $match->team_a_id;
            $teamBId = $match->team_b_id;
            $battingTeamId = $match->batting_first_id ?? $teamAId;
            $bowlingTeamId = ($battingTeamId === $teamAId) ? $teamBId : $teamAId;

            // Initialize Innings 1
            $state['innings'][1] = [
                'innings_no' => 1,
                'batting_team_id' => $battingTeamId,
                'bowling_team_id' => $bowlingTeamId,
                'runs' => 0,
                'wickets' => 0,
                'legal_balls' => 0,
                'is_closed' => false,
                'wides' => 0,
                'noballs' => 0,
                'byes' => 0,
                'legbyes' => 0
            ];

            $currentInningsNo = 1;
            $targetRuns = null;

            // 3. Process Events Sequentially
            foreach ($events as $index => $event) {
                // If innings ending event is manual or match ended
                if ($event->event_type === 'INNINGS_ENDED') {
                    $state['innings'][$currentInningsNo]['is_closed'] = true;
                    if ($currentInningsNo === 1) {
                        $currentInningsNo = 2;
                        $targetRuns = $state['innings'][1]['runs'] + 1;
                        $state['innings'][2] = [
                            'innings_no' => 2,
                            'batting_team_id' => $state['innings'][1]['bowling_team_id'],
                            'bowling_team_id' => $state['innings'][1]['batting_team_id'],
                            'runs' => 0,
                            'wickets' => 0,
                            'legal_balls' => 0,
                            'is_closed' => false,
                            'wides' => 0,
                            'noballs' => 0,
                            'byes' => 0,
                            'legbyes' => 0
                        ];
                        $state['active_striker'] = null;
                        $state['active_non_striker'] = null;
                        $state['active_bowler'] = null;
                    }
                    continue;
                }

                if ($event->event_type === 'MATCH_ENDED') {
                    $state['status'] = 'past';
                    $state['result'] = $event->metadata['result'] ?? 'Match Finished';
                    break;
                }

                if ($event->event_type === 'PLAYER_SUBSTITUTED') {
                    $oldId = $event->metadata['old_player_id'] ?? null;
                    $newId = $event->metadata['new_player_id'] ?? null;
                    if ($oldId && $newId) {
                        if ($state['active_striker'] === $oldId) $state['active_striker'] = $newId;
                        if ($state['active_non_striker'] === $oldId) $state['active_non_striker'] = $newId;
                        if ($state['active_bowler'] === $oldId) $state['active_bowler'] = $newId;

                        // Substitute in squads
                        if (($key = array_search($oldId, $state['squad_a_ids'])) !== false) {
                            $state['squad_a_ids'][$key] = $newId;
                        }
                        if (($key = array_search($oldId, $state['squad_b_ids'])) !== false) {
                            $state['squad_b_ids'][$key] = $newId;
                        }
                    }
                    continue;
                }

                if ($event->event_type === 'BATTER_RETIRED') {
                    $pId = $event->metadata['player_id'] ?? null;
                    $type = $event->metadata['retired_type'] ?? 'retired_hurt';
                    if ($pId) {
                        if ($type === 'retired_out') {
                            // Counts as wicket
                            $state['innings'][$currentInningsNo]['wickets']++;
                            $state['batter_states'][$pId]['is_out'] = true;
                            $state['batter_states'][$pId]['wicket_type'] = 'retired_out';

                            // End partnership
                            self::endPartnership($state, $currentInningsNo, $pId);

                            if ($state['active_striker'] === $pId) $state['active_striker'] = null;
                            if ($state['active_non_striker'] === $pId) $state['active_non_striker'] = null;
                        } else {
                            // Retired hurt
                            $state['retired_hurt_player_ids'][] = $pId;
                            self::endPartnership($state, $currentInningsNo, $pId);
                            if ($state['active_striker'] === $pId) $state['active_striker'] = null;
                            if ($state['active_non_striker'] === $pId) $state['active_non_striker'] = null;
                        }
                    }
                    continue;
                }

                if ($event->event_type === 'BALL_EVENT') {
                    $inn = &$state['innings'][$currentInningsNo];

                    // Set striker/non-striker/bowler from event if not already tracked
                    if (!$state['active_striker'] && $event->striker_id) $state['active_striker'] = $event->striker_id;
                    if (!$state['active_non_striker'] && $event->non_striker_id) $state['active_non_striker'] = $event->non_striker_id;
                    if (!$state['active_bowler'] && $event->bowler_id) $state['active_bowler'] = $event->bowler_id;

                    $strikerId = $state['active_striker'];
                    $nonStrikerId = $state['active_non_striker'];
                    $bowlerId = $state['active_bowler'];

                    // Initialize statistics if not present
                    if ($strikerId && !isset($state['batter_states'][$strikerId])) {
                        $state['batter_states'][$strikerId] = ['runs' => 0, 'balls' => 0, 'fours' => 0, 'sixes' => 0, 'is_out' => false, 'wicket_type' => null];
                    }
                    if ($nonStrikerId && !isset($state['batter_states'][$nonStrikerId])) {
                        $state['batter_states'][$nonStrikerId] = ['runs' => 0, 'balls' => 0, 'fours' => 0, 'sixes' => 0, 'is_out' => false, 'wicket_type' => null];
                    }
                    if ($bowlerId && !isset($state['bowler_states'][$bowlerId])) {
                        $state['bowler_states'][$bowlerId] = ['runs_conceded' => 0, 'legal_balls' => 0, 'wickets' => 0, 'maidens' => 0, 'overs_conceded' => []];
                    }

                    $runsOffBat = $event->runs_off_bat;
                    $extras = $event->extras;
                    $isLegal = $event->legal_delivery;
                    $extraType = $event->extra_type;

                    // Update Innings Totals
                    $ballRuns = $runsOffBat + $extras;
                    $inn['runs'] += $ballRuns;

                    if ($isLegal) {
                        $inn['legal_balls']++;
                    }

                    // Track extras
                    if ($extraType === 'wide') {
                        $inn['wides'] += $extras;
                    } elseif ($extraType === 'no_ball') {
                        $inn['noballs'] += $extras;
                    } elseif ($extraType === 'bye') {
                        $inn['byes'] += $extras;
                    } elseif ($extraType === 'leg_bye') {
                        $inn['legbyes'] += $extras;
                    }

                    // Batter stats
                    if ($strikerId && $extraType !== 'wide') {
                        $state['batter_states'][$strikerId]['balls']++;
                        $state['batter_states'][$strikerId]['runs'] += $runsOffBat;
                        if ($runsOffBat === 4) $state['batter_states'][$strikerId]['fours']++;
                        if ($runsOffBat === 6) $state['batter_states'][$strikerId]['sixes']++;
                    }

                    // Bowler stats
                    if ($bowlerId) {
                        // Bowler concedes runs off bat + wides + no balls
                        $conceded = $runsOffBat;
                        if ($extraType === 'wide' || $extraType === 'no_ball') {
                            $conceded += $extras;
                        }
                        $state['bowler_states'][$bowlerId]['runs_conceded'] += $conceded;
                        if ($isLegal) {
                            $state['bowler_states'][$bowlerId]['legal_balls']++;
                        }

                        // Track over details for maiden calculation
                        $overNo = $event->over_no ?? floor(($inn['legal_balls'] - ($isLegal ? 1 : 0)) / 6);
                        if (!isset($state['bowler_states'][$bowlerId]['overs_conceded'][$overNo])) {
                            $state['bowler_states'][$bowlerId]['overs_conceded'][$overNo] = 0;
                        }
                        $state['bowler_states'][$bowlerId]['overs_conceded'][$overNo] += $conceded;
                    }

                    // Partnerships
                    if ($strikerId && $nonStrikerId) {
                        self::updatePartnership($state, $currentInningsNo, $strikerId, $nonStrikerId, $ballRuns, $isLegal);
                    }

                    // Handle Wicket
                    $isWicket = $event->wicket;
                    $wicketType = $event->wicket_type;
                    $dismissedId = $event->dismissed_player_id ?? ($isWicket ? $strikerId : null);

                    if ($isWicket) {
                        $inn['wickets']++;
                        if ($dismissedId) {
                            $state['batter_states'][$dismissedId]['is_out'] = true;
                            $state['batter_states'][$dismissedId]['wicket_type'] = $wicketType;
                            $state['batter_states'][$dismissedId]['dismissed_by'] = $bowlerId;
                        }

                        // Bowler credit
                        if ($bowlerId && $wicketType !== 'run_out' && $wicketType !== 'retired_hurt' && $wicketType !== 'retired_out') {
                            $state['bowler_states'][$bowlerId]['wickets']++;
                        }

                        // End partnership
                        if ($dismissedId) {
                            self::endPartnership($state, $currentInningsNo, $dismissedId);
                        }

                        // Update strikers: the dismissed batsman is nullified
                        if ($dismissedId === $state['active_striker']) {
                            $state['active_striker'] = null;
                        } elseif ($dismissedId === $state['active_non_striker']) {
                            $state['active_non_striker'] = null;
                        }
                    }

                    // Rotate Strike
                    $runsToSwap = $runsOffBat;
                    if ($extraType === 'bye' || $extraType === 'leg_bye') {
                        $runsToSwap = $extras;
                    }
                    $shouldSwap = ($runsToSwap % 2 === 1);
                    if ($shouldSwap && $state['active_striker'] && $state['active_non_striker']) {
                        $temp = $state['active_striker'];
                        $state['active_striker'] = $state['active_non_striker'];
                        $state['active_non_striker'] = $temp;
                    }

                    // Over End Strike Rotation
                    $isOverEnd = $isLegal && ($inn['legal_balls'] % 6 === 0);
                    if ($isOverEnd && $state['active_striker'] && $state['active_non_striker']) {
                        $temp = $state['active_striker'];
                        $state['active_striker'] = $state['active_non_striker'];
                        $state['active_non_striker'] = $temp;
                        // Bowler cleared at end of over
                        $state['active_bowler'] = null;
                    }

                    // Add to Balls array
                    $state['balls'][] = [
                        'id' => $event->event_uuid,
                        'innings_no' => $currentInningsNo,
                        'ball_index' => count($state['balls']),
                        'over_number' => floor(($inn['legal_balls'] - ($isLegal ? 1 : 0)) / 6),
                        'ball_in_over' => (($inn['legal_balls'] - ($isLegal ? 1 : 0)) % 6) + 1,
                        'batter_id' => $strikerId,
                        'non_striker_id' => $nonStrikerId,
                        'bowler_id' => $bowlerId,
                        'runs' => $runsOffBat,
                        'extra_runs' => $extras,
                        'extra_type' => $extraType,
                        'is_wicket' => $isWicket,
                        'wicket_type' => $wicketType,
                        'is_legal' => $isLegal,
                        'caught_by_id' => $event->metadata['caught_by_id'] ?? null
                    ];

                    // Automatic Innings Transition / Match completion triggers
                    $battingTeamId = $inn['batting_team_id'];
                    $battingSquad = ($battingTeamId === $match->team_a_id) ? $state['squad_a_ids'] : $state['squad_b_ids'];
                    $squadCount = count($battingSquad ?? []);
                    if ($squadCount === 0) $squadCount = 11;
                    $maxWickets = $state['last_man_batting'] ? $squadCount : ($squadCount - 1);
                    if ($maxWickets <= 0) $maxWickets = 10;

                    if ($currentInningsNo === 1) {
                        if ($inn['legal_balls'] >= $state['overs_limit'] * 6 || $inn['wickets'] >= $maxWickets) {
                            $inn['is_closed'] = true;
                            $currentInningsNo = 2;
                            $targetRuns = $inn['runs'] + 1;
                            $state['innings'][2] = [
                                'innings_no' => 2,
                                'batting_team_id' => $inn['bowling_team_id'],
                                'bowling_team_id' => $inn['batting_team_id'],
                                'runs' => 0,
                                'wickets' => 0,
                                'legal_balls' => 0,
                                'is_closed' => false,
                                'wides' => 0,
                                'noballs' => 0,
                                'byes' => 0,
                                'legbyes' => 0
                            ];
                            $state['active_striker'] = null;
                            $state['active_non_striker'] = null;
                            $state['active_bowler'] = null;
                        }
                    } else { // 2nd Innings
                        $target = $targetRuns ?? ($state['innings'][1]['runs'] + 1);
                        $inn2AllOut = ($inn['wickets'] >= $maxWickets);
                        $inn2OversDone = ($inn['legal_balls'] >= $state['overs_limit'] * 6);

                        if ($inn['runs'] >= $target) {
                            // Target achieved! Chasing team wins.
                            $inn['is_closed'] = true;
                            $state['status'] = 'past';
                            $wicketsLeft = $maxWickets - $inn['wickets'];
                            if ($wicketsLeft < 0) $wicketsLeft = 0;
                            $chasingTeam = Team::find($inn['batting_team_id']);
                            $state['result'] = ($chasingTeam->name ?? 'Second Team') . ' won by ' . $wicketsLeft . ' ' . ($wicketsLeft === 1 ? 'wicket' : 'wickets');
                            break;
                        } elseif ($inn2AllOut || $inn2OversDone) {
                            $inn['is_closed'] = true;
                            $state['status'] = 'past';
                            $defendingTeam = Team::find($state['innings'][1]['batting_team_id']);
                            if ($inn['runs'] === $target - 1) {
                                $state['result'] = 'Match tied';
                            } else {
                                $diff = ($target - 1) - $inn['runs'];
                                $state['result'] = ($defendingTeam->name ?? 'First Team') . ' won by ' . $diff . ' ' . ($diff === 1 ? 'run' : 'runs');
                            }
                            break;
                        }
                    }
                }
            }

            // Close all innings if match status is past
            if ($state['status'] === 'past') {
                foreach ($state['innings'] as &$innVal) {
                    $innVal['is_closed'] = true;
                }
            }

            // Calculate Maidens for bowlers
            foreach ($state['bowler_states'] as $bId => &$bowlerState) {
                $maidens = 0;
                foreach ($bowlerState['overs_conceded'] as $oNum => $totalConceded) {
                    // Count only completed overs
                    $ballsInThisOver = count(array_filter($state['balls'], fn($bl) => $bl['bowler_id'] === $bId && $bl['over_number'] === $oNum && $bl['is_legal']));
                    if ($ballsInThisOver >= 6 && $totalConceded === 0) {
                        $maidens++;
                    }
                }
                $bowlerState['maidens'] = $maidens;
            }

            // 4. CQRS Projection - Write derived state to databases
            // Delete old balls of this match to maintain exact sync
            Ball::where('match_id', $matchId)->forceDelete();

            // Insert replayed balls
            $inningsModelIds = [];
            foreach ($state['innings'] as $innNo => $innData) {
                $inningsRecord = Innings::updateOrCreate(
                    ['match_id' => $matchId, 'innings_no' => $innNo],
                    [
                        'batting_team_id' => $innData['batting_team_id'],
                        'bowling_team_id' => $innData['bowling_team_id'],
                        'runs' => $innData['runs'],
                        'wickets' => $innData['wickets'],
                        'legal_balls' => $innData['legal_balls'],
                        'is_closed' => $innData['is_closed']
                    ]
                );
                $inningsModelIds[$innNo] = $inningsRecord->id;
            }

            // Write balls
            $insertBalls = [];
            foreach ($state['balls'] as $b) {
                $insertBalls[] = [
                    'id' => $b['id'] ?? (string) Str::uuid(),
                    'innings_id' => $inningsModelIds[$b['innings_no']],
                    'match_id' => $matchId,
                    'ball_index' => $b['ball_index'],
                    'over_number' => $b['over_number'],
                    'ball_in_over' => $b['ball_in_over'],
                    'batter_id' => $b['batter_id'],
                    'non_striker_id' => $b['non_striker_id'],
                    'bowler_id' => $b['bowler_id'],
                    'runs' => $b['runs'],
                    'extra_runs' => $b['extra_runs'],
                    'extra_type' => $b['extra_type'],
                    'is_wicket' => $b['is_wicket'] ? 1 : 0,
                    'wicket_type' => $b['wicket_type'],
                    'is_legal' => $b['is_legal'] ? 1 : 0,
                    'caught_by_id' => $b['caught_by_id'],
                    'created_at' => now(),
                    'updated_at' => now()
                ];
            }
            if (!empty($insertBalls)) {
                Ball::insert($insertBalls);
            }

            if ($state['status'] === 'past' && empty($state['result'])) {
                $state['result'] = 'No result';
            }

            // Update match state
            $match->update([
                'status' => $state['status'],
                'result' => $state['result'],
                'current_innings' => $currentInningsNo,
                'squad_a_ids' => $state['squad_a_ids'],
                'squad_b_ids' => $state['squad_b_ids']
            ]);

            // Save Snapshot on Over Completion
            foreach ($state['innings'] as $innNo => $innData) {
                $completedOvers = floor($innData['legal_balls'] / 6);
                if ($completedOvers > 0) {
                    $snapUuid = (string) Str::uuid();
                    MatchSnapshot::updateOrCreate(
                        [
                            'match_id' => $matchId,
                            'innings_no' => $innNo,
                            'over_no' => $completedOvers
                        ],
                        [
                            'id' => $snapUuid,
                            'sequence_number' => count($events),
                            'state_snapshot' => [
                                'innings_no' => $innNo,
                                'runs' => $innData['runs'],
                                'wickets' => $innData['wickets'],
                                'legal_balls' => $innData['legal_balls'],
                                'striker' => $state['active_striker'],
                                'non_striker' => $state['active_non_striker'],
                                'bowler' => $state['active_bowler'],
                                'batter_states' => $state['batter_states'],
                                'bowler_states' => $state['bowler_states'],
                                'partnerships' => $state['partnerships']
                            ]
                        ]
                    );
                }
            }

            // Update Match Summary cache table
            MatchSummary::updateOrCreate(
                ['match_id' => $matchId],
                [
                    'runs_team_a' => $state['innings'][1]['runs'] ?? 0,
                    'runs_team_b' => $state['innings'][2]['runs'] ?? 0,
                    'wickets_team_a' => $state['innings'][1]['wickets'] ?? 0,
                    'wickets_team_b' => $state['innings'][2]['wickets'] ?? 0,
                    'balls_team_a' => $state['innings'][1]['legal_balls'] ?? 0,
                    'balls_team_b' => $state['innings'][2]['legal_balls'] ?? 0,
                    'current_innings' => $currentInningsNo,
                    'status' => $state['status'],
                    'result' => $state['result'],
                    'summary_data' => $state
                ]
            );

            // Audit Trail Logger
            AuditLog::create([
                'id' => (string) Str::uuid(),
                'match_id' => $matchId,
                'event_uuid' => $events->last()?->event_uuid ?? null,
                'action_type' => 'REPLAY',
                'description' => 'Replayed ' . count($events) . ' events to restore match state.',
                'old_state' => null,
                'new_state' => $state,
                'device_timestamp' => round(microtime(true) * 1000)
            ]);

            return $state;
        });
    }

    private static function updatePartnership(array &$state, int $innNo, string $b1, string $b2, int $runs, bool $isLegal)
    {
        if (!isset($state['partnerships'][$innNo])) {
            $state['partnerships'][$innNo] = [];
        }

        // Find active partnership for these two batsmen
        $found = false;
        foreach ($state['partnerships'][$innNo] as &$p) {
            if ($p['active'] && (($p['batsman1'] === $b1 && $p['batsman2'] === $b2) || ($p['batsman1'] === $b2 && $p['batsman2'] === $b1))) {
                $p['runs'] += $runs;
                if ($isLegal) $p['balls']++;
                $found = true;
                break;
            }
        }

        if (!$found) {
            // End other active partnerships
            foreach ($state['partnerships'][$innNo] as &$p) {
                $p['active'] = false;
            }
            $state['partnerships'][$innNo][] = [
                'batsman1' => $b1,
                'batsman2' => $b2,
                'runs' => $runs,
                'balls' => $isLegal ? 1 : 0,
                'active' => true
            ];
        }
    }

    private static function endPartnership(array &$state, int $innNo, string $dismissedId)
    {
        if (!isset($state['partnerships'][$innNo])) return;
        foreach ($state['partnerships'][$innNo] as &$p) {
            if ($p['active'] && ($p['batsman1'] === $dismissedId || $p['batsman2'] === $dismissedId)) {
                $p['active'] = false;
            }
        }
    }
}
