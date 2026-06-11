import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { MilestoneCelebration } from "@/components/MilestoneCelebration";
import { ThemeToggle } from "@/components/ThemeToggle";
import { matchService } from "@/lib/services/matchService";
import { inningsService } from "@/lib/services/inningsService";
import { ballService } from "@/lib/services/ballService";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Sparkles,
  Flame,
  Trophy,
  Award,
} from "lucide-react";
import { WinnerCelebrationOverlay } from "@/components/WinnerCelebrationOverlay";
import { backupService } from "@/lib/services/backupService";
import { indexedDbService, BallEvent } from "@/lib/services/indexedDbService";

export const Route = createFileRoute("/matches/$id/score")({ component: LiveScoring });

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

const playMiniCheer = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;
    const duration = 1.8;

    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(600, now);
    filter.frequency.linearRampToValueAtTime(1200, now + 0.4);
    filter.frequency.exponentialRampToValueAtTime(400, now + duration);

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.linearRampToValueAtTime(0.25, now + 0.3);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + duration);
  } catch (e) {
    console.warn("Cheer sound failed", e);
  }
};

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
  const queryClient = useQueryClient();
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

  // Ball correction states
  const [editedBalls, setEditedBalls] = useState<Record<string, Partial<Ball>>>({});
  const [showUndoBanner, setShowUndoBanner] = useState(false);
  const [undoCountdown, setUndoCountdown] = useState(10);
  const [isEditBallOpen, setIsEditBallOpen] = useState(false);
  const [editingBall, setEditingBall] = useState<Ball | null>(null);
  const [editBatterId, setEditBatterId] = useState("");
  const [editBowlerId, setEditBowlerId] = useState("");
  const [editRuns, setEditRuns] = useState(0);
  const [editExtraType, setEditExtraType] = useState("none");
  const [editExtraRuns, setEditExtraRuns] = useState(0);
  const [editIsWicket, setEditIsWicket] = useState(false);
  const [editWicketType, setEditWicketType] = useState("bowled");
  const [editCaughtById, setEditCaughtById] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Undo Countdown Timer Effect
  useEffect(() => {
    if (!showUndoBanner) return;
    if (undoCountdown <= 0) {
      setShowUndoBanner(false);
      return;
    }
    const interval = setInterval(() => {
      setUndoCountdown((c) => c - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [showUndoBanner, undoCountdown]);

  const handleBallClick = (b: Ball) => {
    if (!canScore) return;
    setEditingBall(b);
    setEditBatterId(b.batter_id || "");
    setEditBowlerId(b.bowler_id || "");
    setEditRuns(b.runs ?? 0);
    setEditExtraType(b.extra_type || "none");
    setEditExtraRuns(b.extra_runs ?? 0);
    setEditIsWicket(!!b.is_wicket);
    setEditWicketType(b.wicket_type || "bowled");
    setEditCaughtById(b.caught_by_id || "");
    setIsEditBallOpen(true);
  };


  const [celebrationPlayer, setCelebrationPlayer] = useState<any>(null);
  const [activeMilestone, setActiveMilestone] = useState<{
    type: "30_runs" | "50_runs" | "100_runs" | "3_wickets" | "5_wickets" | "50_partnership" | "100_partnership";
    playerName: string;
    runs?: number;
    balls?: number;
    sr?: string;
    wickets?: number;
  } | null>(null);

  const [sixAnimationActive, setSixAnimationActive] = useState(false);
  const [sixFlashActive, setSixFlashActive] = useState(false);
  const [winnerCelebration, setWinnerCelebration] = useState<{
    winnerTeamName: string;
    margin: string;
    potmName: string;
    potmRuns: number;
    potmBalls: number;
    potmWickets: number;
    potmImpact: number;
  } | null>(null);

  const [matchEndedAuto, setMatchEndedAuto] = useState(false);
  const [firstInnEndedAuto, setFirstInnEndedAuto] = useState(false);

  const [showBackupDialog, setShowBackupDialog] = useState(false);
  const [backupDialogMetadata, setBackupDialogMetadata] = useState<{
    winnerTeamName: string;
    margin: string;
    date: string;
    teams: string;
    result: string;
  } | null>(null);

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
  const [inputOvers, setInputOvers] = useState<number>(6);
  const [submittingOvers, setSubmittingOvers] = useState(false);

  useEffect(() => {
    if (match) {
      setInputOvers(match.overs);
    }
  }, [match?.id, match?.overs]);

  const handleSaveOvers = async () => {
    if (inputOvers < 1 || inputOvers > 50) {
      toast.error("Overs must be between 1 and 50");
      return;
    }
    setSubmittingOvers(true);
    try {
      await matchService.updateMatch(id, { overs: inputOvers });
      toast.success("Match overs updated successfully!");
      await reload();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to update overs");
    } finally {
      setSubmittingOvers(false);
    }
  };
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



  const reload = async () => {
    try {
      const data = await matchService.getMatch(id);
      setMatch(data.m);
      setTeams(data.teams ?? []);
      setInnings(data.innings ?? []);
      setPlayers(data.players ?? []);
      setBalls(data.balls ?? []);
      
      // Update React Query caches instantly
      queryClient.setQueryData(["match", id], data);
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      queryClient.invalidateQueries({ queryKey: ["manOfTheDay"] });
      queryClient.invalidateQueries({ queryKey: ["playerRankings"] });
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
      
      // Update React Query caches instantly
      queryClient.setQueryData(["match", id], data);
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      queryClient.invalidateQueries({ queryKey: ["manOfTheDay"] });
      queryClient.invalidateQueries({ queryKey: ["playerRankings"] });
    });

    return () => {
      channel.stopListening(".MatchUpdated");
      echoClient?.leave(`matches.${id}`);
      setIsLiveSync(false);
    };
  }, [id]);

  // Local Recalculation Engine & Expected positions helpers
  const recalculateLocalInnings = (ballsList: any[], inningsId: string) => {
    const innBalls = ballsList.filter((b) => b.innings_id === inningsId).sort((a, b) => a.ball_index - b.ball_index);
    if (innBalls.length === 0) return ballsList;

    const firstBall = innBalls[0];
    let striker = firstBall.batter_id;
    let non_striker = firstBall.non_striker_id;
    let legal_balls_count = 0;

    const recalculatedInnBalls: any[] = [];
    innBalls.forEach((ball, index) => {
      const updatedBall = { ...ball };

      const over_number = Math.floor(legal_balls_count / 6);
      const ball_in_over = (legal_balls_count % 6) + 1;

      updatedBall.ball_index = index;
      updatedBall.over_number = over_number;
      updatedBall.ball_in_over = ball_in_over;

      if (index > 0) {
        const prevBall = recalculatedInnBalls[index - 1];

        if (prevBall.is_wicket) {
          const dismissed_id = prevBall.batter_id;
          const surviving_id = prevBall.non_striker_id;

          let new_batter = null;
          if (surviving_id === null) {
            new_batter = ball.batter_id;
          } else {
            if (ball.batter_id !== surviving_id) {
              new_batter = ball.batter_id;
            } else if (ball.non_striker_id !== surviving_id) {
              new_batter = ball.non_striker_id;
            }
          }

          if (dismissed_id === striker) {
            striker = new_batter;
            non_striker = surviving_id;
          } else if (dismissed_id === non_striker) {
            non_striker = new_batter;
            striker = surviving_id;
          } else {
            if (!striker) {
              striker = new_batter;
            } else {
              non_striker = new_batter;
            }
          }
        } else {
          const runs_odd = prevBall.runs % 2 === 1;
          const extras_odd = ["bye", "leg_bye"].includes(prevBall.extra_type || "") && (prevBall.extra_runs % 2 === 1);
          const should_swap_runs = runs_odd || extras_odd;

          const should_swap_over = prevBall.is_legal && (legal_balls_count % 6 === 0);

          if (should_swap_runs !== should_swap_over) {
            if (striker && non_striker) {
              const temp = striker;
              striker = non_striker;
              non_striker = temp;
            }
          }
        }
      }

      if (updatedBall.is_wicket) {
        if (updatedBall.wicket_type === "run_out" && updatedBall.non_striker_id === striker) {
          updatedBall.batter_id = non_striker;
          updatedBall.non_striker_id = striker;
        } else {
          updatedBall.batter_id = striker;
          updatedBall.non_striker_id = non_striker;
        }
      } else {
        updatedBall.batter_id = striker;
        updatedBall.non_striker_id = non_striker;
      }

      if (updatedBall.is_legal) {
        legal_balls_count++;
      }

      recalculatedInnBalls.push(updatedBall);
    });

    const otherInningsBalls = ballsList.filter((b) => b.innings_id !== inningsId);
    return [...otherInningsBalls, ...recalculatedInnBalls].sort((a, b) => a.ball_index - b.ball_index);
  };

  const getExpectedStrikerNonStriker = (ballsList: any[], inningsId: string) => {
    const innBalls = ballsList.filter((b) => b.innings_id === inningsId).sort((a, b) => a.ball_index - b.ball_index);
    if (innBalls.length === 0) return { striker: "", nonStriker: "" };

    const lastBall = innBalls[innBalls.length - 1];
    const lastBallIsLegal = lastBall.is_legal;
    const totalLegalBalls = innBalls.filter((b) => b.is_legal).length;
    const isEndOfOver = lastBallIsLegal && totalLegalBalls % 6 === 0;

    let expectedStriker = lastBall.batter_id;
    let expectedNonStriker = lastBall.non_striker_id;

    if (lastBall.is_wicket) {
      expectedStriker = "";
      expectedNonStriker = lastBall.non_striker_id;
    } else {
      const shouldSwap = isEndOfOver || (lastBall.runs % 2 === 1 && !lastBall.extra_type);
      if (shouldSwap) {
        expectedStriker = lastBall.non_striker_id;
        expectedNonStriker = lastBall.batter_id;
      }
    }

    return { striker: expectedStriker || "", nonStriker: expectedNonStriker || "" };
  };

  // 5. Combine server balls with local events (optimistic view)
  const combinedBalls = useMemo(() => {
    let list = balls.filter((b) => !undoneBallIds.includes(b.id));
    
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

    // Apply local edits
    list = list.map((b) => {
      if (editedBalls[b.id]) {
        return { ...b, ...editedBalls[b.id] };
      }
      return b;
    });

    list.sort((a, b) => a.ball_index - b.ball_index);

    // Run recalculation for each innings
    const uniqueInningsIds = Array.from(new Set(list.map((b) => b.innings_id)));
    uniqueInningsIds.forEach((innId) => {
      list = recalculateLocalInnings(list, innId);
    });
    
    return list;
  }, [balls, localEvents, undoneBallIds, editedBalls]);


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

  // 3. Load local data from IndexedDB
  const loadLocalData = async () => {
    if (currentInn) {
      const dbBalls = await indexedDbService.getDeliveries(id, currentInn.innings_no);
      setLocalEvents(dbBalls);
    }
  };

  useEffect(() => {
    loadLocalData();
  }, [currentInn?.id]);

  // 4. Over-Based Background Sync Engine
  const syncPendingData = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncError(null);
    try {
      // 1. Process pending deletions first
      const pendingDeletions = await indexedDbService.getPendingDeletions(id);
      for (const pd of pendingDeletions) {
        try {
          await ballService.undoBall(pd.id);
          await indexedDbService.removePendingDeletion(pd.id);
        } catch (err: any) {
          if (err.response?.status === 404 || err.response?.status === 422) {
            await indexedDbService.removePendingDeletion(pd.id);
          } else {
            throw err;
          }
        }
      }

      // 2. Fetch match sync status from the server
      const status = await ballService.syncStatus(id);

      // 3. Process pending overs
      if (currentInn) {
        const localOvers = await indexedDbService.getOvers(id, currentInn.innings_no);
        const pendingOvers = localOvers.filter((o) => o.status === 'PENDING');

        for (const po of pendingOvers) {
          const isAlreadySyncedOnServer = status.synced_overs.some(
            (so) => so.innings_no === po.inningsNo && so.over_no === po.overNo
          );

          if (isAlreadySyncedOnServer) {
            await indexedDbService.saveOverStatus(id, po.inningsNo, po.overNo, 'SYNCED');
            continue;
          }

          const allDelivs = await indexedDbService.getDeliveries(id, po.inningsNo);
          const overDelivs = allDelivs.filter((d) => d.overNumber === po.overNo);

          if (overDelivs.length === 0) {
            continue;
          }

          const payload = {
            innings_no: po.inningsNo,
            over_no: po.overNo,
            bowler_id: overDelivs[0].bowlerId,
            deliveries: overDelivs.map((d) => ({
              id: d.id,
              ball_index: d.ballIndex,
              ball_in_over: d.ballInOver,
              batter_id: d.batterId,
              non_striker_id: d.nonStrikerId,
              runs: d.runs,
              extra_runs: d.extraRuns,
              extra_type: d.extraType,
              is_wicket: d.isWicket,
              wicket_type: d.wicketType,
              is_legal: d.isLegal,
              caught_by_id: d.caughtById,
            })),
          };

          try {
            await ballService.syncOver(id, payload);
            await indexedDbService.saveOverStatus(id, po.inningsNo, po.overNo, 'SYNCED');

            const delIds = overDelivs.map((d) => d.id);
            await indexedDbService.markDeliveriesSynced(delIds);
          } catch (err: any) {
            if (err.response?.status === 422) {
              toast.error(err.response?.data?.message || "Sync Validation Error");
              await indexedDbService.deleteOverStatus(id, po.inningsNo, po.overNo);
              for (const d of overDelivs) {
                await indexedDbService.deleteDelivery(d.id);
              }
              await loadLocalData();
            } else {
              throw err;
            }
          }
        }
      }

      await reload();
    } catch (err: any) {
      console.error("Sync loop failed", err);
      setSyncError(err.message || "Network Error");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      syncPendingData();
    }, 5000);

    return () => clearInterval(interval);
  }, [id, currentInn?.id]);

  const handleSaveEdit = async () => {
    if (!editingBall) return;
    setIsSavingEdit(true);

    const isWicket = editIsWicket;
    const isLegal = !["wide", "no_ball"].includes(editExtraType);

    const payload = {
      batter_id: editBatterId,
      non_striker_id: editingBall.non_striker_id,
      bowler_id: editBowlerId,
      runs: editRuns,
      extra_runs: editExtraType === "none" ? 0 : editExtraRuns,
      extra_type: editExtraType === "none" ? null : editExtraType,
      is_wicket: isWicket,
      wicket_type: isWicket ? editWicketType : null,
      is_legal: isLegal,
      caught_by_id: (isWicket && editWicketType === "caught") ? editCaughtById || null : null,
    };

    try {
      setEditedBalls((prev) => ({
        ...prev,
        [editingBall.id]: {
          ...editingBall,
          ...payload,
        },
      }));

      setIsEditBallOpen(false);

      await ballService.updateBall(editingBall.id, payload);
      toast.success("Ball updated successfully");

      await reload();

      // Update striker/non-striker positions
      const updatedBalls = combinedBalls.map((b) => (b.id === editingBall.id ? { ...b, ...payload } : b));
      const uniqueInningsIds = Array.from(new Set(updatedBalls.map((b) => b.innings_id)));
      let recalculatedList = updatedBalls;
      uniqueInningsIds.forEach((innId) => {
        recalculatedList = recalculateLocalInnings(recalculatedList, innId);
      });
      if (currentInn) {
        const expected = getExpectedStrikerNonStriker(recalculatedList, currentInn.id);
        if (expected.striker) setStriker(expected.striker);
        if (expected.nonStriker) setNonStriker(expected.nonStriker);
      }
    } catch (err: any) {
      setEditedBalls((prev) => {
        const next = { ...prev };
        delete next[editingBall.id];
        return next;
      });
      toast.error(err.response?.data?.message || err.message || "Failed to update ball");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteBall = async () => {
    if (!editingBall) return;
    if (!confirm("Are you sure you want to delete this ball? This will recalculate the entire innings.")) return;

    setIsSavingEdit(true);
    try {
      setUndoneBallIds((prev) => [...prev, editingBall.id]);
      setIsEditBallOpen(false);

      await ballService.undoBall(editingBall.id);
      toast.success("Ball deleted successfully");

      await reload();

      const updatedBalls = combinedBalls.filter((b) => b.id !== editingBall.id);
      const uniqueInningsIds = Array.from(new Set(updatedBalls.map((b) => b.innings_id)));
      let recalculatedList = updatedBalls;
      uniqueInningsIds.forEach((innId) => {
        recalculatedList = recalculateLocalInnings(recalculatedList, innId);
      });
      if (currentInn) {
        const expected = getExpectedStrikerNonStriker(recalculatedList, currentInn.id);
        if (expected.striker) setStriker(expected.striker);
        if (expected.nonStriker) setNonStriker(expected.nonStriker);
      }
    } catch (err: any) {
      setUndoneBallIds((prev) => prev.filter((id) => id !== editingBall.id));
      toast.error(err.response?.data?.message || err.message || "Failed to delete ball");
    } finally {
      setIsSavingEdit(false);
    }
  };

  

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

  const projectedScore = useMemo(() => {
    if (!currentInn || !match) return 0;
    const crrVal = parseFloat(currentCRR);
    return Math.round(crrVal * match.overs);
  }, [currentCRR, currentInn, match]);

  const currentPartnership = useMemo(() => {
    if (!currentInn || !striker || !nonStriker) {
      return { playerA: "—", playerB: "—", runs: 0, balls: 0, runRate: "0.00" };
    }
    const lastWicketIdx = [...innBalls].reverse().findIndex((b) => b.is_wicket);
    const partBalls = lastWicketIdx === -1 
      ? innBalls 
      : innBalls.slice(innBalls.length - lastWicketIdx);
    
    const runs = partBalls.reduce((sum, b) => sum + (b.runs ?? 0) + (b.extra_runs ?? 0), 0);
    const ballsCount = partBalls.filter((b) => b.extra_type !== "wide").length;
    const runRate = ballsCount > 0 ? ((runs / ballsCount) * 6).toFixed(2) : "0.00";

    return {
      playerA: playerName(striker),
      playerB: playerName(nonStriker),
      runs,
      balls: ballsCount,
      runRate,
    };
  }, [innBalls, striker, nonStriker, players, currentInn]);

  const last6Balls = useMemo(() => {
    return [...innBalls]
      .slice(-6)
      .map((b) => {
        if (b.is_wicket) return "W";
        if (b.extra_type === "wide") return "Wd";
        if (b.extra_type === "no_ball") return "Nb";
        if (b.runs === 4) return "4";
        if (b.runs === 6) return "6";
        return String(b.runs);
      });
  }, [innBalls]);

  const activeBattersStats = useMemo(() => {
    const list: { name: string; sr: string }[] = [];
    if (striker) {
      const sBalls = innBalls.filter(b => b.batter_id === striker && b.extra_type !== "wide");
      const sRuns = sBalls.reduce((sum, b) => sum + (b.runs ?? 0), 0);
      const sr = sBalls.length > 0 ? ((sRuns / sBalls.length) * 100).toFixed(1) : "0.0";
      list.push({ name: playerName(striker), sr });
    }
    if (nonStriker) {
      const nsBalls = innBalls.filter(b => b.batter_id === nonStriker && b.extra_type !== "wide");
      const nsRuns = nsBalls.reduce((sum, b) => sum + (b.runs ?? 0), 0);
      const sr = nsBalls.length > 0 ? ((nsRuns / nsBalls.length) * 100).toFixed(1) : "0.0";
      list.push({ name: playerName(nonStriker), sr });
    }
    return list;
  }, [innBalls, striker, nonStriker, players]);

  const currentBowlerStat = useMemo(() => {
    if (!bowler) return null;
    const bBalls = innBalls.filter(b => b.bowler_id === bowler);
    const runsConceded = bBalls.reduce((sum, b) => {
      if (b.extra_type === "bye" || b.extra_type === "leg_bye") return sum;
      return sum + (b.runs ?? 0) + (b.extra_runs ?? 0);
    }, 0);
    const legalBalls = bBalls.filter(b => b.is_legal).length;
    const econ = legalBalls > 0 ? ((runsConceded / legalBalls) * 6).toFixed(2) : "0.00";
    const wickets = bBalls.filter(b => b.is_wicket && b.wicket_type !== "run_out").length;
    return { name: playerName(bowler), econ, wickets };
  }, [innBalls, bowler, players]);

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
    const disabled: Record<string, string> = {};
    if (currentInn) {
      const currentOverNo = Math.floor((currentInn.legal_balls ?? 0) / 6);
      const prevOverNo = currentOverNo - 1;
      if (prevOverNo >= 0) {
        const prevOverBall = [...innBalls].reverse().find((b) => b.over_number === prevOverNo);
        if (prevOverBall && prevOverBall.bowler_id) {
          disabled[prevOverBall.bowler_id] = "Consecutive over";
        }
      }
    }
    return disabled;
  }, [currentInn, innBalls]);

  const strikerDisabledOptions = useMemo(() => {
    const disabled: Record<string, string> = {};
    if (nonStriker) {
      disabled[nonStriker] = "Non-striker";
    }
    return disabled;
  }, [nonStriker]);

  const nonStrikerDisabledOptions = useMemo(() => {
    const disabled: Record<string, string> = {};
    if (striker) {
      disabled[striker] = "Striker";
    }
    return disabled;
  }, [striker]);

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

  const computePlayerStats = (player: any) => {
    const pBalls = combinedBalls.filter((b) => b.batter_id === player.id);
    const runs = pBalls.reduce((sum, b) => {
      if (b.extra_type === "wide") return sum;
      return sum + (b.runs ?? 0);
    }, 0);
    const ballsFaced = pBalls.filter((b) => b.extra_type !== "wide").length;
    const sixes = pBalls.filter((b) => b.runs === 6 && b.extra_type !== "wide").length;
    const fours = pBalls.filter((b) => b.runs === 4 && b.extra_type !== "wide").length;

    const bowlBalls = combinedBalls.filter((b) => b.bowler_id === player.id);
    const wickets = bowlBalls.filter(
      (b) => b.is_wicket && b.wicket_type !== "run_out" && b.wicket_type !== "retired_hurt"
    ).length;
    const runsConceded = bowlBalls.reduce((sum, b) => {
      if (b.extra_type === "bye" || b.extra_type === "leg_bye") return sum;
      return sum + (b.runs ?? 0) + (b.extra_runs ?? 0);
    }, 0);
    const legalBallsBowled = bowlBalls.filter((b) => b.is_legal).length;

    const catches = combinedBalls.filter(
      (b) => b.is_wicket && b.wicket_type === "caught" && b.caught_by_id === player.id
    ).length;

    // Match Impact Score
    let impactScore = runs * 1.0 + sixes * 2.0 + fours * 1.0;
    if (ballsFaced > 0 && runs >= 10) {
      const strikeRate = (runs / ballsFaced) * 100;
      impactScore += (strikeRate / 10);
    }
    impactScore += wickets * 25.0;
    if (legalBallsBowled > 0) {
      const economy = (runsConceded / legalBallsBowled) * 6;
      if (economy < 8) {
        impactScore += (8 - economy) * 5;
      }
    }
    impactScore += catches * 10.0;

    return {
      runs,
      ballsFaced,
      sixes,
      fours,
      wickets,
      catches,
      impactScore: Math.round(impactScore),
    };
  };

  const endMatch = async (autoEnd = false) => {
    if (!autoEnd && !confirm("Are you sure you want to end this match?")) return;

    // 1. Calculate player stats to determine POTM
    const playerStatsList = players.map((p) => {
      const stats = computePlayerStats(p);
      return { player: p, ...stats };
    });

    // Sort descending by impactScore
    const sortedStats = [...playerStatsList].sort((a, b) => b.impactScore - a.impactScore);
    const potm = sortedStats[0] || {
      player: { name: "No Player", id: "" },
      runs: 0,
      ballsFaced: 0,
      wickets: 0,
      impactScore: 0,
    };

    // 2. Perform achievement checks and save in localStorage
    players.forEach((p) => {
      const stats = playerStatsList.find((ps) => ps.player.id === p.id);
      if (!stats) return;

      const isPOTM = p.id === potm.player.id;
      const achievementsKey = `criclab_achievements_${p.id}`;
      let existing: string[] = [];
      try {
        const stored = localStorage.getItem(achievementsKey);
        existing = stored ? JSON.parse(stored) : [];
      } catch (e) {}

      const newAchievements = new Set(existing);
      newAchievements.add("first_match");
      if (stats.runs >= 50) newAchievements.add("first_fifty");
      if (stats.runs >= 100) newAchievements.add("first_century");
      if (stats.wickets >= 3) newAchievements.add("first_3_wickets");
      if (stats.wickets >= 5) newAchievements.add("first_5_wickets");
      if (isPOTM) newAchievements.add("man_of_the_match");
      if (isPOTM) newAchievements.add("tournament_mvp");

      localStorage.setItem(achievementsKey, JSON.stringify(Array.from(newAchievements)));
    });

    // 3. Determine winner margins
    let winnerTeamName = "No Result";
    let margin = "Match ended";
    const inn1 = optimisticInnings.find((inn) => inn.innings_no === 1);
    const inn2 = optimisticInnings.find((inn) => inn.innings_no === 2);

    if (inn1 && inn2) {
      if (inn2.runs > inn1.runs) {
        winnerTeamName = teamName(inn2.batting_team_id);
        const wicketsLeft = (battingPlayers.length > 0 ? battingPlayers.length : 10) - inn2.wickets;
        margin = `Won by ${wicketsLeft} wickets`;
      } else if (inn1.runs > inn2.runs) {
        winnerTeamName = teamName(inn1.batting_team_id);
        margin = `Won by ${inn1.runs - inn2.runs} runs`;
      } else {
        winnerTeamName = "Match Tied";
        margin = `Scores level at ${inn1.runs}`;
      }
    } else if (inn1) {
      winnerTeamName = teamName(inn1.batting_team_id);
      margin = `Innings completed with ${inn1.runs} runs`;
    }

    // 4. Set winnerCelebration state to open the Winner overlay
    setWinnerCelebration({
      winnerTeamName,
      margin,
      potmName: potm.player.name,
      potmRuns: potm.runs,
      potmBalls: potm.ballsFaced,
      potmWickets: potm.wickets,
      potmImpact: potm.impactScore,
    });
  };

  const isSecondInningsCompleted = useMemo(() => {
    return !!(currentInn && currentInn.innings_no === 2 && isInningsOver);
  }, [currentInn, isInningsOver]);

  useEffect(() => {
    if (isSecondInningsCompleted && !matchEndedAuto && !winnerCelebration && match && !match.is_closed) {
      setMatchEndedAuto(true);
      const timer = setTimeout(() => {
        endMatch(true);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isSecondInningsCompleted, matchEndedAuto, winnerCelebration, match]);

  const isFirstInningsCompleted = useMemo(() => {
    return !!(currentInn && currentInn.innings_no === 1 && isInningsOver && !currentInn.is_closed);
  }, [currentInn, isInningsOver]);

  useEffect(() => {
    if (isFirstInningsCompleted && !firstInnEndedAuto) {
      setFirstInnEndedAuto(true);
      const timer = setTimeout(async () => {
        try {
          if (currentInn) {
            await inningsService.closeInnings(currentInn.id);
            toast.success("First innings completed!");
            reload();
          }
        } catch (err: any) {
          toast.error(err.response?.data?.message || err.message);
          setFirstInnEndedAuto(false);
        }
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isFirstInningsCompleted, firstInnEndedAuto, currentInn]);

  const finalizeMatch = async () => {
    let dateStr = new Date().toISOString().split('T')[0];
    let teamsStr = "Teams";
    let resultStr = "Match Completed";

    if (match) {
      const teamA = teams.find((t: any) => t.id === match.team_a_id)?.name || 'Team A';
      const teamB = teams.find((t: any) => t.id === match.team_b_id)?.name || 'Team B';
      teamsStr = `${teamA} vs ${teamB}`;
      dateStr = new Date(match.match_date).toISOString().split('T')[0];
      resultStr = winnerCelebration?.margin || 'Match Completed';
    }

    try {
      const data = await matchService.endMatch(id);
      toast.success(data.result || "Match finished!");
      queryClient.invalidateQueries({ queryKey: ["match", id] });
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      queryClient.invalidateQueries({ queryKey: ["manOfTheDay"] });
      queryClient.invalidateQueries({ queryKey: ["playerRankings"] });
    } catch (err: any) {
      console.warn("Failed to sync match end to server:", err);
      toast.warning("Server synchronization failed, match marked completed locally.");
    }

    // Cache the completed match details locally before exporting
    const detail = {
      m: { ...match, status: 'past', is_closed: true, result: resultStr },
      teams,
      innings: optimisticInnings,
      players,
      balls: combinedBalls
    };
    localStorage.setItem(`criclab_match_cache_${id}`, JSON.stringify(detail));

    // Open backup prompt
    setBackupDialogMetadata({
      winnerTeamName: winnerCelebration?.winnerTeamName || "Winner",
      margin: winnerCelebration?.margin || "Match Finished",
      date: dateStr,
      teams: teamsStr,
      result: resultStr,
    });
    setWinnerCelebration(null);
    setShowBackupDialog(true);
  };

  const handleSaveBackup = () => {
    if (!backupDialogMetadata) return;
    try {
      const detail = {
        m: { ...match, status: 'past', is_closed: true, result: backupDialogMetadata.result },
        teams,
        innings: optimisticInnings,
        players,
        balls: combinedBalls
      };
      const backupData = backupService.generateSingleMatchBackupJSON(id, detail);
      
      const cleanTeamsStr = backupDialogMetadata.teams.replace(/\s+/g, '_');
      const version = backupData.backupVersion || 1;
      const filename = `${cleanTeamsStr}_v${version}.json`;
      
      backupService.downloadBackupFile(filename, backupData);
      backupService.saveLocalBackup(id, backupData);
      
      toast.success("Backup downloaded and saved to local backups!");
    } catch (e: any) {
      toast.error("Failed to generate backup: " + e.message);
    } finally {
      setShowBackupDialog(false);
      nav({ to: "/matches/$id", params: { id } });
    }
  };

  const handleNotNowBackup = () => {
    if (!backupDialogMetadata) return;
    const localVersion = parseInt(localStorage.getItem(`criclab_match_local_version_${id}`) || '1', 10);
    const cloudVersion = parseInt(localStorage.getItem(`criclab_match_cloud_version_${id}`) || '1', 10);
    const correctionVersion = parseInt(localStorage.getItem(`criclab_match_correction_version_${id}`) || '1', 10);
    const backupVersion = Math.max(localVersion, cloudVersion, correctionVersion);

    backupService.markBackupPending(id, {
      date: backupDialogMetadata.date,
      teams: backupDialogMetadata.teams,
      result: backupDialogMetadata.result,
      version: backupVersion
    });

    toast.info("Backup capability saved. You can export later from the Backup Center.");
    setShowBackupDialog(false);
    nav({ to: "/matches/$id", params: { id } });
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
      inningsNo: currentInn.innings_no,
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

    const bowlerBallsBefore = innBalls.filter((b) => b.bowler_id === bowler);
    const wicketsBefore = bowlerBallsBefore.filter(
      (b) => b.is_wicket && b.wicket_type !== "run_out"
    ).length;

    const isBowlerWicket = wType !== "run_out";
    const newBowlerWickets = wicketsBefore + (isBowlerWicket ? 1 : 0);

    if (isBowlerWicket) {
      const name = playerName(bowler);
      if (wicketsBefore < 5 && newBowlerWickets >= 5) {
        setActiveMilestone({
          type: "5_wickets",
          playerName: name,
          wickets: newBowlerWickets,
        });
      } else if (wicketsBefore < 3 && newBowlerWickets >= 3) {
        setActiveMilestone({
          type: "3_wickets",
          playerName: name,
          wickets: newBowlerWickets,
        });
      }
    }

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
    (async () => {
      await indexedDbService.saveDelivery({
        ...newEvent,
        inningsNo: currentInn.innings_no
      });
      if (newLegal % 6 === 0) {
        await indexedDbService.saveOverStatus(id, currentInn.innings_no, newEvent.overNumber, 'PENDING');
        syncPendingData();
      }
      loadLocalData();
    })();
    setShowUndoBanner(true);
    setUndoCountdown(10);
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
      inningsNo: currentInn.innings_no,
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

    const strikerBallsBefore = innBalls.filter((b) => b.batter_id === striker);
    const runsBefore = strikerBallsBefore.reduce((sum, b) => {
      if (b.extra_type === "wide") return sum;
      return sum + (b.runs ?? 0);
    }, 0);
    const ballsCountBefore = strikerBallsBefore.filter((b) => b.extra_type !== "wide").length;

    const runsAdded = (kind === "run" || kind === "no_ball") ? runs : 0;
    const isWide = kind === "wide";
    const newRuns = runsBefore + runsAdded;
    const newBallsCount = ballsCountBefore + (isWide ? 0 : 1);
    const newSR = newBallsCount > 0 ? ((newRuns / newBallsCount) * 100).toFixed(1) : "0.0";

    const sName = playerName(striker);
    if (runsBefore < 100 && newRuns >= 100) {
      setActiveMilestone({
        type: "100_runs",
        playerName: sName,
        runs: newRuns,
        balls: newBallsCount,
        sr: newSR,
      });
    } else if (runsBefore < 50 && newRuns >= 50) {
      setActiveMilestone({
        type: "50_runs",
        playerName: sName,
        runs: newRuns,
        balls: newBallsCount,
        sr: newSR,
      });
    } else if (runsBefore < 30 && newRuns >= 30) {
      setActiveMilestone({
        type: "30_runs",
        playerName: sName,
        runs: newRuns,
        balls: newBallsCount,
        sr: newSR,
      });
    }

    // Calculate partnership milestones
    if (!isSoloPlay && !isLastManActive && striker && nonStriker) {
      let runsAddedThisBall = 0;
      if (kind === "run") runsAddedThisBall = runs;
      else if (kind === "wide") runsAddedThisBall = (match.wide_run ?? 1) + runs;
      else if (kind === "no_ball") runsAddedThisBall = (match.noball_run ?? 1) + runs;
      else if (kind === "bye" || kind === "leg_bye") runsAddedThisBall = runs;

      const runsAfterPart = currentPartnership.runs + runsAddedThisBall;
      const ballsAfterPart = currentPartnership.balls + (kind === "wide" ? 0 : 1);
      const pairName = `${playerName(striker)} & ${playerName(nonStriker)}`;

      if (currentPartnership.runs < 100 && runsAfterPart >= 100) {
        setActiveMilestone({
          type: "100_partnership",
          playerName: pairName,
          runs: runsAfterPart,
          balls: ballsAfterPart,
        });
      } else if (currentPartnership.runs < 50 && runsAfterPart >= 50) {
        setActiveMilestone({
          type: "50_partnership",
          playerName: pairName,
          runs: runsAfterPart,
          balls: ballsAfterPart,
        });
      }
    }

    // Six ball animation, crowd cheer & flash trigger
    if (runs === 6 && (kind === "run" || kind === "no_ball")) {
      setSixAnimationActive(true);
      setSixFlashActive(true);
      playMiniCheer();
      setTimeout(() => setSixAnimationActive(false), 2000);
      setTimeout(() => setSixFlashActive(false), 500);
    }

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
    (async () => {
      await indexedDbService.saveDelivery({
        ...newEvent,
        inningsNo: currentInn.innings_no
      });
      if (isLegal && newLegal % 6 === 0) {
        await indexedDbService.saveOverStatus(id, currentInn.innings_no, newEvent.overNumber, 'PENDING');
        syncPendingData();
      }
      loadLocalData();
    })();
    setUnlocked(false);
    setShowUndoBanner(true);
    setUndoCountdown(10);
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

    // Find the state snapshot for the ball we are undoing
    const lastStateSnapshot = undoStates.find(
      (us) => us.inningsId === (last.innings_id || last.inningsId) && us.ballIndex === (last.ball_index || last.ballIndex)
    );

    // Optimistic undo update
    setUndoneBallIds((prev) => [...prev, last.id]);
    setUndoStates((prev) =>
      prev.filter(
        (us) => !(us.inningsId === (last.innings_id || last.inningsId) && us.ballIndex === (last.ball_index || last.ballIndex))
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
      setStriker("");
      setNonStriker("");
      setBowler("");
    }

    try {
      await indexedDbService.deleteDelivery(last.id);

      const lastBallOverNo = last.over_number !== undefined ? last.over_number : last.overNumber;
      await indexedDbService.deleteOverStatus(id, currentInn.innings_no, lastBallOverNo);

      if (!last.id.startsWith('local_')) {
        await indexedDbService.addPendingDeletion(last.id, id);
      }

      toast.success("Last ball undone");
      syncPendingData();
      await loadLocalData();
    } catch (err: any) {
      console.error("Failed to undo ball locally", err);
      toast.error("Failed to undo ball: " + err.message);
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
    <div className="bg-card border-b border-border/80 text-foreground py-3 px-4 flex items-center justify-between sticky top-0 z-20 shadow-md">
      <div className="flex items-center gap-3">
        <button
          onClick={() => nav({ to: "/matches/$id", params: { id } })}
          className="hover:bg-accent hover:text-accent-foreground p-1.5 rounded-full transition-colors cursor-pointer text-foreground"
          title="Back to Match"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="font-bold text-base md:text-lg tracking-wide text-foreground">
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
        <ThemeToggle />
        {canScore && currentInn && (
          <button
            onClick={undo}
            disabled={innBalls.length === 0}
            className="flex items-center gap-1 text-xs font-semibold hover:bg-accent hover:text-accent-foreground disabled:opacity-40 py-1 px-1.5 sm:px-2 rounded-lg transition-all cursor-pointer text-foreground"
            title="Undo"
          >
            <RotateCcw className="h-4 w-4" />
            <span className="hidden sm:inline">Undo</span>
          </button>
        )}
        <button
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1 text-xs font-semibold hover:bg-accent hover:text-accent-foreground disabled:opacity-40 py-1 px-1.5 sm:px-2 rounded-lg transition-all cursor-pointer text-foreground"
          title="Refresh Scoreboard"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
        <button
          className="flex items-center gap-1 text-xs font-semibold hover:bg-accent hover:text-accent-foreground py-1 px-1.5 sm:px-2 rounded-lg transition-all cursor-pointer text-foreground"
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
          className="flex items-center gap-1 text-xs font-semibold hover:bg-accent hover:text-accent-foreground py-1 px-1.5 sm:px-2 rounded-lg transition-all cursor-pointer text-foreground"
          title="Save"
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
                    onClick={() => endMatch()}
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
          {winnerCelebration && (
            <WinnerCelebrationOverlay
              winnerTeamName={winnerCelebration.winnerTeamName}
              margin={winnerCelebration.margin}
              potmName={winnerCelebration.potmName}
              potmRuns={winnerCelebration.potmRuns}
              potmBalls={winnerCelebration.potmBalls}
              potmWickets={winnerCelebration.potmWickets}
              potmImpact={winnerCelebration.potmImpact}
              onComplete={finalizeMatch}
            />
          )}
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
                      onClick={() => endMatch()}
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
      {/* Inline styles for six animations and flash */}
      <style>{`
        @keyframes sixFly {
          0% { transform: scale(0.3) translateY(300px) rotate(0deg); opacity: 0; }
          20% { opacity: 1; }
          50% { transform: scale(2.2) translateY(-150px) rotate(180deg); }
          80% { opacity: 1; }
          100% { transform: scale(0.1) translateY(-400px) rotate(360deg); opacity: 0; }
        }
        .animate-six-fly {
          animation: sixFly 2.0s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
        }
        @keyframes fadeOut {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        .animate-fade-out {
          animation: fadeOut 0.5s ease-out forwards;
        }
      `}</style>

      {sixFlashActive && (
        <div className="fixed inset-0 bg-orange-500/25 pointer-events-none z-[9999] animate-fade-out" />
      )}
      {sixAnimationActive && (
        <div className="fixed inset-0 pointer-events-none z-[9999] flex items-center justify-center">
          <div className="animate-six-fly relative">
            <div className="w-16 h-16 rounded-full bg-orange-500 border-4 border-white flex items-center justify-center text-white font-black text-2xl shadow-[0_0_20px_rgba(249,115,22,0.8)]">
              6
            </div>
            <div className="absolute top-full left-1/2 -translate-x-1/2 text-orange-500 font-extrabold text-sm tracking-wider uppercase drop-shadow mt-2 whitespace-nowrap animate-bounce">
              Huge Hit!
            </div>
          </div>
        </div>
      )}

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

            {secondInningsInfo && (
              <div className="mt-3 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-bold text-center animate-pulse">
                Target: {secondInningsInfo.target} | Need {secondInningsInfo.needed} runs off {secondInningsInfo.ballsRemaining} balls (RRR: {secondInningsInfo.reqRR})
              </div>
            )}

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

          {/* Live Match Insights Card */}
          <Card className="p-4 rounded-2xl border border-border/40 shadow-md bg-card dark:bg-gradient-to-br dark:from-slate-900/60 dark:to-slate-950/80 dark:backdrop-blur-md">
            <h3 className="text-xs font-black text-primary uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Live Match Insights
            </h3>
            
            <div className="space-y-3.5 text-xs">
              {/* Partnership & Last 6 Balls */}
              <div className="grid grid-cols-2 gap-3 pb-3 border-b border-border/20">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Partnership</span>
                  <div className="font-bold text-foreground mt-0.5 truncate max-w-[170px]">
                    {currentPartnership.playerA} & {currentPartnership.playerB}
                  </div>
                  <div className="text-xs font-black text-primary mt-0.5">
                    {currentPartnership.runs} Runs <span className="text-[10px] text-muted-foreground font-medium">({currentPartnership.balls}b)</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    RR: {currentPartnership.runRate}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Last 6 Balls</span>
                  <div className="flex gap-1.5 mt-1.5 flex-wrap">
                    {last6Balls.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      last6Balls.map((lbl, idx) => {
                        let badgeColor = "bg-muted/80 text-foreground";
                        if (lbl === "W") badgeColor = "bg-destructive text-destructive-foreground font-bold";
                        else if (lbl === "4") badgeColor = "bg-blue-600 text-white font-bold";
                        else if (lbl === "6") badgeColor = "bg-orange-500 text-white font-bold shadow-[0_0_8px_rgba(249,115,22,0.4)]";
                        return (
                          <span key={idx} className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${badgeColor}`}>
                            {lbl}
                          </span>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* CRR, RRR & Projected Score */}
              <div className="grid grid-cols-3 gap-2 pb-3 border-b border-border/20">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Run Rate</span>
                  <span className="font-extrabold text-foreground text-sm mt-0.5 block">
                    CRR: {currentCRR}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Projected Score</span>
                  <span className="font-extrabold text-foreground text-sm mt-0.5 block">
                    {projectedScore > 0 ? projectedScore : "—"}
                  </span>
                  <span className="text-[9px] text-muted-foreground block">
                    at CRR
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Required Rate</span>
                  <span className="font-extrabold text-foreground text-sm mt-0.5 block">
                    {secondInningsInfo ? `RRR: ${secondInningsInfo.reqRR}` : "N/A"}
                  </span>
                </div>
              </div>

              {/* Batting Stats & Bowler Economy */}
              <div className="flex flex-wrap justify-between gap-4 mt-3 border-t border-border/40 pt-3 text-left">
                <div className="flex-1 min-w-[130px]">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Batting Strike Rates</span>
                  {activeBattersStats.length === 0 ? (
                    <span className="text-[11px] text-muted-foreground">—</span>
                  ) : (
                    activeBattersStats.map((stat, idx) => (
                      <div key={idx} className="flex justify-between items-center mt-1 gap-2">
                        <span className="font-bold text-foreground truncate max-w-[100px]">{stat.name}</span>
                        <span className="text-muted-foreground font-mono text-[11px] shrink-0">SR: {stat.sr}</span>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex-1 min-w-[130px]">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Current Bowler</span>
                  {currentBowlerStat ? (
                    <div className="mt-1">
                      <div className="font-bold text-foreground truncate max-w-[130px]">{currentBowlerStat.name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        Econ: {currentBowlerStat.econ} | Wkts: {currentBowlerStat.wickets}
                      </div>
                    </div>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">—</span>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Current Over Card */}
          <Card className="p-4 rounded-2xl border border-border/40 shadow-md">
            <div className="flex justify-between items-start mb-3">
              <span className="text-sm font-extrabold text-foreground mt-0.5">
                Current Over ({oversText(currentInn.legal_balls)})
              </span>
              <div className="flex flex-col items-end text-[11px] text-muted-foreground font-bold tracking-tight">
                <div>
                  Striker:{" "}
                  <span className="text-primary font-extrabold">
                    {playerName(striker) || "—"}*
                  </span>
                </div>
                {!isSoloPlay && nonStriker && (
                  <div>
                    Non-Striker:{" "}
                    <span className="text-foreground/80 font-semibold">
                      {playerName(nonStriker) || "—"}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Balls list (1 to 6 slots, expanding dynamically for extras) */}
            <div className="grid grid-cols-6 gap-2 mb-4">
              {(() => {
                const currentOverNo = Math.floor((currentInn.legal_balls ?? 0) / 6);
                const currentOverBalls = innBalls.filter(
                  (b) => b.over_number === currentOverNo,
                );
                const slotsCount = currentOverBalls.length >= 6 ? currentOverBalls.length + 1 : 6;
                const slots = Array.from({ length: slotsCount }, (_, i) => i);

                return slots.map((idx) => {
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
                      label = "0";
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
                        onClick={() => b && handleBallClick(b)}
                        className={`w-full aspect-square rounded-xl flex items-center justify-center text-xs font-black shadow-sm ${bgClass} ${
                          b && canScore ? "cursor-pointer hover:scale-105 active:scale-95 transition-all hover:brightness-110" : ""
                        }`}
                      >
                        {label}
                      </div>
                    </div>
                  );
                });
              })()}
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
                    className="h-14 text-base font-black rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-[0_0_15px_rgba(249,115,22,0.6)] border-none animate-pulse scale-105 active:scale-95 transition-all cursor-pointer flex flex-col justify-center"
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
                disabledOptions={strikerDisabledOptions}
              />
              {!isSoloPlay && (
                <PSelect
                  label="Non-striker"
                  value={nonStriker}
                  onChange={setNonStriker}
                  options={activeBattingPlayers}
                  disabled={isLocked || isLastManRemaining}
                  disabledOptions={nonStrikerDisabledOptions}
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
                          val = "0";
                        } else if (b.extra_type === "wide") {
                          bgClass = "bg-amber-500/15 text-amber-400";
                          val = "Wd";
                        } else if (b.extra_type === "no_ball") {
                          bgClass = "bg-purple-500/15 text-purple-400";
                          val = "Nb";
                        }
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => canScore && handleBallClick(b)}
                            className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${bgClass} ${
                              canScore ? "cursor-pointer hover:scale-110 active:scale-90 transition-all border border-border/20" : ""
                            }`}
                          >
                            {val}
                          </button>
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
              onClick={() => endMatch()}
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
                  onClick={() => endMatch()}
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

            <div className="space-y-1 pt-2 border-t border-border/30">
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Match Settings</p>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-xs font-semibold text-muted-foreground">Match Overs</span>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    max="50"
                    value={inputOvers}
                    onChange={(e) => setInputOvers(parseInt(e.target.value) || 1)}
                    className="w-16 h-8 text-xs text-center bg-background border-border"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSaveOvers}
                    disabled={submittingOvers}
                    className="h-8 text-[10px] font-black uppercase tracking-wider cursor-pointer"
                  >
                    {submittingOvers ? "Saving..." : "Save"}
                  </Button>
                </div>
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
      {winnerCelebration && (
        <WinnerCelebrationOverlay
          winnerTeamName={winnerCelebration.winnerTeamName}
          margin={winnerCelebration.margin}
          potmName={winnerCelebration.potmName}
          potmRuns={winnerCelebration.potmRuns}
          potmBalls={winnerCelebration.potmBalls}
          potmWickets={winnerCelebration.potmWickets}
          potmImpact={winnerCelebration.potmImpact}
          onComplete={finalizeMatch}
        />
      )}
      {activeMilestone && (
        <MilestoneCelebration
          milestone={activeMilestone}
          onClose={() => setActiveMilestone(null)}
        />
      )}

      {/* Match Completed Backup Dialog */}
      <Dialog open={showBackupDialog} onOpenChange={(open) => { if (!open) handleNotNowBackup(); }}>
        <DialogContent className="max-w-md bg-gradient-to-b from-slate-900 to-slate-950 border border-primary/20 rounded-3xl p-6 shadow-2xl text-center text-foreground z-[12000]">
          <div className="flex flex-col items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 animate-bounce">
              <Trophy className="h-8 w-8 text-primary" />
            </div>
            
            <h2 className="text-xl font-black tracking-tight text-white uppercase flex items-center gap-1.5 justify-center">
              🏁 MATCH COMPLETED
            </h2>
            
            {backupDialogMetadata && (
              <div className="space-y-2">
                <p className="text-base font-bold text-amber-400">
                  {backupDialogMetadata.winnerTeamName}
                </p>
                <p className="text-sm font-semibold text-white/90">
                  {backupDialogMetadata.margin}
                </p>
              </div>
            )}
            
            <p className="text-xs text-muted-foreground leading-relaxed px-2">
              Save this match backup to your device? This allows you to restore the match even if servers become unavailable.
            </p>
            
            <div className="w-full grid grid-cols-2 gap-3 mt-4">
              <Button
                variant="outline"
                onClick={handleNotNowBackup}
                className="py-5 font-bold uppercase text-xs rounded-xl border-white/10 hover:bg-white/5 active:scale-95 transition-transform"
              >
                ⏰ Not Now
              </Button>
              <Button
                onClick={handleSaveBackup}
                className="py-5 font-black uppercase text-xs rounded-xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:opacity-95 text-slate-950 shadow-lg shadow-orange-500/20 active:scale-95 transition-transform"
              >
                📦 Save Backup
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Floating Undo Banner */}
      {showUndoBanner && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-sm bg-card/95 backdrop-blur border border-border/80 rounded-2xl p-3 flex flex-col gap-2 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-foreground">Ball recorded! Click to undo.</span>
            <Button
              size="sm"
              variant="destructive"
              className="h-7 text-[10px] font-black uppercase tracking-wider rounded-lg px-3 py-1 active:scale-95 cursor-pointer"
              onClick={() => {
                undo();
                setShowUndoBanner(false);
              }}
            >
              Undo ({undoCountdown}s)
            </Button>
          </div>
          <div className="w-full h-1 bg-border/20 rounded-full overflow-hidden">
            <div
              className="bg-primary h-full transition-all duration-1000 ease-linear"
              style={{ width: `${(undoCountdown / 10) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Edit Ball Dialog Modal */}
      <Dialog open={isEditBallOpen} onOpenChange={setIsEditBallOpen}>
        <DialogContent className="max-w-md bg-card border-border/40 text-foreground p-6 rounded-2xl max-h-[95vh] flex flex-col overflow-hidden shadow-2xl">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-primary to-purple-500" />
          
          <DialogHeader className="pb-2">
            <DialogTitle className="text-lg font-black text-primary uppercase tracking-widest flex items-center gap-1.5 leading-none">
              Edit Ball Event
            </DialogTitle>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-1">
              Correct historical match events
            </p>
          </DialogHeader>

          {editingBall && (() => {
            const ballInnings = innings?.find((inn: any) => inn.id === editingBall.innings_id);
            const battingPlayers = ballInnings ? players.filter((p: any) => p.team_id === ballInnings.batting_team_id) : [];
            const bowlingPlayers = ballInnings ? players.filter((p: any) => p.team_id === ballInnings.bowling_team_id) : [];

            return (
              <>
                <div className="space-y-4 my-4 flex-1 overflow-y-auto pr-1 max-h-[calc(90vh-180px)]">
                  <div className="space-y-2">
                    <label className="text-[10px] text-muted-foreground font-black uppercase tracking-wider block">Batter</label>
                    <Select value={editBatterId} onValueChange={setEditBatterId}>
                      <SelectTrigger className="w-full h-10 text-xs border-border bg-card text-foreground">
                        <SelectValue placeholder="Select Batter" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border border-border text-foreground text-xs shadow-md">
                        {battingPlayers.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] text-muted-foreground font-black uppercase tracking-wider block">Bowler</label>
                    <Select value={editBowlerId} onValueChange={setEditBowlerId}>
                      <SelectTrigger className="w-full h-10 text-xs border-border bg-card text-foreground">
                        <SelectValue placeholder="Select Bowler" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border border-border text-foreground text-xs shadow-md">
                        {bowlingPlayers.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] text-muted-foreground font-black uppercase tracking-wider block">Runs (off bat)</label>
                      <Select value={String(editRuns)} onValueChange={(v) => setEditRuns(parseInt(v))}>
                        <SelectTrigger className="w-full h-10 text-xs border-border bg-card text-foreground">
                          <SelectValue placeholder="Runs" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border border-border text-foreground text-xs shadow-md">
                          {["0", "1", "2", "3", "4", "5", "6"].map((r) => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] text-muted-foreground font-black uppercase tracking-wider block">Extra Type</label>
                      <Select value={editExtraType} onValueChange={setEditExtraType}>
                        <SelectTrigger className="w-full h-10 text-xs border-border bg-card text-foreground">
                          <SelectValue placeholder="Extra Type" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border border-border text-foreground text-xs shadow-md">
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="wide">Wide</SelectItem>
                          <SelectItem value="no_ball">No Ball</SelectItem>
                          <SelectItem value="bye">Bye</SelectItem>
                          <SelectItem value="leg_bye">Leg Bye</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {editExtraType !== "none" && (
                    <div className="space-y-2">
                      <label className="text-[10px] text-muted-foreground font-black uppercase tracking-wider block">Extra Runs</label>
                      <Input
                        type="number"
                        min="0"
                        max="10"
                        value={editExtraRuns}
                        onChange={(e) => setEditExtraRuns(parseInt(e.target.value) || 0)}
                        className="w-full h-10 text-xs bg-card border-border text-foreground"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between py-2 border-t border-border/20 mt-2">
                    <span className="text-xs font-semibold text-muted-foreground">Is Wicket?</span>
                    <button
                      type="button"
                      onClick={() => setEditIsWicket(!editIsWicket)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        editIsWicket ? "bg-destructive" : "bg-muted"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          editIsWicket ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {editIsWicket && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="space-y-2">
                        <label className="text-[10px] text-muted-foreground font-black uppercase tracking-wider block">Wicket Type</label>
                        <Select value={editWicketType} onValueChange={setEditWicketType}>
                          <SelectTrigger className="w-full h-10 text-xs border-border bg-card text-foreground">
                            <SelectValue placeholder="Wicket Type" />
                          </SelectTrigger>
                          <SelectContent className="bg-card border border-border text-foreground text-xs shadow-md">
                            <SelectItem value="bowled">Bowled</SelectItem>
                            <SelectItem value="caught">Caught</SelectItem>
                            <SelectItem value="run_out">Run Out</SelectItem>
                            <SelectItem value="lbw">LBW</SelectItem>
                            <SelectItem value="stumped">Stumped</SelectItem>
                            <SelectItem value="hit_wicket">Hit Wicket</SelectItem>
                            <SelectItem value="retired_hurt">Retired Hurt</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {editWicketType === "caught" && (
                        <div className="space-y-2">
                          <label className="text-[10px] text-muted-foreground font-black uppercase tracking-wider block">Caught By</label>
                          <Select value={editCaughtById} onValueChange={setEditCaughtById}>
                            <SelectTrigger className="w-full h-10 text-xs border-border bg-card text-foreground">
                              <SelectValue placeholder="Select Fielder" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border border-border text-foreground text-xs shadow-md">
                              {bowlingPlayers.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <DialogFooter className="flex flex-col sm:flex-row gap-2 border-t border-border/20 pt-4">
                  <div className="flex gap-2 mr-auto">
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleDeleteBall}
                      disabled={isSavingEdit}
                      className="h-9 text-xs font-bold rounded-xl active:scale-95 cursor-pointer"
                    >
                      Delete Ball
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        if (!editingBall) return;
                        setIsSavingEdit(true);
                        try {
                          await ballService.updateBall(editingBall.id, {
                            batter_id: editingBall.batter_id,
                            non_striker_id: editingBall.non_striker_id,
                            bowler_id: editingBall.bowler_id,
                            runs: editingBall.runs,
                            extra_runs: editingBall.extra_runs,
                            extra_type: editingBall.extra_type,
                            is_wicket: editingBall.is_wicket,
                            wicket_type: editingBall.wicket_type,
                            is_legal: editingBall.is_legal,
                            caught_by_id: editingBall.caught_by_id,
                          });
                          toast.success("Recalculation completed");
                          await reload();
                          setIsEditBallOpen(false);
                        } catch (err: any) {
                          toast.error(err.response?.data?.message || err.message || "Recalculation failed");
                        } finally {
                          setIsSavingEdit(false);
                        }
                      }}
                      disabled={isSavingEdit}
                      className="h-9 text-xs font-bold border-primary/20 text-primary hover:bg-primary/10 rounded-xl active:scale-95 cursor-pointer"
                    >
                      Recalculate
                    </Button>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsEditBallOpen(false)}
                      disabled={isSavingEdit}
                      className="h-9 text-xs font-bold rounded-xl cursor-pointer"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={handleSaveEdit}
                      disabled={isSavingEdit}
                      className="h-9 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl active:scale-95 cursor-pointer"
                    >
                      {isSavingEdit ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
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
  disabledOptions?: Record<string, string>;
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
            const disableReason = disabledOptions?.[p.id];
            const isOptDisabled = !!disableReason;
            return (
              <SelectItem key={p.id} value={p.id} disabled={isOptDisabled}>
                {p.name} {isOptDisabled ? ` (${disableReason})` : ""}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
