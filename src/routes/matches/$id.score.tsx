import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import { AppShell } from "@/components/AppShell";
import { matchService } from "@/lib/services/matchService";
import { inningsService } from "@/lib/services/inningsService";
import { ballService } from "@/lib/services/ballService";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { echoClient, updateEchoAuth } from "@/lib/echo";
import { useAuth } from "@/hooks/useAuth";
import {
  ArrowLeft,
  RotateCcw,
  MoreHorizontal,
  Save,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  RefreshCw,
  Cloud,
  CloudOff,
  CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/matches/$id/score")({ component: LiveScoring });

interface BallEvent {
  id: string;
  matchId: string;
  inningsId: string;
  ballIndex: number;
  overNumber: number;
  ballInOver: number;
  batterId: string;
  nonStrikerId: string | null;
  bowlerId: string;
  runs: number;
  extraRuns: number;
  extraType: "wide" | "no_ball" | "bye" | "leg_bye" | null;
  isWicket: boolean;
  wicketType: string | null;
  isLegal: boolean;
  caughtById: string | null;
  timestamp: number;
  synced: boolean;
}

interface UndoState {
  inningsId: string;
  ballIndex: number;
  striker: string;
  nonStriker: string;
  bowler: string;
  isSoloPlay: boolean;
}

type Match = any;
type Inn = any;
type Player = any;
type Ball = any;

function oversText(b: number) {
  return `${Math.floor(b / 6)}.${b % 6}`;
}

function getAbbreviation(name: string) {
  if (!name || name === "—") return "—";
  if (name.length <= 4) return name.toUpperCase();
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 4);
}

function CanvasConfetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const colors = ["#f43f5e", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];
    
    // Shoot upward and outward from left/right bottom corners
    const particles = Array.from({ length: 150 }).map(() => {
      const isLeft = Math.random() > 0.5;
      return {
        x: isLeft ? 0 : width,
        y: height,
        size: Math.random() * 6 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        speedX: isLeft ? (Math.random() * 8 + 4) : -(Math.random() * 8 + 4),
        speedY: -(Math.random() * 15 + 12),
        gravity: 0.35,
        rotation: Math.random() * 360,
        rotationSpeed: Math.random() * 8 - 4
      };
    });

    const resize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", resize);

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      particles.forEach((p) => {
        p.speedY += p.gravity;
        p.x += p.speedX;
        p.y += p.speedY;
        p.rotation += p.rotationSpeed;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.5);
        ctx.restore();
      });
      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-[9999]" />;
}

