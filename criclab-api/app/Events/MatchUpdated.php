<?php

namespace App\Events;

use App\Models\CricketMatch;
use App\Models\Team;
use App\Models\Player;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class MatchUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public $matchId;

    /**
     * Create a new event instance.
     */
    public function __construct(CricketMatch $match)
    {
        $this->matchId = $match->id;
    }

    /**
     * Get the channels the event should broadcast on.
     *
     * @return array<int, \Illuminate\Broadcasting\Channel>
     */
    public function broadcastOn(): array
    {
        return [
            new Channel('matches.' . $this->matchId),
            new Channel('matches'),
        ];
    }

    /**
     * Get the data to broadcast.
     *
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        $match = CricketMatch::findOrFail($this->matchId);
        $teams = Team::whereIn('id', [$match->team_a_id, $match->team_b_id])->get();
        $innings = $match->innings()->orderBy('innings_no')->get();
        $players = Player::whereIn('team_id', [$match->team_a_id, $match->team_b_id])->get();
        $balls = $match->balls()->orderBy('ball_index')->get();

        return [
            'm' => $match,
            'teams' => $teams,
            'innings' => $innings,
            'players' => $players,
            'balls' => $balls,
        ];
    }

    /**
     * The event's broadcast name.
     */
    public function broadcastAs(): string
    {
        return 'MatchUpdated';
    }
}