function LiveScoring() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const { user, role } = useAuth();
  const [match, setMatch] = useState<Match | null>(null);
  const [innings, setInnings] = useState<Inn[]>([]);
  const [balls, setBalls] = useState<Ball[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [striker, setStriker] = useState<string>("");
  const [nonStriker, setNonStriker] = useState<string>("");
  const [bowler, setBowler] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Optimistic UI & Sync states
  const [localEvents, setLocalEvents] = useState<BallEvent[]>([]);
  const [undoStates, setUndoStates] = useState<UndoState[]>([]);
  const [undoneBallIds, setUndoneBallIds] = useState<string[]>([]);
  const [activeExtraKind, setActiveExtraKind] = useState<"wide" | "no_ball" | "bye" | "leg_bye" | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [actionLock, setActionLock] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  const [celebrationPlayer, setCelebrationPlayer] = useState<any>(null);

  useEffect(() => {
    if (innings && innings.length > 0) {
      const closedInnings = innings.filter((inn: any) => inn.is_closed);
      if (closedInnings.length > 0) {
        const lastClosed = closedInnings[closedInnings.length - 1];
        const storageKey = `celebrated_${lastClosed.id}`;
        if (!sessionStorage.getItem(storageKey)) {
          const innBalls = (balls ?? []).filter((b: any) => b.innings_id === lastClosed.id);
          if (innBalls.length > 0) {
            const innPlayers = players.filter((p: any) => p.team_id === lastClosed.batting_team_id || p.team_id === lastClosed.bowling_team_id);
            const innStats = innPlayers.map((p: any) => {
              const batBalls = innBalls.filter((b: any) => b.batter_id === p.id);
              const runsScored = batBalls.reduce((sum: number, b: any) => sum + b.runs, 0);
              const wickets = innBalls.filter((b: any) => b.bowler_id === p.id && b.is_wicket && b.wicket_type !== "run_out" && b.wicket_type !== "retired_hurt").length;
              const catches = innBalls.filter((b: any) => b.is_wicket && b.wicket_type === "caught" && b.caught_by_id === p.id).length;
              const sixes = batBalls.filter((b: any) => b.runs === 6).length;
              const fours = batBalls.filter((b: any) => b.runs === 4).length;
              const mvp = runsScored + (wickets * 20) + (catches * 10) + (sixes * 5) + (fours * 2);
              return { player: p, mvp, runsScored, wickets, catches };
            });

            const topPerformer = [...innStats].sort((a, b) => b.mvp - a.mvp)[0];
            if (topPerformer && topPerformer.mvp > 0) {
              setCelebrationPlayer(topPerformer);
              sessionStorage.setItem(storageKey, "true");
            }
          }
        }
      }
    }
  }, [innings, balls, players]);

  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const timer = setTimeout(() => {
      setCooldownRemaining((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [cooldownRemaining]);
  
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      const data = await matchService.getMatch(id);
      setMatch(data.m);
      setTeams(data.teams ?? []);
      setInnings(data.innings ?? []);
      setPlayers(data.players ?? []);
      setBalls(data.balls ?? []);
      toast.success("Scoreboard refreshed!");
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    } finally {
      setIsRefreshing(false);
    }
  };

  const [isSoloPlay, setIsSoloPlay] = useState(false);
  const [initializedInningsId, setInitializedInningsId] = useState<string | null>(null);
  const [isWicketDialogOpen, setIsWicketDialogOpen] = useState(false);
  const [wicketType, setWicketType] = useState<string>("bowled");
  const [caughtById, setCaughtById] = useState<string>("");
  const [dismissedPlayerId, setDismissedPlayerId] = useState<string>("");
  const [showAllOvers, setShowAllOvers] = useState(false);
  const [isMoreOptionsOpen, setIsMoreOptionsOpen] = useState(false);

  const canScore = role === "admin" || (user && match && match.created_by === user.id);
  const playerName = (pid: string) => players.find((p) => p.id === pid)?.name ?? "—";

  const [isLiveSync, setIsLiveSync] = useState(false);

  // 1. Tactile Haptic Feedback
  const triggerHaptic = () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate(40);
      } catch (e) {
        // ignore
      }
    }
  };

  // 2. Local Storage Persistence & Recovery
  useEffect(() => {
    const saved = localStorage.getItem(`criclab_unsynced_events_${id}`);
    if (saved) {
      try {
        setLocalEvents(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved unsynced events", e);
      }
    }

    const savedUndo = localStorage.getItem(`criclab_undo_states_${id}`);
    if (savedUndo) {
      try {
        setUndoStates(JSON.parse(savedUndo));
      } catch (e) {
        console.error("Failed to parse saved undo states", e);
      }
    }
  }, [id]);

  useEffect(() => {
    if (localEvents.length > 0) {
      localStorage.setItem(`criclab_unsynced_events_${id}`, JSON.stringify(localEvents));
    } else {
      localStorage.removeItem(`criclab_unsynced_events_${id}`);
    }
  }, [localEvents, id]);

  useEffect(() => {
    if (undoStates.length > 0) {
      localStorage.setItem(`criclab_undo_states_${id}`, JSON.stringify(undoStates));
    } else {
      localStorage.removeItem(`criclab_undo_states_${id}`);
    }
  }, [undoStates, id]);

  // 3. Clear synced events once they are present in the server's balls list
  useEffect(() => {
    if (balls.length > 0 && localEvents.length > 0) {
      setLocalEvents((prev) =>
        prev.filter((le) => {
          if (!le.synced) return true;
          const serverHasIt = balls.some((b) => b.ball_index === le.ballIndex && b.innings_id === le.inningsId);
          return !serverHasIt;
        })
      );
    }
  }, [balls]);

  // 4. Background Sync Engine
  useEffect(() => {
    let active = true;
    
    const syncNextEvent = async () => {
      const pending = localEvents.find((e) => !e.synced);
      if (!pending) {
        if (syncing) setSyncing(false);
        return;
      }
      
      setSyncing(true);
      setSyncError(null);
      
      try {
        await ballService.addBall(pending.inningsId, {
          match_id: pending.matchId,
          ball_index: pending.ballIndex,
          over_number: pending.overNumber,
          ball_in_over: pending.ballInOver,
          batter_id: pending.batterId,
          non_striker_id: pending.nonStrikerId,
          bowler_id: pending.bowlerId,
          runs: pending.runs,
          extra_runs: pending.extraRuns,
          extra_type: pending.extraType,
          is_wicket: pending.isWicket,
          wicket_type: pending.wicketType,
          is_legal: pending.isLegal,
          caught_by_id: pending.caughtById,
        });
        
        if (!active) return;
        
        // Mark as synced locally
        setLocalEvents((prev) =>
          prev.map((e) => (e.id === pending.id ? { ...e, synced: true } : e))
        );
        reload();
      } catch (err: any) {
        if (!active) return;
        console.error("Failed to sync event", pending, err);
        setSyncing(false);
        setSyncError(err.response?.data?.message || err.message || "Network Error");
        
        // Auto-retry after 3 seconds
        setTimeout(() => {
          if (active) syncNextEvent();
        }, 3000);
      }
    };

    syncNextEvent();

    return () => {
      active = false;
    };
  }, [localEvents]);

  const reload = async () => {
    try {
      const data = await matchService.getMatch(id);
      setMatch(data.m);
      setTeams(data.teams ?? []);
      setInnings(data.innings ?? []);
      setPlayers(data.players ?? []);
      setBalls(data.balls ?? []);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();

    if (!echoClient) return;

    updateEchoAuth();
    setIsLiveSync(true);

    const channel = echoClient.channel(`matches.${id}`);

    channel.listen(".MatchUpdated", (data: any) => {
      setMatch(data.m);
      setTeams(data.teams ?? []);
      setInnings(data.innings ?? []);
      setPlayers(data.players ?? []);
      setBalls(data.balls ?? []);
    });

    return () => {
      channel.stopListening(".MatchUpdated");
      echoClient?.leave(`matches.${id}`);
      setIsLiveSync(false);
    };
  }, [id]);

  // 5. Combine server balls with local events (optimistic view)
  const combinedBalls = useMemo(() => {
    const list = balls.filter((b) => !undoneBallIds.includes(b.id));
    
    localEvents.forEach((event) => {
      if (!list.some((b) => b.ball_index === event.ballIndex && b.innings_id === event.inningsId)) {
        list.push({
          id: event.id,
          match_id: event.matchId,
          innings_id: event.inningsId,
          ball_index: event.ballIndex,
          over_number: event.overNumber,
          ball_in_over: event.ballInOver,
          batter_id: event.batterId,
          non_striker_id: event.nonStrikerId,
          bowler_id: event.bowlerId,
          runs: event.runs,
          extra_runs: event.extraRuns,
          extra_type: event.extraType,
          is_wicket: event.isWicket,
          wicket_type: event.wicketType,
          is_legal: event.isLegal,
          caught_by_id: event.caughtById,
          created_at: new Date(event.timestamp).toISOString(),
        });
      }
    });
    
    return list.sort((a, b) => a.ball_index - b.ball_index);
  }, [balls, localEvents, undoneBallIds]);

  // 6. Calculate optimistic Innings state
  const optimisticInnings = useMemo(() => {
    return innings.map((inn) => {
      const innEvents = combinedBalls.filter((b) => b.innings_id === inn.id);
      const runs = innEvents.reduce((sum, b) => sum + (b.runs ?? 0) + (b.extra_runs ?? 0), 0);
      const wickets = innEvents.filter((b) => b.is_wicket).length;
      const legal_balls = innEvents.filter((b) => b.is_legal).length;
      return {
        ...inn,
        runs,
        wickets,
        legal_balls,
      };
    });
  }, [innings, combinedBalls]);

  const currentInn = useMemo(
    () =>
      optimisticInnings.find((i) => i.innings_no === match?.current_innings && !i.is_closed) ||
      optimisticInnings[optimisticInnings.length - 1],
    [optimisticInnings, match],
  );
  const battingTeam = currentInn?.batting_team_id;
  const bowlingTeam = currentInn?.bowling_team_id;
  const battingPlayers = players.filter((p) => p.team_id === battingTeam);
  const bowlingPlayers = players.filter((p) => p.team_id === bowlingTeam);
  const innBalls = useMemo(() => {
    return combinedBalls.filter((b) => b.innings_id === currentInn?.id);
  }, [combinedBalls, currentInn]);
  

  const outBatterIds = useMemo(() => {
    return new Set(
      innBalls
        .filter((b) => b.is_wicket)
        .map((b) => b.batter_id)
        .filter(Boolean),
    );
  }, [innBalls]);

  const activeBattingPlayers = useMemo(() => {
    return battingPlayers.filter((p) => !outBatterIds.has(p.id));
  }, [battingPlayers, outBatterIds]);

  const isLastManRemaining = useMemo(() => {
    return !!(match?.last_man_batting && activeBattingPlayers.length === 1);
  }, [match, activeBattingPlayers]);

  const firstInnings = useMemo(() => optimisticInnings.find((i) => i.innings_no === 1), [optimisticInnings]);
  const secondInnings = useMemo(() => optimisticInnings.find((i) => i.innings_no === 2), [optimisticInnings]);

  const isInningsOver = useMemo(() => {
    if (!currentInn || !match) return false;
    const maxWickets =
      battingPlayers.length > 0
        ? match.last_man_batting
          ? battingPlayers.length
          : battingPlayers.length - 1
        : 10;

    // Check if target is chased
    if (currentInn.innings_no === 2 && firstInnings && currentInn.runs > firstInnings.runs) {
      return true;
    }

    return (
      currentInn.legal_balls >= match.overs * 6 ||
      currentInn.wickets >= maxWickets ||
      currentInn.wickets >= 10
    );
  }, [currentInn, match, battingPlayers, firstInnings]);

  useEffect(() => {
    if (activeBattingPlayers.length === 1) {
      if (!isSoloPlay) {
        setIsSoloPlay(true);
      }
      const loneBatsmanId = activeBattingPlayers[0]?.id;
      if (loneBatsmanId) {
        if (striker !== loneBatsmanId) {
          setStriker(loneBatsmanId);
        }
        if (nonStriker !== "") {
          setNonStriker("");
        }
      }
    }
  }, [activeBattingPlayers.length, activeBattingPlayers[0]?.id, striker, nonStriker, isSoloPlay]);

  const isOverStarted = useMemo(() => {
    if (!currentInn) return false;
    const currentOverNo = Math.floor((currentInn.legal_balls ?? 0) / 6);
    const currentOverBalls = innBalls.filter((b) => b.over_number === currentOverNo);
    return currentOverBalls.length > 0;
  }, [currentInn, innBalls]);

  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    if (!isOverStarted) {
      setUnlocked(false);
    }
  }, [isOverStarted]);

  useEffect(() => {
    if (innBalls.length > 0) {
      const lastBall = innBalls[innBalls.length - 1];
      if (lastBall.is_wicket) {
        setUnlocked(true);
      }
    }
  }, [innBalls]);

  // Auto-initialize striker, non-striker, and bowler from last ball if not set
  useEffect(() => {
    if (innBalls.length > 0) {
      const lastBall = innBalls[innBalls.length - 1];

      const lastBallIsLegal = lastBall.is_legal;
      const totalLegalBalls = innBalls.filter((b) => b.is_legal).length;
      const isEndOfOver = lastBallIsLegal && totalLegalBalls % 6 === 0;

      let expectedStriker = lastBall.batter_id;
      let expectedNonStriker = lastBall.non_striker_id;

      if (!isLastManRemaining && !isSoloPlay) {
        const shouldSwap = isEndOfOver || (lastBall.runs % 2 === 1 && !lastBall.extra_type);
        if (shouldSwap) {
          expectedStriker = lastBall.non_striker_id;
          expectedNonStriker = lastBall.batter_id;
        }
      }

      // Only auto-initialize isSoloPlay when this innings loads for the first time
      if (currentInn && initializedInningsId !== currentInn.id) {
        if (lastBall.batter_id && !lastBall.non_striker_id && !isLastManRemaining) {
          setIsSoloPlay(true);
        }
        setInitializedInningsId(currentInn.id);
      }

      if (!striker && expectedStriker && !outBatterIds.has(expectedStriker)) {
        setStriker(expectedStriker);
      }
      if (
        !isSoloPlay &&
        !nonStriker &&
        expectedNonStriker &&
        !outBatterIds.has(expectedNonStriker)
      ) {
        setNonStriker(expectedNonStriker);
      }
      if (!bowler && lastBall.bowler_id && !isEndOfOver) {
        setBowler(lastBall.bowler_id);
      }
    } else if (currentInn && initializedInningsId !== currentInn.id) {
      // If there are no balls yet, reset/initialize state for the new innings
      setInitializedInningsId(currentInn.id);
    }
  }, [innBalls, outBatterIds, striker, nonStriker, bowler, isLastManRemaining, isSoloPlay, currentInn, initializedInningsId]);

  const isLastManActive = useMemo(() => {
    return !!(
      match?.last_man_batting &&
      currentInn &&
      currentInn.wickets >= (battingPlayers.length > 0 ? battingPlayers.length - 1 : 10)
    );
  }, [match, currentInn, battingPlayers]);

  const allPlayersSelected = useMemo(() => {
    return !!(striker && (isSoloPlay || isLastManActive || nonStriker) && bowler);
  }, [striker, nonStriker, bowler, isSoloPlay, isLastManActive]);

  const isLocked = isOverStarted && allPlayersSelected && !unlocked;

  const strikerStats = useMemo(() => {
    if (!striker) return { runs: 0, balls: 0, sr: "0.0" };
    const batterBalls = innBalls.filter((b) => b.batter_id === striker);
    const runs = batterBalls.reduce((sum, b) => sum + (b.runs ?? 0), 0);
    const balls = batterBalls.filter((b) => b.extra_type !== "wide").length;
    const sr = balls > 0 ? ((runs / balls) * 100).toFixed(1) : "0.0";
    return { runs, balls, sr };
  }, [innBalls, striker]);

  const nonStrikerStats = useMemo(() => {
    if (!nonStriker) return { runs: 0, balls: 0, sr: "0.0" };
    const batterBalls = innBalls.filter((b) => b.batter_id === nonStriker);
    const runs = batterBalls.reduce((sum, b) => sum + (b.runs ?? 0), 0);
    const balls = batterBalls.filter((b) => b.extra_type !== "wide").length;
    const sr = balls > 0 ? ((runs / balls) * 100).toFixed(1) : "0.0";
    return { runs, balls, sr };
  }, [innBalls, nonStriker]);

  const bowlerStats = useMemo(() => {
    if (!bowler) return { overs: "0.0", maidens: 0, runs: 0, wickets: 0 };
    const bowlerBalls = innBalls.filter((b) => b.bowler_id === bowler);

    const runs = bowlerBalls.reduce((sum, b) => {
      let r = b.runs ?? 0;
      if (b.extra_type === "wide" || b.extra_type === "no_ball") {
        r += b.extra_runs ?? 0;
      }
      return sum + r;
    }, 0);

    const legalCount = bowlerBalls.filter((b) => b.is_legal).length;
    const overs = `${Math.floor(legalCount / 6)}.${legalCount % 6}`;

    const wickets = bowlerBalls.filter((b) => b.is_wicket).length;

    const oversGrouped: Record<number, any[]> = {};
    innBalls.forEach((b) => {
      if (!oversGrouped[b.over_number]) oversGrouped[b.over_number] = [];
      oversGrouped[b.over_number].push(b);
    });

    let maidens = 0;
    Object.keys(oversGrouped).forEach((oKey) => {
      const oNum = parseInt(oKey);
      const ballsInOver = oversGrouped[oNum];
      const bowlerBallsInThisOver = ballsInOver.filter((b) => b.bowler_id === bowler);
      const legalBowlerBalls = bowlerBallsInThisOver.filter((b) => b.is_legal).length;
      if (legalBowlerBalls === 6) {
        const runsConcededInOver = bowlerBallsInThisOver.reduce((sum, b) => {
          let r = b.runs ?? 0;
          if (b.extra_type === "wide" || b.extra_type === "no_ball") {
            r += b.extra_runs ?? 0;
          }
          return sum + r;
        }, 0);
        if (runsConcededInOver === 0) {
          maidens++;
        }
      }
    });

    return { overs, maidens, runs, wickets };
  }, [innBalls, bowler]);

  const yetToBatPlayers = useMemo(() => {
    return battingPlayers.filter((p) => {
      if (outBatterIds.has(p.id)) return false;
      if (p.id === striker || p.id === nonStriker) return false;
      return true;
    });
  }, [battingPlayers, outBatterIds, striker, nonStriker]);

  const teamName = (tid: string) => teams.find((t) => t.id === tid)?.name ?? "—";

  const currentCRR = useMemo(() => {
    if (!currentInn || !currentInn.legal_balls) return "0.00";
    return ((currentInn.runs / currentInn.legal_balls) * 6).toFixed(2);
  }, [currentInn]);

  const secondInningsInfo = useMemo(() => {
    if (!currentInn || currentInn.innings_no !== 2 || !firstInnings || !match) return null;
    const target = firstInnings.runs + 1;
    const needed = target - currentInn.runs;
    const maxBalls = match.overs * 6;
    const ballsRemaining = maxBalls - currentInn.legal_balls;
    const reqRR = ballsRemaining > 0 ? ((needed / ballsRemaining) * 6).toFixed(2) : "0.00";

    let text = "";
    if (needed <= 0) {
      text = `${teamName(currentInn.batting_team_id)} won the match!`;
    } else if (ballsRemaining <= 0) {
      text = `${teamName(firstInnings.batting_team_id)} won by ${firstInnings.runs - currentInn.runs} runs!`;
    } else {
      text = `Need ${needed} runs off ${ballsRemaining} balls (RRR: ${reqRR})`;
    }
    return {
      target,
      needed,
      ballsRemaining,
      reqRR,
      text,
    };
  }, [currentInn, firstInnings, match, teamName]);

  const disabledBowlers = useMemo(() => {
    return new Set<string>();
  }, []);

  const swapStrike = () => {
    if (isSoloPlay || isLastManActive) {
      toast.error("Cannot swap strike in solo play / last man active mode");
      return;
    }
    if (!striker || !nonStriker) {
      toast.error("Both striker and non-striker must be selected to swap strike");
      return;
    }
    const temp = striker;
    setStriker(nonStriker);
    setNonStriker(temp);
    toast.success("Strike swapped!");
  };

  const startInnings = async (battingTeamId: string) => {
    if (!match) return;
    const bowlingTeamId = battingTeamId === match.team_a_id ? match.team_b_id : match.team_a_id;
    const innNo = (innings[innings.length - 1]?.innings_no ?? 0) + 1;
    try {
      await inningsService.startInnings(id, {
        batting_team_id: battingTeamId,
        bowling_team_id: bowlingTeamId,
        innings_no: innNo,
      });
      reload();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    }
  };

  const endMatch = async () => {
    if (!confirm("End match?")) return;
    try {
      const data = await matchService.endMatch(id);
      toast.success(data.result);
      nav({ to: "/matches/$id", params: { id } });
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    }
  };

  const endInnings = async () => {
    if (!currentInn) return;
    if (!confirm("Are you sure you want to end this innings manually?")) return;
    try {
      await inningsService.closeInnings(currentInn.id);
      toast.success("Innings manually closed");
      setIsMoreOptionsOpen(false);
      reload();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    }
  };

  const handleWicketClick = () => {
    if (!currentInn) return toast.error("Start an innings first");

    if (!striker || !bowler) return toast.error("Select striker and bowler");
    if (!isSoloPlay && !isLastManActive && (!nonStriker || nonStriker === striker)) {
      return toast.error("Select a distinct non-striker");
    }

    setWicketType("bowled");
    setDismissedPlayerId(striker);
    setCaughtById("");
    setIsWicketDialogOpen(true);
  };

  const executeWicketBall = async (wType: string, dismissedId: string, caughtByPlayerId?: string) => {
    if (actionLock || cooldownRemaining > 0) return;
    setActionLock(true);
    setTimeout(() => setActionLock(false), 350);
    setCooldownRemaining(3);

    setIsWicketDialogOpen(false);
    if (!currentInn) return toast.error("Start an innings first");

    if (!striker || !bowler) return toast.error("Select striker and bowler");
    if (!isSoloPlay && !isLastManActive && (!nonStriker || nonStriker === striker)) {
      return toast.error("Select a distinct non-striker");
    }

    const actualBatterId = dismissedId;
    const actualNonStrikerId = dismissedId === striker ? nonStriker : striker;

    const ballIndex = innBalls.length;
    const legalCount = currentInn.legal_balls;
    const overNo = Math.floor(legalCount / 6);
    const ballInOver = (legalCount % 6) + 1;

    const localId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Capture state snapshot before modifying state
    const stateSnapshot: UndoState = {
      inningsId: currentInn.id,
      ballIndex,
      striker,
      nonStriker,
      bowler,
      isSoloPlay,
    };
    setUndoStates((prev) => [...prev, stateSnapshot]);

    const newEvent: BallEvent = {
      id: localId,
      matchId: id,
      inningsId: currentInn.id,
      ballIndex,
      overNumber: overNo,
      ballInOver,
      batterId: actualBatterId,
      nonStrikerId: isSoloPlay || isLastManActive ? null : actualNonStrikerId,
      bowlerId: bowler,
      runs: 0,
      extraRuns: 0,
      extraType: null,
      isWicket: true,
      wicketType: wType,
      isLegal: true,
      caughtById: wType === "caught" ? caughtByPlayerId || null : null,
      timestamp: Date.now(),
      synced: false,
    };

    // Instant tactile/visual feedback
    triggerHaptic();

    if (dismissedId === striker) {
      setStriker("");
      toast.info("Wicket! Select new batsman");
    } else {
      setNonStriker("");
      toast.info("Wicket! Select new non-striker");
    }

    const newLegal = currentInn.legal_balls + 1;
    if (newLegal % 6 === 0) {
      if (!isSoloPlay && !isLastManActive) {
        const currentS = dismissedId === striker ? "" : striker;
        const currentNS = dismissedId === striker ? nonStriker : "";
        setStriker(currentNS);
        setNonStriker(currentS);
      }
      setBowler("");
      toast.success("End of over");
    }

    const newWickets = currentInn.wickets + 1;
    const maxWickets =
      battingPlayers.length > 0
        ? match.last_man_batting
          ? battingPlayers.length
          : battingPlayers.length - 1
        : 10;
    if (newLegal >= match.overs * 6 || newWickets >= maxWickets || newWickets >= 10) {
      toast.success("Innings closed");
    }

    // Save event locally
    setLocalEvents((prev) => [...prev, newEvent]);
  };

  const addBall = async (
    kind: "run" | "wide" | "no_ball" | "bye" | "leg_bye" | "wicket",
    runs = 0,
  ) => {
    if (actionLock || cooldownRemaining > 0) return;
    if (kind === "wicket") {
      handleWicketClick();
      return;
    }
    setActionLock(true);
    setTimeout(() => setActionLock(false), 350);
    setCooldownRemaining(3);

    if (!currentInn) return toast.error("Start an innings first");

    if (!striker || !bowler) return toast.error("Select striker and bowler");
    if (!isSoloPlay && !isLastManActive && (!nonStriker || nonStriker === striker)) {
      return toast.error("Select a distinct non-striker");
    }
    const wideRun = match.wide_run ?? 1;
    const noballRun = match.noball_run ?? 1;
    const isLegal = kind === "run" || kind === "bye" || kind === "leg_bye";
    let batterRuns = 0;
    let extraRuns = 0;
    let extraType: string | null = null;
    const isWicket = false;
    if (kind === "run") batterRuns = runs;
    else if (kind === "wide") {
      extraType = "wide";
      extraRuns = wideRun + runs;
    } else if (kind === "no_ball") {
      extraType = "no_ball";
      extraRuns = noballRun;
      batterRuns = runs;
    } else if (kind === "bye") {
      extraType = "bye";
      extraRuns = runs;
    } else if (kind === "leg_bye") {
      extraType = "leg_bye";
      extraRuns = runs;
    }

    const ballIndex = innBalls.length;
    const legalCount = currentInn.legal_balls;
    const overNo = Math.floor(legalCount / 6);
    const ballInOver = (legalCount % 6) + (isLegal ? 1 : 0);

    const localId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Capture state snapshot before modifying state
    const stateSnapshot: UndoState = {
      inningsId: currentInn.id,
      ballIndex,
      striker,
      nonStriker,
      bowler,
      isSoloPlay,
    };
    setUndoStates((prev) => [...prev, stateSnapshot]);

    const newEvent: BallEvent = {
      id: localId,
      matchId: id,
      inningsId: currentInn.id,
      ballIndex,
      overNumber: overNo,
      ballInOver: isLegal ? ballInOver : (legalCount % 6) + 1,
      batterId: striker,
      nonStrikerId: isSoloPlay || isLastManActive ? null : nonStriker,
      bowlerId: bowler,
      runs: batterRuns,
      extraRuns,
      extraType: extraType as any,
      isWicket,
      wicketType: null,
      isLegal,
      caughtById: null,
      timestamp: Date.now(),
      synced: false,
    };

    // Instant tactile/visual feedback
    triggerHaptic();

    // strike rotation on odd batter runs (not on wide; on no_ball with runs yes)
    if (
      !isSoloPlay &&
      !isLastManActive &&
      (kind === "run" || kind === "bye" || kind === "leg_bye" || kind === "no_ball") &&
      batterRuns % 2 === 1
    ) {
      setStriker(nonStriker);
      setNonStriker(striker);
    }
    // end of over swap
    const newLegal = currentInn.legal_balls + (isLegal ? 1 : 0);
    if (isLegal && newLegal % 6 === 0) {
      if (!isSoloPlay && !isLastManActive) {
        setStriker(nonStriker);
        setNonStriker(striker);
      }
      setBowler("");
      toast.success("End of over");
    }

    const newWickets = currentInn.wickets + (isWicket ? 1 : 0);
    const maxWickets =
      battingPlayers.length > 0
        ? match.last_man_batting
          ? battingPlayers.length
          : battingPlayers.length - 1
        : 10;
    if (newLegal >= match.overs * 6 || newWickets >= maxWickets || newWickets >= 10) {
      toast.success("Innings closed");
    }

    // Save event locally
    setLocalEvents((prev) => [...prev, newEvent]);
    setUnlocked(false);
  };

  const undo = async () => {
    if (!currentInn || innBalls.length === 0) return;
    if (actionLock) return;
    setActionLock(true);
    setTimeout(() => setActionLock(false), 400);

    const last = innBalls[innBalls.length - 1];

    // Check if the last ball was recorded more than 120 seconds ago and ask for confirmation
    const ballTime = last.created_at ? new Date(last.created_at).getTime() : Date.now();
    const ageInSeconds = (Date.now() - ballTime) / 1000;
    if (ageInSeconds > 120) {
      const minutes = Math.round(ageInSeconds / 60);
      const confirmMsg = `The last ball was recorded ${minutes} minute${minutes !== 1 ? "s" : ""} ago. Are you sure you want to undo it?`;
      if (!window.confirm(confirmMsg)) {
        return;
      }
    }

    // Backup current scoring state in case of failure
    const backupState = {
      striker,
      nonStriker,
      bowler,
      isSoloPlay,
    };

    // Find the state snapshot for the ball we are undoing
    const lastStateSnapshot = undoStates.find(
      (us) => us.inningsId === last.innings_id && us.ballIndex === last.ball_index
    );

    // Optimistic undo update
    setUndoneBallIds((prev) => [...prev, last.id]);
    setLocalEvents((prev) => prev.filter((le) => le.id !== last.id));
    setUndoStates((prev) =>
      prev.filter(
        (us) => !(us.inningsId === last.innings_id && us.ballIndex === last.ball_index)
      )
    );
    triggerHaptic();

    // Revert to snapshot state
    if (lastStateSnapshot) {
      setStriker(lastStateSnapshot.striker);
      setNonStriker(lastStateSnapshot.nonStriker);
      setBowler(lastStateSnapshot.bowler);
      setIsSoloPlay(lastStateSnapshot.isSoloPlay);
    } else {
      // Fallback: clear and let auto-initialize handle it
      setStriker("");
      setNonStriker("");
      setBowler("");
    }

    try {
      await ballService.undoBall(last.id);
      toast.success("Last ball undone");
      reload();
    } catch (err: any) {
      // Revert optimistic undo state on failure
      setUndoneBallIds((prev) => prev.filter((id) => id !== last.id));
      
      // Restore backup state
      setStriker(backupState.striker);
      setNonStriker(backupState.nonStriker);
      setBowler(backupState.bowler);
      setIsSoloPlay(backupState.isSoloPlay);

      // Restore snapshot entry
      if (lastStateSnapshot) {
        setUndoStates((prev) => [...prev, lastStateSnapshot]);
      }

      toast.error(err.response?.data?.message || err.message);
    }
  };

  // Group balls by over_number for previous overs card
  const oversData = useMemo(() => {
    if (!currentInn || innBalls.length === 0) return [];

    const groups: Record<number, Ball[]> = {};
    innBalls.forEach((b) => {
      const o = b.over_number;
      if (!groups[o]) groups[o] = [];
      groups[o].push(b);
    });

    const list = Object.keys(groups).map((oKey) => {
      const overNo = parseInt(oKey);
      const overBalls = groups[overNo];

      const firstBall = overBalls[0];
      const bowlerName = firstBall ? playerName(firstBall.bowler_id) : "Unknown";

      const batterIds = Array.from(
        new Set(overBalls.map((b) => b.batter_id).filter(Boolean)),
      );
      const batterNames = batterIds.map((id) => playerName(id)).join(" & ");

      const overRuns = overBalls.reduce((sum, b) => {
        return sum + (b.runs ?? 0) + (b.extra_runs ?? 0);
      }, 0);

      const lastBallOfOver = overBalls[overBalls.length - 1];
      const lastBallIndex = innBalls.findIndex((b) => b.id === lastBallOfOver.id);

      let cumulativeRuns = 0;
      let cumulativeWickets = 0;
      for (let i = 0; i <= lastBallIndex; i++) {
        const b = innBalls[i];
        cumulativeRuns += (b.runs ?? 0) + (b.extra_runs ?? 0);
        if (b.is_wicket) {
          cumulativeWickets++;
        }
      }

      return {
        overNo,
        displayOver: overNo + 1,
        bowlerName,
        batterNames,
        overRuns,
        scoreAtEnd: `${cumulativeRuns}/${cumulativeWickets}`,
        balls: overBalls,
      };
    });

    return list.sort((a, b) => b.overNo - a.overNo);
  }, [currentInn, innBalls, players]);

  // Scoreboard Batters Data
  const scoreboardBatters = useMemo(() => {
    const playedIds: string[] = [];
    innBalls.forEach((b) => {
      if (b.batter_id && !playedIds.includes(b.batter_id)) {
        playedIds.push(b.batter_id);
      }
    });

    if (striker && !playedIds.includes(striker)) {
      playedIds.push(striker);
    }
    if (nonStriker && !playedIds.includes(nonStriker)) {
      playedIds.push(nonStriker);
    }

    return playedIds.map((bid) => {
      const name = playerName(bid);
      const batterBalls = innBalls.filter((b) => b.batter_id === bid);

      const runs = batterBalls.reduce((sum, b) => {
        if (b.extra_type === "wide") return sum;
        return sum + (b.runs ?? 0);
      }, 0);

      const bCount = batterBalls.filter((b) => b.extra_type !== "wide").length;
      const fours = batterBalls.filter(
        (b) => b.runs === 4 && b.extra_type !== "wide",
      ).length;
      const sixes = batterBalls.filter(
        (b) => b.runs === 6 && b.extra_type !== "wide",
      ).length;

      const sr = bCount > 0 ? ((runs / bCount) * 100).toFixed(1) : "0.0";

      return {
        id: bid,
        name,
        runs,
        balls: bCount,
        fours,
        sixes,
        sr,
        isStriker: bid === striker,
        isNonStriker: bid === nonStriker,
      };
    });
  }, [innBalls, striker, nonStriker, players]);

  // Scoreboard Bowlers Data
  const scoreboardBowlers = useMemo(() => {
    const bowledIds: string[] = [];
    innBalls.forEach((b) => {
      if (b.bowler_id && !bowledIds.includes(b.bowler_id)) {
        bowledIds.push(b.bowler_id);
      }
    });

    if (bowler && !bowledIds.includes(bowler)) {
      bowledIds.push(bowler);
    }

    return bowledIds.map((bid) => {
      const name = playerName(bid);
      const bowlerBalls = innBalls.filter((b) => b.bowler_id === bid);

      const legalCount = bowlerBalls.filter((b) => b.is_legal).length;
      const overs = `${Math.floor(legalCount / 6)}.${legalCount % 6}`;

      const runs = bowlerBalls.reduce((sum, b) => {
        if (b.extra_type === "bye" || b.extra_type === "leg_bye") {
          return sum;
        }
        return sum + (b.runs ?? 0) + (b.extra_runs ?? 0);
      }, 0);

      const wickets = bowlerBalls.filter(
        (b) => b.is_wicket && b.wicket_type !== "run_out",
      ).length;

      const oversGrouped: Record<number, Ball[]> = {};
      bowlerBalls.forEach((b) => {
        if (!oversGrouped[b.over_number]) oversGrouped[b.over_number] = [];
        oversGrouped[b.over_number].push(b);
      });

      let maidens = 0;
      Object.keys(oversGrouped).forEach((oKey) => {
        const oNum = parseInt(oKey);
        const ballsInOver = oversGrouped[oNum];
        const legalBowlerBalls = ballsInOver.filter((b) => b.is_legal).length;
        if (legalBowlerBalls === 6) {
          const runsConcededInOver = ballsInOver.reduce((sum, b) => {
            if (b.extra_type === "bye" || b.extra_type === "leg_bye") return sum;
            return sum + (b.runs ?? 0) + (b.extra_runs ?? 0);
          }, 0);
          if (runsConcededInOver === 0) {
            maidens++;
          }
        }
      });

      const econ = legalCount > 0 ? ((runs / legalCount) * 6).toFixed(2) : "0.00";

      return {
        id: bid,
        name,
        overs,
        maidens,
        runs,
        wickets,
        econ,
      };
    });
  }, [innBalls, bowler, players]);

  // Extras total and breakdown
  const extrasTotal = useMemo(() => {
    if (!currentInn) return 0;
    return innBalls.reduce((sum, b) => sum + (b.extra_runs ?? 0), 0);
  }, [innBalls, currentInn]);

  const extrasBreakdown = useMemo(() => {
    let b = 0;
    let lb = 0;
    let w = 0;
    let nb = 0;

    innBalls.forEach((ball) => {
      if (ball.extra_type === "bye") b += ball.extra_runs ?? 0;
      else if (ball.extra_type === "leg_bye") lb += ball.extra_runs ?? 0;
      else if (ball.extra_type === "wide") w += ball.extra_runs ?? 0;
      else if (ball.extra_type === "no_ball") nb += ball.extra_runs ?? 0;
    });

    return `b ${b}, lb ${lb}, w ${w}, nb ${nb}`;
  }, [innBalls]);

  if (loading || !match)
    return (
      <AppShell>
        <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground font-medium animate-pulse">
          Loading scoring details…
        </div>
      </AppShell>
    );

  const team1Id = firstInnings?.batting_team_id || match.team_a_id;
  const team2Id = firstInnings?.bowling_team_id || match.team_b_id;

  const team1Name = teamName(team1Id);
  const team2Name = teamName(team2Id);

  const team1Abbr = getAbbreviation(team1Name);
  const team2Abbr = getAbbreviation(team2Name);

  const leftScore = firstInnings
    ? `${firstInnings.runs}/${firstInnings.wickets}`
    : "0/0";
  const leftOvers = firstInnings ? oversText(firstInnings.legal_balls) : "0.0";


  const rightScore = secondInnings
    ? `${secondInnings.runs}/${secondInnings.wickets}`
    : "0/0";
  const rightOvers = secondInnings ? oversText(secondInnings.legal_balls) : "0.0";

  const activeInningsNo = currentInn?.innings_no || 1;
  const visibleOvers = showAllOvers ? oversData : oversData.slice(0, 4);

  // Custom Header matching CricketHub branding and user layout
  const CustomHeader = (
    <div className="bg-[#0B1B3D] text-white py-3 px-4 flex items-center justify-between sticky top-0 z-20 shadow-md">
      <div className="flex items-center gap-3">
        <button
          onClick={() => nav({ to: "/matches/$id", params: { id } })}
          className="hover:bg-white/10 p-1.5 rounded-full transition-colors cursor-pointer"
          title="Back to Match"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="font-bold text-base md:text-lg tracking-wide">
          CricketHub Scoring
        </span>
        {/* Sync Status Badge */}
        {localEvents.some((e) => !e.synced) ? (
          syncError ? (
            <div className="flex items-center gap-1 bg-red-950/40 border border-red-500/30 px-2 py-0.5 rounded-full" title={syncError}>
              <CloudOff className="h-3 w-3 text-red-400 animate-pulse" />
              <span className="text-[9px] text-red-400 font-bold uppercase tracking-wider">Offline</span>
            </div>
          ) : syncing ? (
            <div className="flex items-center gap-1 bg-sky-950/40 border border-sky-500/30 px-2 py-0.5 rounded-full">
              <Cloud className="h-3 w-3 text-sky-400 animate-bounce" />
              <span className="text-[9px] text-sky-400 font-bold uppercase tracking-wider">Syncing</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-amber-950/40 border border-amber-500/30 px-2 py-0.5 rounded-full">
              <Cloud className="h-3 w-3 text-amber-400 animate-pulse" />
              <span className="text-[9px] text-amber-400 font-bold uppercase tracking-wider">Queued</span>
            </div>
          )
        ) : (
          localEvents.length > 0 && (
            <div className="flex items-center gap-1 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded-full">
              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider">Synced</span>
            </div>
          )
        )}
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2">
        {canScore && currentInn && (
          <button
            onClick={undo}
            disabled={innBalls.length === 0}
            className="flex items-center gap-1 text-xs font-semibold opacity-90 hover:opacity-100 disabled:opacity-40 hover:bg-white/10 py-1 px-1.5 sm:px-2 rounded-lg transition-all cursor-pointer"
            title="Undo"
          >
            <RotateCcw className="h-4 w-4" />
            <span className="hidden sm:inline">Undo</span>
          </button>
        )}
        <button
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1 text-xs font-semibold opacity-90 hover:opacity-100 disabled:opacity-40 hover:bg-white/10 py-1 px-1.5 sm:px-2 rounded-lg transition-all cursor-pointer"
          title="Refresh Scoreboard"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
        <button
          className="flex items-center gap-1 text-xs font-semibold opacity-90 hover:opacity-100 hover:bg-white/10 py-1 px-1.5 sm:px-2 rounded-lg transition-all cursor-pointer"
          onClick={() => setIsMoreOptionsOpen(true)}
          title="Options"
        >
          <MoreHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">Options</span>
        </button>
        <button
          onClick={() => {
            toast.success("Match status saved!");
            nav({ to: "/matches/$id", params: { id } });
          }}
          className="flex items-center gap-1 text-xs font-semibold opacity-90 hover:opacity-100 hover:bg-white/10 py-1 px-1.5 sm:px-2 rounded-lg transition-all cursor-pointer"
          title="Save & Exit"
        >
          <Save className="h-4 w-4" />
          <span className="hidden sm:inline">Save</span>
        </button>
      </div>
    </div>
  );

  // Innings / Match Completed wrapper (retaining dark/original colors)
  if (!currentInn || currentInn.is_closed) {
    const nextInnNo = (innings[innings.length - 1]?.innings_no ?? 0) + 1;
    if (nextInnNo > 2) {
      return (
        <AppShell>
          <div className="bg-background min-h-screen text-foreground font-sans pb-12">
            {CustomHeader}
            <div className="max-w-xl mx-auto px-4 pt-6">
              <Card className="p-6 rounded-2xl text-center space-y-4 shadow-lg border border-border">
                <h3 className="font-extrabold text-xl">Match Complete</h3>
                <p className="text-sm text-muted-foreground">Both innings have completed.</p>
                {canScore ? (
                  <Button
                    onClick={endMatch}
                    className="w-full bg-primary text-primary-foreground font-bold hover:bg-primary/95 rounded-xl py-2.5"
                  >
                    Finish Match
                  </Button>
                ) : (
                  <p className="text-xs text-primary font-semibold animate-pulse">
                    Waiting for scorer to finalize the match...
                  </p>
                )}
              </Card>
            </div>
          </div>
        </AppShell>
      );
    }

    if (innings.length === 1) {
      const opponentTeamId =
        innings[0].batting_team_id === match.team_a_id
          ? match.team_b_id
          : match.team_a_id;
      return (
        <AppShell>
          <div className="bg-background min-h-screen text-foreground font-sans pb-12">
            {CustomHeader}
            <div className="max-w-xl mx-auto px-4 pt-6">
              <Card className="p-6 rounded-2xl text-center space-y-4 shadow-lg border border-border">
                <h3 className="font-extrabold text-xl">
                  Innings 1 Complete
                </h3>
                <p className="text-sm text-muted-foreground">
                  {teamName(innings[0].batting_team_id)} finished their innings with{" "}
                  <span className="font-bold text-foreground">
                    {innings[0].runs}/{innings[0].wickets}
                  </span>{" "}
                  in {oversText(innings[0].legal_balls)} overs.
                </p>
                {canScore ? (
                  <Button
                    className="w-full bg-primary text-primary-foreground font-bold hover:bg-primary/95 rounded-xl py-2.5"
                    onClick={() => startInnings(opponentTeamId)}
                  >
                    Start {teamName(opponentTeamId)} Innings
                  </Button>
                ) : (
                  <p className="text-xs text-primary font-semibold animate-pulse">
                    Waiting for scorer to start {teamName(opponentTeamId)} innings...
                  </p>
                )}
              </Card>
            </div>
          </div>
        </AppShell>
      );
    }

    return (
      <AppShell>
        <div className="bg-background min-h-screen text-foreground font-sans pb-12">
          {CustomHeader}
          <div className="max-w-xl mx-auto px-4 pt-6">
            <Card className="p-6 rounded-2xl text-center space-y-4 shadow-lg border border-border">
              <h3 className="font-extrabold text-xl">Waiting to Start</h3>
              <p className="text-sm text-muted-foreground">
                Innings {nextInnNo} is ready to begin.
              </p>
              {canScore ? (
                <div className="space-y-3">
                  <Button
                    className="w-full bg-primary text-primary-foreground font-bold hover:bg-primary/95 rounded-xl py-2.5"
                    onClick={() => startInnings(match.team_a_id)}
                  >
                    {teamName(match.team_a_id)} Bats
                  </Button>
                  <Button
                    className="w-full variant-secondary text-foreground font-bold rounded-xl py-2.5 border border-border bg-secondary hover:bg-secondary/90"
                    onClick={() => startInnings(match.team_b_id)}
                  >
                    {teamName(match.team_b_id)} Bats
                  </Button>
                  {innings.length >= 2 && (
                    <Button
                      variant="outline"
                      className="w-full border-border text-foreground py-2.5 font-bold"
                      onClick={endMatch}
                    >
                      End Match
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-primary font-semibold animate-pulse">
                  Waiting for scorer to select batting team...
                </p>
              )}
            </Card>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="bg-background min-h-screen text-foreground font-sans pb-12">
        {CustomHeader}

        <div className="max-w-xl mx-auto px-4 pt-4 space-y-4">
          {/* Banner Score Card */}
          <Card className="p-4 rounded-2xl relative overflow-hidden border border-border/40 shadow-md">
            <div className="flex items-center justify-between relative pb-1">
              {/* Left Team (GT / 1st Innings) */}
              <div className="flex-1 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full flex items-center justify-center font-extrabold text-white bg-blue-600 text-xs shadow-md">
                  {team1Abbr}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-extrabold text-blue-400 text-sm tracking-wide truncate">
                    {team1Name}
                  </h4>
                  <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">
                    1st Innings
                  </p>
                  <p className="font-black text-foreground text-base mt-0.5">
                    {leftScore}{" "}
                    <span className="text-xs font-medium text-muted-foreground/85">
                      ({leftOvers})
                    </span>
                  </p>
                </div>
              </div>

              {/* VS Badge */}
              <div className="bg-muted border border-border/50 text-muted-foreground text-[10px] font-black h-7 w-7 rounded-full flex items-center justify-center shadow-sm mx-1 flex-shrink-0">
                VS
              </div>

              {/* Right Team (RCB / 2nd Innings) */}
              <div className="flex-1 flex items-center justify-end gap-3 text-right">
                <div className="flex-1 min-w-0">
                  <h4 className="font-extrabold text-emerald-400 text-sm tracking-wide truncate">
                    {team2Name}
                  </h4>
                  <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">
                    2nd Innings
                  </p>
                  <p className="font-black text-foreground text-base mt-0.5">
                    {rightScore}{" "}
                    <span className="text-xs font-medium text-muted-foreground/85">
                      ({rightOvers})
                    </span>
                  </p>
                </div>
                <div className="h-10 w-10 rounded-full flex items-center justify-center font-extrabold text-white bg-emerald-600 text-xs shadow-md">
                  {team2Abbr}
                </div>
              </div>
            </div>

            <div className="flex justify-end mt-1.5 -mb-0.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-[10px] text-muted-foreground hover:text-foreground font-semibold rounded-lg px-2 cursor-pointer"
                onClick={handleManualRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                Refresh Scoreboard
              </Button>
            </div>

            {/* Active team underline indicator using primary theme color */}
            <div className="w-full h-1 bg-muted rounded-full mt-2 flex">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  activeInningsNo === 1
                    ? "w-[45%] bg-primary"
                    : "w-[45%] ml-[55%] bg-primary"
                }`}
              />
            </div>
          </Card>

          {/* Current Over Card */}
          <Card className="p-4 rounded-2xl border border-border/40 shadow-md">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-extrabold text-foreground">
                Current Over ({oversText(currentInn.legal_balls)})
              </span>
              <span className="text-[11px] text-muted-foreground font-bold tracking-tight">
                Batting:{" "}
                <span className="text-foreground font-black">
                  {playerName(striker) || "—"}
                </span>
              </span>
            </div>

            {/* Balls list (1 to 6 slots) */}
            <div className="grid grid-cols-6 gap-2 mb-4">
              {[0, 1, 2, 3, 4, 5].map((idx) => {
                const currentOverNo = Math.floor((currentInn.legal_balls ?? 0) / 6);
                const currentOverBalls = innBalls.filter(
                  (b) => b.over_number === currentOverNo,
                );
                const b = currentOverBalls[idx];

                let bgClass = "bg-muted/30 border border-border/30 text-muted-foreground/30";
                let label = "-";

                if (b) {
                  label = String(b.runs);
                  bgClass = "bg-muted/80 text-foreground font-bold border border-border/40";
                  if (b.is_wicket) {
                    bgClass = "bg-destructive text-destructive-foreground font-extrabold shadow-sm";
                    label = "W";
                  } else if (b.runs === 4) {
                    bgClass = "bg-blue-600 text-white font-extrabold shadow-sm";
                    label = "4";
                  } else if (b.runs === 6) {
                    bgClass = "bg-purple-600 text-white font-extrabold shadow-sm";
                    label = "6";
                  } else if (b.runs === 0 && !b.extra_type) {
                    bgClass = "bg-muted/50 text-muted-foreground/50 border border-border/20";
                    label = "•";
                  } else if (b.extra_type === "wide") {
                    bgClass = "bg-amber-500/15 text-amber-400 font-extrabold border border-amber-500/25";
                    label = "Wd";
                  } else if (b.extra_type === "no_ball") {
                    bgClass = "bg-purple-500/15 text-purple-400 font-extrabold border border-purple-500/25";
                    label = "Nb";
                  }
                }

                return (
                  <div key={idx} className="flex flex-col items-center gap-1">
                    <span className="text-[10px] text-muted-foreground font-bold">
                      {idx + 1}
                    </span>
                    <div
                      className={`w-full aspect-square rounded-xl flex items-center justify-center text-xs font-black shadow-sm ${bgClass}`}
                    >
                      {label}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Scoring Panel Buttons (Interactive modifier layout - no modals, fast taps) */}
            {canScore && (
              <div className="space-y-3">
                {/* Cooldown / Ready Status Banner */}
                {cooldownRemaining > 0 ? (
                  <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl py-2.5 px-3 flex items-center justify-between text-xs font-semibold select-none">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping"></span>
                      Next ball ready in {cooldownRemaining}s...
                    </span>
                    <div className="w-16 bg-amber-500/20 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-amber-500 h-full transition-all duration-1000 ease-linear"
                        style={{ width: `${(cooldownRemaining / 3) * 100}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl py-2 px-3 flex items-center gap-2 text-xs font-semibold select-none">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                    <span>Ready for new ball</span>
                  </div>
                )}

                <div className={`space-y-3 transition-all duration-200 ${actionLock || cooldownRemaining > 0 ? "pointer-events-none opacity-50" : ""}`}>
                {/* Modifier Helper Banner */}
                {activeExtraKind && (
                  <div className="bg-primary/10 border border-primary/20 text-primary rounded-xl py-2 px-3 flex items-center justify-between text-xs animate-pulse">
                    <span className="font-bold">
                      Select runs for {activeExtraKind === "no_ball" ? "No Ball" : activeExtraKind === "wide" ? "Wide" : activeExtraKind === "bye" ? "Bye" : "Leg Bye"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveExtraKind(null)}
                      className="text-[10px] font-black uppercase tracking-wider hover:underline"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2.5">
                  {/* Row 1: 0, 1, 2 */}
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      if (activeExtraKind) {
                        addBall(activeExtraKind, 0);
                        setActiveExtraKind(null);
                      } else {
                        addBall("run", 0);
                      }
                    }}
                    disabled={isInningsOver}
                    className="h-14 text-base font-black rounded-xl border border-border/30 hover:bg-muted/50 text-foreground transition-all shadow-sm active:scale-95 cursor-pointer flex flex-col justify-center"
                  >
                    <span>{activeExtraKind ? "+0" : "0"}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      if (activeExtraKind) {
                        addBall(activeExtraKind, 1);
                        setActiveExtraKind(null);
                      } else {
                        addBall("run", 1);
                      }
                    }}
                    disabled={isInningsOver}
                    className="h-14 text-base font-black rounded-xl border border-border/30 hover:bg-muted/50 text-foreground transition-all shadow-sm active:scale-95 cursor-pointer flex flex-col justify-center"
                  >
                    <span>{activeExtraKind ? "+1" : "1"}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      if (activeExtraKind) {
                        addBall(activeExtraKind, 2);
                        setActiveExtraKind(null);
                      } else {
                        addBall("run", 2);
                      }
                    }}
                    disabled={isInningsOver}
                    className="h-14 text-base font-black rounded-xl border border-border/30 hover:bg-muted/50 text-foreground transition-all shadow-sm active:scale-95 cursor-pointer flex flex-col justify-center"
                  >
                    <span>{activeExtraKind ? "+2" : "2"}</span>
                  </Button>

                  {/* Row 2: 3, 4, 6 */}
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      if (activeExtraKind) {
                        addBall(activeExtraKind, 3);
                        setActiveExtraKind(null);
                      } else {
                        addBall("run", 3);
                      }
                    }}
                    disabled={isInningsOver}
                    className="h-14 text-base font-black rounded-xl border border-border/30 hover:bg-muted/50 text-foreground transition-all shadow-sm active:scale-95 cursor-pointer flex flex-col justify-center"
                  >
                    <span>{activeExtraKind ? "+3" : "3"}</span>
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      if (activeExtraKind) {
                        addBall(activeExtraKind, 4);
                        setActiveExtraKind(null);
                      } else {
                        addBall("run", 4);
                      }
                    }}
                    disabled={isInningsOver}
                    className="h-14 text-base font-black rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-md shadow-blue-900/10 border-none active:scale-95 cursor-pointer flex items-center justify-center"
                  >
                    <span>{activeExtraKind ? "+4" : "4"}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      if (activeExtraKind) {
                        addBall(activeExtraKind, 6);
                        setActiveExtraKind(null);
                      } else {
                        addBall("run", 6);
                      }
                    }}
                    disabled={isInningsOver}
                    className="h-14 text-base font-black rounded-xl border border-border/30 hover:bg-muted/50 text-foreground transition-all shadow-sm active:scale-95 cursor-pointer flex flex-col justify-center"
                  >
                    <span>{activeExtraKind ? "+6" : "6"}</span>
                  </Button>

                  {/* Row 3: W, WD, NB */}
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => addBall("wicket")}
                    disabled={isInningsOver}
                    className="h-14 rounded-xl flex flex-col items-center justify-center font-bold text-destructive-foreground active:scale-95 cursor-pointer"
                  >
                    <span className="text-base font-black">W</span>
                    <span className="text-[9px] opacity-75 font-bold uppercase tracking-wider">
                      Wicket
                    </span>
                  </Button>

                  <Button
                    type="button"
                    variant={activeExtraKind === "wide" ? "default" : "outline"}
                    onClick={() => {
                      if (activeExtraKind === "wide") {
                        // Double tap records standard 1-run wide
                        addBall("wide", 0);
                        setActiveExtraKind(null);
                      } else {
                        setActiveExtraKind("wide");
                      }
                    }}
                    disabled={isInningsOver}
                    className={`h-14 rounded-xl border flex flex-col items-center justify-center active:scale-95 cursor-pointer transition-all ${
                      activeExtraKind === "wide"
                        ? "bg-primary border-primary text-primary-foreground shadow-lg scale-105"
                        : "border-border/40 bg-card hover:bg-muted/40 text-foreground"
                    }`}
                  >
                    <span className="text-base font-black">WD</span>
                    <span className={`text-[9px] font-bold uppercase tracking-wider ${activeExtraKind === "wide" ? "text-primary-foreground" : "text-muted-foreground"}`}>
                      Wide
                    </span>
                  </Button>

                  <Button
                    type="button"
                    variant={activeExtraKind === "no_ball" ? "default" : "outline"}
                    onClick={() => {
                      if (activeExtraKind === "no_ball") {
                        // Double tap records standard no-ball
                        addBall("no_ball", 0);
                        setActiveExtraKind(null);
                      } else {
                        setActiveExtraKind("no_ball");
                      }
                    }}
                    disabled={isInningsOver}
                    className={`h-14 rounded-xl border flex flex-col items-center justify-center active:scale-95 cursor-pointer transition-all ${
                      activeExtraKind === "no_ball"
                        ? "bg-primary border-primary text-primary-foreground shadow-lg scale-105"
                        : "border-border/40 bg-card hover:bg-muted/40 text-foreground"
                    }`}
                  >
                    <span className="text-base font-black">NB</span>
                    <span className={`text-[9px] font-bold uppercase tracking-wider ${activeExtraKind === "no_ball" ? "text-primary-foreground" : "text-muted-foreground"}`}>
                      No Ball
                    </span>
                  </Button>
                </div>

                {/* Bottom Row: Byes, Leg Byes, Undo, Swap Strike */}
                <div className="flex gap-2 justify-center mt-3 pt-2.5 border-t border-border/30 flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={undo}
                    disabled={innBalls.length === 0}
                    className="h-8 text-xs font-semibold px-3 border border-border/40 text-muted-foreground bg-card hover:bg-muted/40 rounded-lg shadow-sm transition-all cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Undo
                  </Button>
                  {!isSoloPlay && !isLastManActive && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={swapStrike}
                      disabled={isInningsOver || !striker || !nonStriker}
                      className="h-8 text-xs font-semibold px-3 border border-border/40 text-muted-foreground bg-card hover:bg-muted/40 rounded-lg shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <ArrowUpDown className="h-3.5 w-3.5 text-primary" />
                      Swap Strike
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant={activeExtraKind === "bye" ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      if (activeExtraKind === "bye") {
                        addBall("bye", 1);
                        setActiveExtraKind(null);
                      } else {
                        setActiveExtraKind("bye");
                      }
                    }}
                    disabled={isInningsOver}
                    className={`h-8 text-xs font-semibold px-3 border rounded-lg shadow-sm transition-all cursor-pointer ${
                      activeExtraKind === "bye"
                        ? "bg-primary border-primary text-primary-foreground scale-105"
                        : "border-border/40 text-muted-foreground bg-card hover:bg-muted/40"
                    }`}
                  >
                    Byes
                  </Button>
                  <Button
                    type="button"
                    variant={activeExtraKind === "leg_bye" ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      if (activeExtraKind === "leg_bye") {
                        addBall("leg_bye", 1);
                        setActiveExtraKind(null);
                      } else {
                        setActiveExtraKind("leg_bye");
                      }
                    }}
                    disabled={isInningsOver}
                    className={`h-8 text-xs font-semibold px-3 border rounded-lg shadow-sm transition-all cursor-pointer ${
                      activeExtraKind === "leg_bye"
                        ? "bg-primary border-primary text-primary-foreground scale-105"
                        : "border-border/40 text-muted-foreground bg-card hover:bg-muted/40"
                    }`}
                  >
                    Leg Byes
                  </Button>
                </div>
              </div>
              </div>
            )}

            {!canScore && (
              <div className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 text-center py-2.5 px-4 rounded-xl text-xs font-medium space-y-1 mt-1">
                <div className="font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 text-[9px]">
                  <span className="flex h-1.5 w-1.5 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                  </span>
                  Live Match Spectator View
                </div>
                <div className="text-[10px] text-emerald-400/80">
                  Only the match creator or administrators can modify.
                </div>
              </div>
            )}
          </Card>

          {/* Scorer Controls / Dropdowns (preserving theme card classes) */}
          {canScore ? (
            <Card className="p-4 rounded-2xl border border-border/40 shadow-md space-y-3.5 relative overflow-hidden">
              {isLocked && (
                <div className="absolute inset-0 bg-background/95 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center gap-2 p-3 text-center">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5 font-bold">
                    🔒 Selection Locked (Over in progress)
                  </span>
                  <Button
                    variant="outline"
                    className="h-8 text-xs px-4 rounded-full font-bold border-border text-foreground hover:bg-muted shadow-sm transition-all"
                    onClick={() => {
                      if (
                        confirm(
                          "Do you have permission to change players during an active over?",
                        )
                      ) {
                        setUnlocked(true);
                      }
                    }}
                  >
                    Unlock Selection
                  </Button>
                </div>
              )}

              <div className="flex items-center justify-between pb-2 border-b border-border/40 mb-1">
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">
                  Match Scoring Mode
                </span>
                <button
                  type="button"
                  className={`h-6 text-[10px] px-3 rounded-full font-bold uppercase cursor-pointer transition-all border ${
                    isSoloPlay
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                  onClick={() => {
                    const nextSoloPlay = !isSoloPlay;
                    setIsSoloPlay(nextSoloPlay);
                    if (nextSoloPlay) {
                      setNonStriker("");
                    }
                  }}
                  disabled={isLocked}
                >
                  {isSoloPlay ? "⚡ Solo Play: ON" : "👥 Standard Play"}
                </button>
              </div>

              <PSelect
                label="Striker"
                value={striker}
                onChange={setStriker}
                options={activeBattingPlayers}
                disabled={isLocked}
              />
              {!isSoloPlay && (
                <PSelect
                  label="Non-striker"
                  value={nonStriker}
                  onChange={setNonStriker}
                  options={activeBattingPlayers}
                  disabled={isLocked || isLastManRemaining}
                />
              )}
              <PSelect
                label="Bowler"
                value={bowler}
                onChange={setBowler}
                options={bowlingPlayers}
                disabled={isOverStarted || isLocked}
                disabledOptions={disabledBowlers}
              />
            </Card>
          ) : (
            <Card className="p-4 rounded-2xl border border-border/40 shadow-md space-y-3">
              <div className="flex justify-between items-center py-1 border-b border-border/40">
                <span className="text-muted-foreground text-xs font-semibold flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-blue-600"></span>
                  Striker:
                </span>
                <span className="font-bold text-foreground text-xs">
                  {playerName(striker) || "Not Selected"}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/40">
                <span className="text-muted-foreground text-xs font-semibold flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-slate-500"></span>
                  Non-striker:
                </span>
                <span className="font-bold text-foreground text-xs">
                  {isLastManRemaining
                    ? "None (Last Man Standing)"
                    : isSoloPlay
                      ? "None (Solo Play)"
                      : playerName(nonStriker) || "Not Selected"}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-muted-foreground text-xs font-semibold flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                  Bowler:
                </span>
                <span className="font-bold text-foreground text-xs">
                  {playerName(bowler) || "Not Selected"}
                </span>
              </div>
            </Card>
          )}

          {/* Previous Overs Card */}
          <Card className="p-4 rounded-2xl border border-border/40 shadow-md">
            <div className="flex justify-between items-center border-b border-border/40 pb-2 mb-1.5">
              <span className="text-sm font-extrabold text-foreground">
                Previous Overs
              </span>
              <span className="text-xs text-muted-foreground font-bold">Runs</span>
            </div>

            <div className="divide-y divide-border/20">
              {visibleOvers.map((over) => (
                <div
                  key={over.overNo}
                  className="py-4 border-b border-border/25 last:border-0 flex items-start justify-between"
                >
                  <div className="w-16 flex-shrink-0">
                    <div className="font-bold text-foreground text-sm">
                      Ov {over.displayOver}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-semibold mt-0.5">
                      {over.scoreAtEnd}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 px-2 space-y-2">
                    <p className="text-xs text-muted-foreground font-semibold truncate">
                      {over.bowlerName} to{" "}
                      <span className="text-foreground font-bold">
                        {over.batterNames}
                      </span>
                    </p>
                    <div className="flex flex-wrap gap-1.5 items-center">
                      {over.balls.map((b) => {
                        let bgClass = "bg-muted text-foreground";
                        let val = String(b.runs);
                        if (b.is_wicket) {
                          bgClass = "bg-destructive text-destructive-foreground shadow-sm";
                          val = "W";
                        } else if (b.runs === 4) {
                          bgClass = "bg-blue-600 text-white shadow-sm";
                          val = "4";
                        } else if (b.runs === 6) {
                          bgClass = "bg-purple-600 text-white shadow-sm";
                          val = "6";
                        } else if (b.runs === 0 && !b.extra_type) {
                          bgClass = "bg-muted text-muted-foreground/45 font-extrabold";
                          val = "•";
                        } else if (b.extra_type === "wide") {
                          bgClass = "bg-amber-500/15 text-amber-400";
                          val = "Wd";
                        } else if (b.extra_type === "no_ball") {
                          bgClass = "bg-purple-500/15 text-purple-400";
                          val = "Nb";
                        }
                        return (
                          <span
                            key={b.id}
                            className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${bgClass}`}
                          >
                            {val}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="w-10 text-right font-black text-foreground text-sm self-center">
                    {over.overRuns}
                  </div>
                </div>
              ))}
              {oversData.length === 0 && (
                <div className="py-4 text-center text-xs text-muted-foreground italic">
                  No overs completed yet
                </div>
              )}
            </div>

            {oversData.length > 4 && (
              <button
                onClick={() => setShowAllOvers(!showAllOvers)}
                className="w-full py-2 flex items-center justify-center gap-1 text-[10px] text-muted-foreground font-bold border border-border/40 rounded-xl bg-muted/40 hover:bg-muted hover:text-foreground transition-colors mt-2 cursor-pointer"
              >
                {showAllOvers ? (
                  <>
                    <span>Show Less Overs</span>
                    <ChevronUp className="h-3 w-3" />
                  </>
                ) : (
                  <>
                    <span>View All Overs</span>
                    <ChevronDown className="h-3 w-3" />
                  </>
                )}
              </button>
            )}
          </Card>

          {/* Scoreboard Card */}
          <Card className="p-4 rounded-2xl border border-border/40 shadow-md">
            <div className="border-b border-border/40 pb-2 mb-3">
              <span className="text-sm font-extrabold text-foreground">
                Scoreboard
              </span>
            </div>

            {/* Side by side scoreboard tables */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Batters Table */}
              <div className="border border-border/40 rounded-xl overflow-hidden bg-muted/10 p-2">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="border-b border-border/30 text-muted-foreground font-bold">
                      <th className="py-2 pl-1 font-bold">Batters</th>
                      <th className="py-2 text-right font-bold">R</th>
                      <th className="py-2 text-right font-bold">B</th>
                      <th className="py-2 text-right font-bold">4s</th>
                      <th className="py-2 text-right font-bold">6s</th>
                      <th className="py-2 text-right font-bold">SR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {scoreboardBatters.map((b) => (
                      <tr
                        key={b.id}
                        className={`${
                          b.isStriker || b.isNonStriker
                            ? "font-extrabold text-primary"
                            : "text-muted-foreground/80 font-medium"
                        }`}
                      >
                        <td className="py-2 pl-1 truncate max-w-[100px]">
                          {b.name}
                          {b.isStriker ? " *" : ""}
                        </td>
                        <td className="py-2 text-right text-foreground">{b.runs}</td>
                        <td className="py-2 text-right text-muted-foreground/50 font-normal">
                          {b.balls}
                        </td>
                        <td className="py-2 text-right text-muted-foreground/50 font-normal">
                          {b.fours}
                        </td>
                        <td className="py-2 text-right text-muted-foreground/50 font-normal">
                          {b.sixes}
                        </td>
                        <td className="py-2 text-right text-muted-foreground/50 font-mono font-normal">
                          {b.sr}
                        </td>
                      </tr>
                    ))}
                    {scoreboardBatters.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-4 text-center text-muted-foreground italic">
                          No batsmen stats
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Bowlers Table */}
              <div className="border border-border/40 rounded-xl overflow-hidden bg-muted/10 p-2">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="border-b border-border/30 text-muted-foreground font-bold">
                      <th className="py-2 pl-1 font-bold">Bowlers</th>
                      <th className="py-2 text-right font-bold">O</th>
                      <th className="py-2 text-right font-bold">M</th>
                      <th className="py-2 text-right font-bold">R</th>
                      <th className="py-2 text-right font-bold">W</th>
                      <th className="py-2 text-right font-bold">Econ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {scoreboardBowlers.map((b) => (
                      <tr
                        key={b.id}
                        className={`${
                          b.id === bowler
                            ? "font-extrabold text-primary"
                            : "text-muted-foreground/80 font-medium"
                        }`}
                      >
                        <td className="py-2 pl-1 truncate max-w-[100px]">{b.name}</td>
                        <td className="py-2 text-right text-foreground">{b.overs}</td>
                        <td className="py-2 text-right text-muted-foreground/50 font-normal">
                          {b.maidens}
                        </td>
                        <td className="py-2 text-right text-muted-foreground/50 font-normal">
                          {b.runs}
                        </td>
                        <td className="py-2 text-right text-foreground font-extrabold">
                          {b.wickets}
                        </td>
                        <td className="py-2 text-right text-muted-foreground/50 font-mono font-normal">
                          {b.econ}
                        </td>
                      </tr>
                    ))}
                    {scoreboardBowlers.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-4 text-center text-muted-foreground italic">
                          No bowlers stats
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Extras and Totals Block */}
            <div className="mt-4 grid grid-cols-2 gap-3 bg-muted/30 p-3 rounded-xl border border-border/30">
              <div>
                <div className="text-[9px] font-black text-muted-foreground uppercase tracking-wider">
                  Extras
                </div>
                <div className="text-xs font-bold text-foreground mt-0.5">
                  {extrasTotal}{" "}
                  <span className="text-[10px] font-medium text-muted-foreground">
                    ({extrasBreakdown})
                  </span>
                </div>
              </div>
              <div>
                <div className="text-[9px] font-black text-muted-foreground uppercase tracking-wider">
                  Total
                </div>
                <div className="text-xs font-extrabold text-foreground mt-0.5">
                  {currentInn.runs}/{currentInn.wickets}{" "}
                  <span className="text-[10px] font-medium text-muted-foreground">
                    ({oversText(currentInn.legal_balls)} Overs)
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* Yet to Bat Batsmen */}
          {yetToBatPlayers.length > 0 && (
            <Card className="p-4 rounded-2xl border border-border/40 shadow-md">
              <div className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mb-2.5">
                Next Batsmen & State
              </div>
              <div className="space-y-2">
                {yetToBatPlayers.map((p, idx) => (
                  <div
                    key={p.id}
                    className="flex justify-between items-center text-xs py-1.5 border-b border-border/20 last:border-0"
                  >
                    <span className="font-bold text-foreground flex items-center gap-2">
                      <span>{p.name}</span>
                      {idx === 0 && (
                        <span className="text-[8px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-black uppercase tracking-wide animate-pulse">
                          Next Up
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-bold">
                      Yet to Bat
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Finish Match Button */}
          {canScore && (
            <Button
              variant="outline"
              className="w-full py-2.5 border-border hover:bg-muted text-foreground rounded-xl shadow-sm text-xs font-bold transition-all active:scale-97 cursor-pointer"
              onClick={endMatch}
            >
              End Match
            </Button>
          )}
        </div>
      </div>

      <Dialog open={isWicketDialogOpen} onOpenChange={setIsWicketDialogOpen}>
        <DialogContent className="max-w-md bg-card border border-border text-foreground rounded-2xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold">
              Wicket Details
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">
                Wicket Type
              </label>
              <Select value={wicketType} onValueChange={(v) => {
                setWicketType(v);
                if (v !== "run_out") {
                  setDismissedPlayerId(striker);
                }
              }}>
                <SelectTrigger className="w-full h-9 text-xs border-border bg-card">
                  <SelectValue placeholder="Wicket Type" />
                </SelectTrigger>
                <SelectContent className="bg-card border border-border text-foreground text-xs shadow-md">
                  <SelectItem value="bowled">Bowled</SelectItem>
                  <SelectItem value="caught">Caught (Catch Out)</SelectItem>
                  <SelectItem value="lbw">LBW</SelectItem>
                  <SelectItem value="stumped">Stumped</SelectItem>
                  <SelectItem value="run_out">Run Out</SelectItem>
                  <SelectItem value="hit_wicket">Hit Wicket</SelectItem>
                  <SelectItem value="other">Retired / Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {wicketType === "caught" && (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">
                  Catch Taken By
                </label>
                <Select value={caughtById} onValueChange={setCaughtById}>
                  <SelectTrigger className="w-full h-9 text-xs border-border bg-card">
                    <SelectValue placeholder="Select Fielder" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border border-border text-foreground text-xs shadow-md">
                    {bowlingPlayers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">
                Dismissed Batsman
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={dismissedPlayerId === striker ? "default" : "outline"}
                  onClick={() => setDismissedPlayerId(striker)}
                  className="w-full text-xs font-semibold h-9 flex items-center justify-center gap-1.5"
                  disabled={wicketType !== "run_out"}
                >
                  Striker: {playerName(striker)}
                </Button>
                {!isSoloPlay && !isLastManActive && (
                  <Button
                    type="button"
                    variant={dismissedPlayerId === nonStriker ? "default" : "outline"}
                    onClick={() => setDismissedPlayerId(nonStriker)}
                    className="w-full text-xs font-semibold h-9 flex items-center justify-center gap-1.5"
                    disabled={wicketType !== "run_out"}
                  >
                    Non-Striker: {playerName(nonStriker)}
                  </Button>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="flex gap-2 justify-end pt-2">
            <Button
              variant="outline"
              className="text-xs h-9 font-semibold"
              onClick={() => setIsWicketDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="text-xs h-9 font-bold"
              onClick={() => {
                if (wicketType === "caught" && !caughtById) {
                  toast.error("Please select the fielder who took the catch");
                  return;
                }
                executeWicketBall(wicketType, dismissedPlayerId, caughtById);
              }}
              disabled={!dismissedPlayerId}
            >
              Confirm Wicket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Scoring Options Dialog Modal */}
      <Dialog open={isMoreOptionsOpen} onOpenChange={setIsMoreOptionsOpen}>
        <DialogContent className="max-w-md bg-card border border-border text-foreground rounded-2xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold">Scoring Options</DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Innings Control</p>
              <div className="grid grid-cols-1 gap-2">
                {currentInn && !currentInn.is_closed && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start gap-2 h-10 border-amber-500/30 text-amber-500 hover:bg-amber-500/10 hover:text-amber-500 font-semibold"
                    onClick={endInnings}
                  >
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    End Current Innings
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start gap-2 h-10 border-red-500/30 text-red-500 hover:bg-red-500/10 hover:text-red-500 font-semibold"
                  onClick={endMatch}
                >
                  <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  End Match (Declare Result)
                </Button>
              </div>
            </div>

            <div className="space-y-1 pt-2 border-t border-border/30">
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Scoring Mode</p>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-xs font-semibold text-muted-foreground">Solo Play (Single Batsman)</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsSoloPlay((prev) => !prev);
                    toast.success(`Solo play mode ${!isSoloPlay ? "enabled" : "disabled"}`);
                  }}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isSoloPlay ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      isSoloPlay ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          <DialogFooter className="flex gap-2 justify-end pt-2 border-t border-border/30">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsMoreOptionsOpen(false)}
              className="h-8 text-xs font-semibold rounded-lg"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {celebrationPlayer && (
        <>
          <CanvasConfetti />
          <Dialog open={!!celebrationPlayer} onOpenChange={() => setCelebrationPlayer(null)}>
            <DialogContent className="max-w-md bg-gradient-to-b from-amber-500/10 via-card to-card border-amber-500/30 text-foreground text-center p-6 rounded-2xl overflow-hidden shadow-2xl relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-pink-500 via-amber-500 to-purple-500" />
              
              <DialogHeader className="items-center pb-2">
                <span className="text-4xl animate-bounce mb-2">🎉</span>
                <DialogTitle className="text-xl font-black text-amber-500 uppercase tracking-widest flex items-center gap-1.5 leading-none">
                  Innings MVP!
                </DialogTitle>
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-1">Outstanding Performance</p>
              </DialogHeader>

              <div className="my-5 flex flex-col items-center">
                <div className="relative mb-3">
                  <div className="w-20 h-20 rounded-full border-4 border-amber-400 p-0.5 bg-card shadow-lg overflow-hidden flex items-center justify-center">
                    {celebrationPlayer.player.avatar ? (
                      <img src={celebrationPlayer.player.avatar} alt={celebrationPlayer.player.name} className="w-full h-full object-cover rounded-full" />
                    ) : (
                      <span className="text-amber-500 font-black text-2xl">
                        {celebrationPlayer.player.name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <span className="absolute -bottom-1 -right-1 bg-amber-500 text-base p-1 rounded-full border-2 border-card shadow-md leading-none">
                    👑
                  </span>
                </div>

                <h2 className="text-2xl font-black text-foreground leading-tight font-sans">
                  {celebrationPlayer.player.name}
                </h2>
                <p className="text-xs text-amber-500 font-bold mt-1">
                  {celebrationPlayer.player.team?.name || "Team Performer"}
                </p>

                <div className="grid grid-cols-3 gap-3 w-full max-w-xs mt-6 border-t border-b border-border/40 py-3.5 text-center">
                  <div>
                    <span className="text-[9px] text-muted-foreground uppercase font-black tracking-wider block">Runs</span>
                    <span className="text-base font-bold text-foreground mt-0.5 block">{celebrationPlayer.runsScored}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-muted-foreground uppercase font-black tracking-wider block">Wickets</span>
                    <span className="text-base font-bold text-foreground mt-0.5 block">{celebrationPlayer.wickets}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-muted-foreground uppercase font-black tracking-wider block">Catches</span>
                    <span className="text-base font-bold text-foreground mt-0.5 block">{celebrationPlayer.catches}</span>
                  </div>
                </div>

                <div className="mt-5 bg-amber-500/10 border border-amber-500/25 py-2 px-5 rounded-xl flex items-center gap-3">
                  <span className="text-[10px] text-amber-500 font-black uppercase tracking-wider">MVP Points Earned</span>
                  <span className="text-xl font-black text-amber-500">{celebrationPlayer.mvp}</span>
                </div>
              </div>

              <DialogFooter className="sm:justify-center mt-2">
                <Button
                  onClick={() => setCelebrationPlayer(null)}
                  className="w-full sm:w-auto px-8 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl shadow-md transition-all duration-200"
                >
                  Awesome!
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </AppShell>
  );
}

function PSelect({
  label,
  value,
  onChange,
  options,
  disabled,
  disabledOptions,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: any[];
  disabled?: boolean;
  disabledOptions?: Set<string>;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-bold text-muted-foreground w-24">{label}</span>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="flex-1 h-9 text-xs border-border text-foreground bg-card" disabled={disabled}>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent className="bg-card border border-border text-foreground text-xs shadow-md">
          {options.map((p) => {
            const isOptDisabled = disabledOptions?.has(p.id);
            return (
              <SelectItem key={p.id} value={p.id} disabled={isOptDisabled}>
                {p.name} {isOptDisabled ? " (Consecutive over)" : ""}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
