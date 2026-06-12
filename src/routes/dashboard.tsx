import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { MatchCard, MatchSummary } from "@/components/MatchCard";
import { fetchMatchSummaries } from "@/lib/match";
import { useAuth } from "@/hooks/useAuth";
import { matchService } from "@/lib/services/matchService";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { playerService } from "@/lib/services/playerService";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useState, useEffect, useMemo, useRef } from "react";
import { 
  Trophy, Share2, Award, Zap, Shield, Sparkles, User, 
  ChevronLeft, ChevronRight, Star, Heart, AlertCircle, RotateCcw
} from "lucide-react";

export const Route = createFileRoute("/dashboard")({ component: Dashboard });

interface FloatingReaction {
  id: number;
  emoji: string;
  left: number;
}

function Section({ 
  title, 
  items, 
  isAdmin, 
  onDelete 
}: { 
  title: string; 
  items: MatchSummary[]; 
  isAdmin: boolean; 
  onDelete: (id: string) => void 
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  useEffect(() => {
    if (activeIndex >= items.length) {
      setActiveIndex(0);
    }
  }, [items.length, activeIndex]);

  const next = () => {
    setActiveIndex((prev) => (prev + 1) % items.length);
  };

  const prev = () => {
    setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (touchStartX.current - touchEndX.current > 50) {
      next();
    }
    if (touchStartX.current - touchEndX.current < -50) {
      prev();
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-black uppercase tracking-wider text-muted-foreground px-1">{title} Matches</h2>
      {items.length === 0 ? (
        <Card className="p-6 text-center border-dashed border-2 border-border/80 bg-muted/5 rounded-2xl flex flex-col items-center justify-center gap-1 my-1">
          <p className="text-sm font-medium text-muted-foreground">No {title.toLowerCase()} matches</p>
          <p className="text-xs text-muted-foreground/60">Matches in this category will appear here.</p>
        </Card>
      ) : (
        <div 
          className="relative overflow-hidden w-full touch-pan-y"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div 
            className="flex transition-transform duration-300 ease-out"
            style={{ transform: `translateX(-${activeIndex * 100}%)` }}
          >
            {items.map((m) => (
              <div key={m.id} className="w-full shrink-0 px-0.5">
                <MatchCard m={m} isAdmin={isAdmin} onDelete={onDelete} />
              </div>
            ))}
          </div>

          {items.length > 1 && (
            <>
              <button 
                onClick={prev}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 border border-white/10 text-white/80 p-1.5 rounded-full backdrop-blur-sm shadow z-10 transition-all active:scale-95 cursor-pointer"
                aria-label="Previous Match"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button 
                onClick={next}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 border border-white/10 text-white/80 p-1.5 rounded-full backdrop-blur-sm shadow z-10 transition-all active:scale-95 cursor-pointer"
                aria-label="Next Match"
              >
                <ChevronRight className="h-4 w-4" />
              </button>

              <div className="flex justify-center gap-1.5 mt-3">
                {items.map((_, idx) => (
                  <span 
                    key={idx}
                    onClick={() => setActiveIndex(idx)}
                    className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                      idx === activeIndex ? "w-4 bg-orange-500" : "w-1.5 bg-muted-foreground/30"
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function CanvasConfetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;
    let animationFrameId: number;

    const colors = ["#f97316", "#fb923c", "#f59e0b", "#3b82f6", "#ec4899"];
    
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

function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="p-5 border border-destructive/20 bg-destructive/5 rounded-2xl flex flex-col items-center justify-center gap-2 text-center my-1 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-destructive">
        <AlertCircle className="h-4 w-4" />
        <span className="text-xs font-black uppercase tracking-widest">Load Error</span>
      </div>
      <p className="text-[11px] text-muted-foreground max-w-xs">{message}</p>
      <Button 
        size="sm" 
        variant="outline" 
        className="mt-1 h-8 text-xs font-bold gap-1 border-destructive/30 text-destructive hover:bg-destructive/10 cursor-pointer" 
        onClick={onRetry}
      >
        <RotateCcw className="h-3 w-3" /> Retry
      </Button>
    </Card>
  );
}

function SectionSkeleton({ heightClass = "h-24" }: { heightClass?: string }) {
  return (
    <Card className={`p-4 border border-border/40 bg-card rounded-2xl animate-pulse flex items-center justify-between ${heightClass}`}>
      <div className="flex items-center gap-3 w-2/3">
        <div className="h-10 w-10 rounded-full bg-muted shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 bg-muted rounded w-3/4" />
          <div className="h-2.5 bg-muted rounded w-1/2" />
        </div>
      </div>
      <div className="h-6 w-12 bg-muted rounded w-12 shrink-0" />
    </Card>
  );
}

function Dashboard() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading: isLoadingMatches, isError: isErrorMatches, refetch: refetchMatches } = useQuery({
    queryKey: ["matches"],
    queryFn: fetchMatchSummaries,
    retry: 1,
  });
  
  const { data: motd, isLoading: isLoadingMotd, isError: isErrorMotd, refetch: refetchMotd } = useQuery({
    queryKey: ["manOfTheDay"],
    queryFn: () => playerService.getManOfTheDay(),
    retry: 1,
  });

  const { data: rankings, isLoading: isLoadingRankings, isError: isErrorRankings, refetch: refetchRankings } = useQuery({
    queryKey: ["playerRankings"],
    queryFn: () => playerService.getPlayerRankings(),
    retry: 1,
  });

  const items = data ?? [];
  const live = items.filter((m) => m.status === "live");
  const past = items.filter((m) => m.status === "past");

  const [heroData, setHeroData] = useState<any[]>([]);
  const [loadingHeroes, setLoadingHeroes] = useState(false);
  const [heroesError, setHeroesError] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [showConfetti, setShowConfetti] = useState(false);
  const [shareCard, setShareCard] = useState<any | null>(null);

  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  // Aggregation helper logic for CricLab Heroes
  const getBaseAppreciation = (playerId: string, heroType: string) => {
    const countKey = `criclab_appreciation_count_${heroType}_${playerId}`;
    const stored = localStorage.getItem(countKey);
    if (stored) return parseInt(stored);

    const hash = (playerId + heroType).split("").reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
    return 80 + (hash % 70); 
  };

  const computeHeroCards = (details: any[]) => {
    const allBatting: any[] = [];
    const allBowling: any[] = [];
    const allFielding: any[] = [];
    const playerWeeklyStats: Record<string, {
      player: any;
      runs: number;
      wickets: number;
      mvpAwards: number;
    }> = {};

    details.forEach((det) => {
      const { m, balls, players, teams } = det;
      const teamName = (tid: string) => teams.find((t: any) => t.id === tid)?.name ?? "—";

      players.forEach((p: any) => {
        const pBalls = balls.filter((b: any) => b.batter_id === p.id);
        const runs = pBalls.reduce((sum: number, b: any) => b.extra_type === "wide" ? sum : sum + (b.runs ?? 0), 0);
        const ballsFaced = pBalls.filter((b: any) => b.extra_type !== "wide").length;
        const sixes = pBalls.filter((b: any) => b.runs === 6 && b.extra_type !== "wide").length;
        const fours = pBalls.filter((b: any) => b.runs === 4 && b.extra_type !== "wide").length;
        const sr = ballsFaced > 0 ? (runs / ballsFaced) * 100 : 0;

        const bowlBalls = balls.filter((b: any) => b.bowler_id === p.id);
        const wickets = bowlBalls.filter(
          (b: any) => b.is_wicket && b.wicket_type !== "run_out" && b.wicket_type !== "retired_hurt"
        ).length;
        const runsConceded = bowlBalls.reduce((sum: number, b: any) => {
          if (b.extra_type === "bye" || b.extra_type === "leg_bye") return sum;
          return sum + (b.runs ?? 0) + (b.extra_runs ?? 0);
        }, 0);
        const legalBallsBowled = bowlBalls.filter((b: any) => b.is_legal).length;
        const econ = legalBallsBowled > 0 ? (runsConceded / legalBallsBowled) * 6 : 0;

        const catches = balls.filter(
          (b: any) => b.is_wicket && b.wicket_type === "caught" && b.caught_by_id === p.id
        ).length;
        const runOuts = balls.filter(
          (b: any) => b.is_wicket && b.wicket_type === "run_out" && b.caught_by_id === p.id
        ).length;

        // CricLab Impact Score
        let impactScore = runs * 1.0 + sixes * 2.0 + fours * 1.0;
        if (ballsFaced > 0 && runs >= 10) impactScore += (sr / 10);
        impactScore += wickets * 25.0;
        if (legalBallsBowled > 0 && econ < 8) impactScore += (8 - econ) * 5;
        impactScore += catches * 10.0 + runOuts * 10.0;
        impactScore = Math.round(Math.min(100, Math.max(0, impactScore)));

        const playerTeamId = p.team_id;

        if (runs > 0 || ballsFaced > 0) {
          allBatting.push({
            player: p,
            runs,
            ballsFaced,
            sixes,
            fours,
            sr,
            impactScore,
            matchOutcome: m.result || "Match completed",
            wickets,
            teamName: teamName(playerTeamId)
          });
        }

        if (legalBallsBowled > 0) {
          allBowling.push({
            player: p,
            wickets,
            runsConceded,
            overs: `${Math.floor(legalBallsBowled / 6)}.${legalBallsBowled % 6}`,
            econ,
            impactScore,
            teamName: teamName(playerTeamId)
          });
        }

        if (catches > 0 || runOuts > 0) {
          allFielding.push({
            player: p,
            catches,
            runOuts,
            impactScore,
            teamName: teamName(playerTeamId)
          });
        }

        if (!playerWeeklyStats[p.id]) {
          playerWeeklyStats[p.id] = { player: p, runs: 0, wickets: 0, mvpAwards: 0 };
        }
        playerWeeklyStats[p.id].runs += runs;
        playerWeeklyStats[p.id].wickets += wickets;
      });

      // Find POTM for this match
      let bestImpact = -1;
      let potmPlayerId = "";
      players.forEach((p: any) => {
        const pBalls = balls.filter((b: any) => b.batter_id === p.id);
        const runs = pBalls.reduce((sum: number, b: any) => b.extra_type === "wide" ? sum : sum + (b.runs ?? 0), 0);
        const ballsFaced = pBalls.filter((b: any) => b.extra_type !== "wide").length;
        const sixes = pBalls.filter((b: any) => b.runs === 6 && b.extra_type !== "wide").length;
        const fours = pBalls.filter((b: any) => b.runs === 4 && b.extra_type !== "wide").length;
        const sr = ballsFaced > 0 ? (runs / ballsFaced) * 100 : 0;

        const bowlBalls = balls.filter((b: any) => b.bowler_id === p.id);
        const wickets = bowlBalls.filter((b: any) => b.is_wicket && b.wicket_type !== "run_out" && b.wicket_type !== "retired_hurt").length;
        const runsConceded = bowlBalls.reduce((sum: number, b: any) => {
          if (b.extra_type === "bye" || b.extra_type === "leg_bye") return sum;
          return sum + (b.runs ?? 0) + (b.extra_runs ?? 0);
        }, 0);
        const legalBallsBowled = bowlBalls.filter((b: any) => b.is_legal).length;
        const econ = legalBallsBowled > 0 ? (runsConceded / legalBallsBowled) * 6 : 0;
        const catches = balls.filter((b: any) => b.is_wicket && b.wicket_type === "caught" && b.caught_by_id === p.id).length;
        const runOuts = balls.filter((b: any) => b.is_wicket && b.wicket_type === "run_out" && b.caught_by_id === p.id).length;

        let imp = runs * 1.0 + sixes * 2.0 + fours * 1.0;
        if (ballsFaced > 0 && runs >= 10) imp += (sr / 10);
        imp += wickets * 25.0;
        if (legalBallsBowled > 0 && econ < 8) imp += (8 - econ) * 5;
        imp += catches * 10.0 + runOuts * 10.0;

        if (imp > bestImpact) {
          bestImpact = imp;
          potmPlayerId = p.id;
        }
      });

      if (potmPlayerId && playerWeeklyStats[potmPlayerId]) {
        playerWeeklyStats[potmPlayerId].mvpAwards += 1;
      }
    });

    const cards: any[] = [];

    // Card 1: Match Hero
    const sortedBatting = [...allBatting].sort((a, b) => b.impactScore - a.impactScore);
    const matchHero = sortedBatting[0];
    if (matchHero) {
      cards.push({
        type: "match_hero",
        badge: "🏆 MATCH HERO",
        playerName: matchHero.player.name,
        avatar: matchHero.player.avatar,
        teamName: matchHero.teamName,
        label1: "SCORE",
        value1: `${matchHero.runs} (${matchHero.ballsFaced})`,
        label2: "STRIKE RATE",
        value2: `${matchHero.sr.toFixed(1)}`,
        extraStat: matchHero.wickets > 0 ? `${matchHero.wickets} Wicket${matchHero.wickets > 1 ? "s" : ""}` : "",
        matchResult: matchHero.matchOutcome,
        impactScore: matchHero.impactScore,
        story: `🔥 ${matchHero.player.name} changed the game with a quick-fire ${matchHero.runs} off ${matchHero.ballsFaced} balls ${matchHero.wickets > 0 ? `and picked up ${matchHero.wickets} wicket${matchHero.wickets > 1 ? "s" : ""}` : ""}, helping their team put up an outstanding performance!`,
        playerId: matchHero.player.id,
      });
    }

    // Card 2: Best Bowler
    const sortedBowling = [...allBowling].sort((a, b) => b.wickets !== a.wickets ? b.wickets - a.wickets : a.econ - b.econ);
    const bestBowler = sortedBowling[0];
    if (bestBowler && bestBowler.wickets > 0) {
      cards.push({
        type: "best_bowler",
        badge: "🎯 WICKET HUNTER",
        playerName: bestBowler.player.name,
        avatar: bestBowler.player.avatar,
        teamName: bestBowler.teamName,
        label1: "SPELL",
        value1: `${bestBowler.wickets}/${bestBowler.runsConceded}`,
        label2: "ECONOMY",
        value2: `${bestBowler.econ.toFixed(1)}`,
        impactScore: bestBowler.impactScore,
        story: `🎯 ${bestBowler.player.name} dismantled the opposition batting lineup with an extraordinary spell of ${bestBowler.wickets} wickets for just ${bestBowler.runsConceded} runs at an economy of ${bestBowler.econ.toFixed(1)}!`,
        playerId: bestBowler.player.id,
      });
    }

    // Card 3: Power Hitter
    const sortedHitter = [...allBatting].sort((a, b) => b.sixes !== a.sixes ? b.sixes - a.sixes : b.sr - a.sr);
    const powerHitter = sortedHitter[0];
    if (powerHitter && (powerHitter.sixes > 0 || powerHitter.sr >= 150)) {
      cards.push({
        type: "power_hitter",
        badge: "🔥 POWER HITTER",
        playerName: powerHitter.player.name,
        avatar: powerHitter.player.avatar,
        teamName: powerHitter.teamName,
        label1: "SCORE",
        value1: `${powerHitter.runs} (${powerHitter.ballsFaced})`,
        label2: "BOUNDARIES",
        value2: `${powerHitter.sixes} Sixes · SR ${powerHitter.sr.toFixed(1)}`,
        impactScore: powerHitter.impactScore,
        story: `⚡ ${powerHitter.player.name} put on a batting masterclass, raining boundaries and clearing the boundary ropes ${powerHitter.sixes} times at an explosive strike rate of ${powerHitter.sr.toFixed(1)}!`,
        playerId: powerHitter.player.id,
      });
    }

    // Card 4: Best Fielder
    const sortedFielder = [...allFielding].sort((a, b) => (b.catches + b.runOuts) - (a.catches + a.runOuts));
    const bestFielder = sortedFielder[0];
    if (bestFielder && (bestFielder.catches > 0 || bestFielder.runOuts > 0)) {
      const statsStr = [
        bestFielder.catches > 0 ? `${bestFielder.catches} C` : "",
        bestFielder.runOuts > 0 ? `${bestFielder.runOuts} RO` : ""
      ].filter(Boolean).join(" · ");

      cards.push({
        type: "best_fielder",
        badge: "🛡 GAME CHANGER",
        playerName: bestFielder.player.name,
        avatar: bestFielder.player.avatar,
        teamName: bestFielder.teamName,
        label1: "FIELDING",
        value1: statsStr,
        label2: "IMPACT",
        value2: `${bestFielder.impactScore}`,
        impactScore: bestFielder.impactScore,
        story: `🛡 ${bestFielder.player.name} was electric on the field, pulling off crucial intercepts, taking ${bestFielder.catches} grab${bestFielder.catches !== 1 ? "s" : ""} and turning the tide with brilliant fielding!`,
        playerId: bestFielder.player.id,
      });
    }

    // Card 5: Player Of The Week
    const sortedWeekly = Object.values(playerWeeklyStats).sort((a, b) => (b.runs + b.wickets * 25) - (a.runs + a.wickets * 25));
    const weeklyHero = sortedWeekly[0];
    if (weeklyHero) {
      const hash = weeklyHero.player.id.split("").reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
      const followers = 120 + (hash % 150);

      cards.push({
        type: "player_of_the_week",
        badge: "👑 PLAYER OF THE WEEK",
        playerName: weeklyHero.player.name,
        avatar: weeklyHero.player.avatar,
        teamName: weeklyHero.player.team?.name || "CricLab Hero",
        label1: "STATS",
        value1: `Runs: ${weeklyHero.runs} · Wkts: ${weeklyHero.wickets}`,
        label2: "MVP AWARDS",
        value2: `${weeklyHero.mvpAwards} POTM`,
        impactScore: Math.round(Math.min(100, Math.max(65, (weeklyHero.runs * 0.5 + weeklyHero.wickets * 12.5)))),
        story: `👑 With a magnificent run of form, ${weeklyHero.player.name} has dominated the week, amassing ${weeklyHero.runs} runs and taking ${weeklyHero.wickets} wickets to earn the crown of Player of the Week!`,
        playerId: weeklyHero.player.id,
      });
    }

    // Map each card to contain its userAppreciated status and count
    return cards.map((c) => {
      const appKey = `criclab_appreciated_${c.type}_${c.playerId}`;
      return {
        ...c,
        userAppreciated: !!localStorage.getItem(appKey),
        appreciationCount: getBaseAppreciation(c.playerId, c.type),
      };
    });
  };

  const fetchHeroes = async () => {
    if (past.length < 3) return;
    try {
      setLoadingHeroes(true);
      setHeroesError(false);
      const latest3 = past.slice(0, 3);
      const matchDetails = await Promise.all(
        latest3.map((m) => matchService.getMatch(m.id))
      );
      const cards = computeHeroCards(matchDetails);
      setHeroData(cards);
    } catch (e) {
      console.error("Failed to load hero data", e);
      setHeroesError(true);
    } finally {
      setLoadingHeroes(false);
    }
  };

  useEffect(() => {
    if (past.length >= 3) {
      fetchHeroes();
    }
  }, [past.length]);

  // Slide Controls
  const nextSlide = () => {
    setHeroData((prev) => {
      if (prev.length > 0) {
        setCurrentIndex((curr) => (curr + 1) % prev.length);
      }
      return prev;
    });
  };

  const prevSlide = () => {
    setHeroData((prev) => {
      if (prev.length > 0) {
        setCurrentIndex((curr) => (curr - 1 + prev.length) % prev.length);
      }
      return prev;
    });
  };

  useEffect(() => {
    if (heroData.length > 1) {
      const interval = setInterval(() => {
        nextSlide();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [heroData.length]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (touchStartX.current - touchEndX.current > 75) {
      nextSlide();
    }
    if (touchStartX.current - touchEndX.current < -75) {
      prevSlide();
    }
  };

  const handleAppreciate = (heroType: string, playerId: string, playerName: string, storyText: string) => {
    const appKey = `criclab_appreciated_${heroType}_${playerId}`;
    if (localStorage.getItem(appKey)) {
      toast.error("You have already appreciated this performance!");
      return;
    }

    localStorage.setItem(appKey, "true");
    const countKey = `criclab_appreciation_count_${heroType}_${playerId}`;
    const baseCount = getBaseAppreciation(playerId, heroType);
    localStorage.setItem(countKey, String(baseCount + 1));

    setHeroData((prev) =>
      prev.map((h) => {
        if (h.type === heroType && h.playerId === playerId) {
          return { ...h, userAppreciated: true, appreciationCount: baseCount + 1 };
        }
        return h;
      })
    );

    if (navigator.vibrate) {
      navigator.vibrate([80, 50, 80]);
    }

    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 3000);

    const rects: FloatingReaction[] = [];
    const emojis = ["👏", "🔥", "❤️", "🙌", "✨"];
    for (let i = 0; i < 8; i++) {
      rects.push({
        id: Date.now() + i + Math.random(),
        emoji: emojis[Math.floor(Math.random() * emojis.length)],
        left: 20 + Math.random() * 60,
      });
    }
    setReactions((prev) => [...prev, ...rects]);
    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => !rects.find((nr) => nr.id === r.id)));
    }, 1500);

    toast.success(`👏 You appreciated ${playerName}!`);

    setTimeout(() => {
      toast(`🎉 Great Performance!`, {
        description: `${baseCount + 1} players appreciated your performance: "${storyText.slice(2)}"`,
        duration: 5000,
      });
    }, 2000);
  };

  const executeShare = (platform: "whatsapp" | "instagram" | "telegram") => {
    if (!shareCard) return;
    const shareText = `🏆 ${shareCard.badge}: ${shareCard.playerName} (${shareCard.label1}: ${shareCard.value1} | ${shareCard.label2}: ${shareCard.value2}) with an Impact Score of ${shareCard.impactScore}/100! Powered by CricLab.`;
    
    let url = "";
    if (platform === "whatsapp") {
      url = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    } else if (platform === "telegram") {
      url = `https://t.me/share/url?url=${encodeURIComponent("https://criclab.app")}&text=${encodeURIComponent(shareText)}`;
    } else if (platform === "instagram") {
      if (navigator.share) {
        navigator.share({
          title: shareCard.badge,
          text: shareText,
          url: "https://criclab.app"
        }).catch(() => {});
        return;
      }
      url = `https://www.instagram.com/`;
      toast.info("Opening Instagram. Post this stats achievement to your Story!");
    }

    if (url) {
      window.open(url, "_blank");
    }
    setShareCard(null);
  };

  const triggerShare = (hero: any) => {
    setShareCard({
      ...hero,
      statLine1: `${hero.label1}: ${hero.value1}`
    });
  };

  const onDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this match? This will clear the match and its player stats, but the player records/profiles themselves will NOT be deleted.")) return;
    try {
      await matchService.deleteMatch(id);
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["matches"] });
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    }
  };

  const currentHero = heroData[currentIndex];

  return (
    <AppShell>
      <div className="space-y-6 max-w-md mx-auto">
        {/* Man of the Day Section */}
        {isLoadingMotd ? (
          <SectionSkeleton />
        ) : isErrorMotd ? (
          <SectionError message="Failed to load Man of the Day stats." onRetry={refetchMotd} />
        ) : motd && motd.player ? (
          <Card className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-purple-500/10 border border-amber-500/25 shadow-md relative overflow-hidden backdrop-blur-sm">
            <div className="absolute -top-3 -right-3 w-16 h-16 bg-amber-500/15 rounded-full blur-xl pointer-events-none" />
            
            <div className="flex items-center justify-between mb-3">
              <span className="bg-amber-500/25 border border-amber-500/40 text-amber-500 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm leading-none">
                <Sparkles className="h-3 w-3 animate-pulse" />
                Man of the Day
              </span>
              {motd.timeframe && (
                <span className="text-[9px] font-extrabold text-muted-foreground bg-muted/60 border border-border/40 px-2 py-0.5 rounded-md leading-none">
                  {motd.timeframe}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3.5">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border border-amber-400 p-0.5 bg-card shadow-sm overflow-hidden flex items-center justify-center shrink-0">
                  {motd.player.avatar ? (
                    <img src={motd.player.avatar} alt={motd.player.name} className="w-full h-full object-cover rounded-full" />
                  ) : (
                    <span className="text-amber-500 font-extrabold text-sm">
                      {motd.player.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <span className="absolute -bottom-1 -right-1 bg-amber-500 text-[10px] p-0.5 rounded-full border border-card shadow-sm leading-none">
                  👑
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-extrabold text-sm text-foreground truncate hover:text-primary transition-colors">
                  <Link to="/players/$id" params={{ id: motd.player.id }}>
                    {motd.player.name}
                  </Link>
                </h3>
                <p className="text-[10px] text-muted-foreground mt-0.5 font-semibold">
                  {motd.player.team?.name || "No Team Assigned"}
                </p>
                
                <div className="flex gap-3 mt-1.5 text-xs text-muted-foreground font-semibold">
                  {motd.stats && motd.stats.runs > 0 && (
                    <div>
                      Runs: <span className="font-bold text-foreground">{motd.stats.runs}</span>
                    </div>
                  )}
                  {motd.stats && motd.stats.wickets > 0 && (
                    <div>
                      Wkts: <span className="font-bold text-foreground">{motd.stats.wickets}</span>
                    </div>
                  )}
                  {motd.stats && motd.stats.catches > 0 && (
                    <div>
                      Ctch: <span className="font-bold text-foreground">{motd.stats.catches}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="text-[9px] text-muted-foreground uppercase font-black tracking-wider block leading-none">MVP score</span>
                <span className="text-2xl font-black text-amber-500 block mt-1 leading-none">{motd.stats?.mvp || 0}</span>
              </div>
            </div>
          </Card>
        ) : null}

        {/* 👑 CricLab Heroes Section */}
        <section className="space-y-3 relative">
          <h2 className="text-xs font-black uppercase tracking-widest text-amber-500 flex items-center gap-1.5 px-1">
            <Sparkles className="h-4 w-4 text-orange-500 animate-pulse" /> 👑 CricLab Heroes
          </h2>

          {isLoadingMatches ? (
            <SectionSkeleton heightClass="h-48" />
          ) : isErrorMatches ? (
            <SectionError message="Failed to load matches for Heroes." onRetry={refetchMatches} />
          ) : loadingHeroes ? (
            <SectionSkeleton heightClass="h-48" />
          ) : heroesError ? (
            <SectionError message="Failed to load CricLab Heroes." onRetry={fetchHeroes} />
          ) : past.length < 3 ? (
            <Card className="p-6 text-center border border-amber-500/20 bg-card dark:bg-slate-900/60 backdrop-blur-md rounded-2xl shadow-[0_0_15px_rgba(245,158,11,0.05)] relative overflow-hidden my-1">
              <div className="absolute -top-10 -left-10 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
              <span className="text-3xl block mb-2 animate-bounce">🏏</span>
              <h3 className="text-sm font-black text-amber-500 uppercase tracking-widest mb-1.5">Become a CricLab Hero!</h3>
              <p className="text-xs text-muted-foreground/80 max-w-xs mx-auto leading-relaxed">
                Play and complete at least 3 matches to unlock your players' stats in the premium Heroes Showcase!
              </p>
              <Link to="/matches/new" className="inline-block mt-4">
                <Button size="sm" className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-[11px] uppercase tracking-wider px-5 py-2.5 rounded-xl shadow-lg shadow-orange-500/20 active:scale-97 transition-all cursor-pointer">
                  Create Match
                </Button>
              </Link>
            </Card>
          ) : heroData.length > 0 && currentHero ? (
            <div 
              className="relative overflow-hidden touch-pan-y"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <Card 
                className={`p-5 rounded-2xl bg-card dark:bg-gradient-to-br dark:from-slate-900/80 dark:via-slate-950/90 dark:to-slate-900/80 border transition-all duration-500 ${
                  currentHero.userAppreciated 
                    ? "border-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.3)] scale-[1.01]" 
                    : "border-orange-500/30 shadow-[0_0_15px_rgba(249,115,22,0.1)]"
                }`}
              >
                {/* Glowing effect inside */}
                <div className="absolute top-[-40px] right-[-40px] w-32 h-32 bg-orange-500/10 rounded-full blur-2xl pointer-events-none" />

                {/* Header Badge & Impact Score */}
                <div className="flex justify-between items-start mb-4">
                  <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded bg-orange-500/20 border border-orange-500/40 text-orange-500">
                    {currentHero.badge}
                  </span>
                  <div className="text-right">
                    <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest block leading-none">Impact Score</span>
                    <span className="text-lg font-black text-orange-500 block leading-none mt-1">
                      {currentHero.impactScore}/100
                    </span>
                  </div>
                </div>

                {/* Player & Team Info */}
                <div className="flex items-center gap-3.5 mb-4">
                  <div className="h-14 w-14 rounded-full border border-orange-500/50 p-0.5 overflow-hidden bg-muted flex items-center justify-center shrink-0 shadow">
                    {currentHero.avatar ? (
                      <img src={currentHero.avatar} alt={currentHero.playerName} className="h-full w-full object-cover rounded-full" />
                    ) : (
                      <span className="font-extrabold text-orange-500 text-lg">
                        {currentHero.playerName.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-black text-base text-foreground truncate hover:text-orange-500 transition-colors">
                      <Link to="/players/$id" params={{ id: currentHero.playerId }}>
                        {currentHero.playerName}
                      </Link>
                    </h3>
                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-wider mt-0.5">
                      {currentHero.teamName}
                    </p>
                  </div>
                </div>

                {/* Highlight Stats */}
                <div className="bg-muted/40 rounded-xl border border-border/20 p-3 mb-4 grid grid-cols-2 gap-3 text-center">
                  <div className="min-w-0">
                    <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest block leading-none truncate">
                      {currentHero.label1}
                    </span>
                    <span className="text-xs font-black text-foreground block mt-1.5 leading-none truncate">
                      {currentHero.value1}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest block leading-none truncate">
                      {currentHero.label2}
                    </span>
                    <span className="text-xs font-black text-orange-500 block mt-1.5 leading-none truncate">
                      {currentHero.value2}
                    </span>
                  </div>
                </div>

                {/* Dynamic Match Result Result */}
                {currentHero.matchResult && (
                  <p className="text-[10px] font-black text-amber-500/95 uppercase tracking-wide mb-3 px-1">
                    🏆 {currentHero.matchResult}
                  </p>
                )}

                {/* AI Story */}
                <p className="text-xs text-muted-foreground leading-relaxed italic mb-4 bg-muted/20 border-l-2 border-orange-500/40 p-2.5 rounded-r-lg">
                  {currentHero.story}
                </p>

                {/* Social Counters */}
                <div className="flex justify-between items-center text-[10px] font-black text-muted-foreground/80 mb-4 px-1">
                  <span className="flex items-center gap-1">
                    <Heart className="h-3 w-3 text-orange-500 fill-orange-500" />
                    {currentHero.appreciationCount} Appreciations
                  </span>
                  <span>Powered by CricLab</span>
                </div>

                {/* Actions Bar */}
                <div className="flex gap-2">
                  <Button 
                    variant="outline"
                    className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2 px-3 rounded-xl border transition-all active:scale-97 cursor-pointer ${
                      currentHero.userAppreciated
                        ? "bg-orange-500/10 border-orange-500 text-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.15)]"
                        : "border-border hover:bg-muted text-foreground"
                    }`}
                    onClick={() => handleAppreciate(currentHero.type, currentHero.playerId, currentHero.playerName, currentHero.story)}
                  >
                    <span>👏</span> Appreciate{currentHero.userAppreciated && "d"}
                  </Button>
                  
                  <Button 
                    variant="outline"
                    className="flex items-center justify-center gap-1.5 text-xs font-bold py-2 px-3 rounded-xl border border-border hover:bg-muted text-foreground shrink-0 cursor-pointer"
                    onClick={() => triggerShare(currentHero)}
                  >
                    <Share2 className="h-3.5 w-3.5" /> Share
                  </Button>
                </div>
              </Card>

              {/* Left/Right Carousel Controls */}
              <button 
                onClick={prevSlide}
                className="absolute left-1.5 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 border border-white/10 text-white/80 p-1.5 rounded-full backdrop-blur-sm shadow z-10 hover:text-white"
                aria-label="Previous Hero"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button 
                onClick={nextSlide}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 border border-white/10 text-white/80 p-1.5 rounded-full backdrop-blur-sm shadow z-10 hover:text-white"
                aria-label="Next Hero"
              >
                <ChevronRight className="h-4 w-4" />
              </button>

              {/* Dots indicator */}
              <div className="flex justify-center gap-1.5 mt-3">
                {heroData.map((_, idx) => (
                  <span 
                    key={idx}
                    onClick={() => setCurrentIndex(idx)}
                    className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                      idx === currentIndex ? "w-4 bg-orange-500" : "w-1.5 bg-muted-foreground/30"
                    }`}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </section>

        {/* Live Section */}
        {isLoadingMatches ? (
          <SectionSkeleton heightClass="h-28" />
        ) : isErrorMatches ? (
          <SectionError message="Failed to load Live matches." onRetry={refetchMatches} />
        ) : (
          <Section title="Live" items={live} isAdmin={role === "admin"} onDelete={onDelete} />
        )}

        {/* 🌟 Stars of the Month Section */}
        <section className="space-y-3 mt-4">
          <h2 className="text-xs font-black uppercase tracking-widest text-amber-500 flex items-center gap-1.5 px-1">
            <Star className="h-4 w-4 text-amber-500 fill-amber-500 animate-pulse" /> Stars Of The Month
          </h2>
          
          {isLoadingRankings ? (
            <div className="space-y-2.5">
              <SectionSkeleton heightClass="h-16" />
              <SectionSkeleton heightClass="h-16" />
              <SectionSkeleton heightClass="h-16" />
            </div>
          ) : isErrorRankings ? (
            <SectionError message="Failed to load Stars Of The Month rankings." onRetry={refetchRankings} />
          ) : rankings ? (
            <div className="grid grid-cols-1 gap-2.5">
              {rankings.mvp?.[0] && (
                <Card className="p-3 border border-amber-500/25 bg-card dark:bg-slate-950/40 backdrop-blur-sm rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl shrink-0">🥇</span>
                    <div className="h-10 w-10 rounded-full border border-amber-400 p-0.5 overflow-hidden bg-muted flex items-center justify-center shrink-0">
                      {rankings.mvp[0].avatar ? (
                        <img src={rankings.mvp[0].avatar} alt={rankings.mvp[0].name} className="h-full w-full object-cover rounded-full" />
                      ) : (
                        <span className="font-bold text-amber-500 text-xs">
                          {rankings.mvp[0].name.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-black text-foreground truncate">{rankings.mvp[0].name}</h4>
                      <p className="text-[9px] text-muted-foreground uppercase font-extrabold tracking-wider truncate">
                        {rankings.mvp[0].team_name || "Superstar"}
                      </p>
                      <div className="flex gap-2.5 mt-0.5 text-[9px] text-muted-foreground font-extrabold">
                        <span>Runs: {rankings.mvp[0].runs}</span>
                        <span>Wkts: {rankings.mvp[0].wickets}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[8px] text-muted-foreground uppercase font-black tracking-widest block leading-none">MVP Score</span>
                    <span className="text-base font-black text-amber-500 block mt-0.5 leading-none">{rankings.mvp[0].mvp}</span>
                  </div>
                </Card>
              )}

              {rankings.batters?.[0] && (
                <Card className="p-3 border border-border/40 bg-card dark:bg-slate-950/40 backdrop-blur-sm rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl shrink-0">🥈</span>
                    <div className="h-10 w-10 rounded-full border border-border p-0.5 overflow-hidden bg-muted flex items-center justify-center shrink-0">
                      {rankings.batters[0].avatar ? (
                        <img src={rankings.batters[0].avatar} alt={rankings.batters[0].name} className="h-full w-full object-cover rounded-full" />
                      ) : (
                        <span className="font-bold text-primary text-xs">
                          {rankings.batters[0].name.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-black text-foreground truncate">{rankings.batters[0].name}</h4>
                      <p className="text-[9px] text-muted-foreground uppercase font-extrabold tracking-wider truncate">
                        {rankings.batters[0].team_name || "Best Batter"}
                      </p>
                      <div className="flex gap-2.5 mt-0.5 text-[9px] text-muted-foreground font-extrabold">
                        <span>S/R: {rankings.batters[0].sr}</span>
                        <span>Sixes: {rankings.batters[0].sixes}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[8px] text-muted-foreground uppercase font-black tracking-widest block leading-none">Total Runs</span>
                    <span className="text-base font-black text-primary block mt-0.5 leading-none">{rankings.batters[0].runs}</span>
                  </div>
                </Card>
              )}

              {rankings.bowlers?.[0] && (
                <Card className="p-3 border border-border/40 bg-card dark:bg-slate-950/40 backdrop-blur-sm rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl shrink-0">🥉</span>
                    <div className="h-10 w-10 rounded-full border border-border p-0.5 overflow-hidden bg-muted flex items-center justify-center shrink-0">
                      {rankings.bowlers[0].avatar ? (
                        <img src={rankings.bowlers[0].avatar} alt={rankings.bowlers[0].name} className="h-full w-full object-cover rounded-full" />
                      ) : (
                        <span className="font-bold text-purple-400 text-xs">
                          {rankings.bowlers[0].name.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-black text-foreground truncate">{rankings.bowlers[0].name}</h4>
                      <p className="text-[9px] text-muted-foreground uppercase font-extrabold tracking-wider truncate">
                        {rankings.bowlers[0].team_name || "Best Bowler"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[8px] text-muted-foreground uppercase font-black tracking-widest block leading-none">Wickets</span>
                    <span className="text-base font-black text-purple-400 block mt-0.5 leading-none">{rankings.bowlers[0].wickets}</span>
                  </div>
                </Card>
              )}
            </div>
          ) : null}
        </section>

        {/* Past Section */}
        {isLoadingMatches ? (
          <SectionSkeleton heightClass="h-28" />
        ) : isErrorMatches ? (
          <SectionError message="Failed to load Past matches." onRetry={refetchMatches} />
        ) : (
          <Section title="Past" items={past} isAdmin={role === "admin"} onDelete={onDelete} />
        )}
      </div>

      {/* Floating Reaction Emojis overlay */}
      <div className="fixed inset-0 pointer-events-none z-[99999] overflow-hidden">
        {reactions.map((r) => (
          <div
            key={r.id}
            className="absolute bottom-10 text-3xl opacity-0"
            style={{
              left: `${r.left}%`,
              animation: "floatUp 1.5s ease-out forwards"
            }}
          >
            {r.emoji}
          </div>
        ))}
      </div>

      {/* Confetti canvas overlay */}
      {showConfetti && <CanvasConfetti />}

      {/* Share Modal Dialog */}
      <Dialog open={!!shareCard} onOpenChange={(open) => !open && setShareCard(null)}>
        <DialogContent className="max-w-xs rounded-2xl bg-card border border-border text-foreground p-5">
          <DialogHeader className="items-center">
            <DialogTitle className="text-sm font-black text-orange-500 uppercase tracking-widest">
              Share Achievement
            </DialogTitle>
          </DialogHeader>
          
          {shareCard && (
            <div className="my-4 text-center p-4 bg-muted/40 border border-border/60 rounded-xl">
              <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 bg-orange-500/20 border border-orange-500/40 text-orange-500 rounded">
                {shareCard.badge}
              </span>
              <h4 className="font-black text-sm text-foreground mt-3">{shareCard.playerName}</h4>
              <p className="text-[10px] text-muted-foreground font-bold uppercase mt-0.5">{shareCard.teamName}</p>
              <div className="bg-muted/70 p-2.5 rounded-lg border border-border/40 my-3 text-xs flex justify-around">
                <div>
                  <span className="text-[8px] text-muted-foreground block uppercase font-bold">Stats</span>
                  <span className="font-extrabold text-foreground">{shareCard.statLine1}</span>
                </div>
                <div>
                  <span className="text-[8px] text-muted-foreground block uppercase font-bold">Impact</span>
                  <span className="font-extrabold text-orange-500">{shareCard.impactScore}</span>
                </div>
              </div>
              <p className="text-[9px] text-muted-foreground font-black uppercase tracking-widest mt-1">
                Powered by CricLab
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Button 
              className="w-full bg-[#25D366] hover:bg-[#20ba59] text-white font-bold text-xs py-2 rounded-xl flex items-center justify-center gap-1.5 border-none cursor-pointer"
              onClick={() => executeShare("whatsapp")}
            >
              Share to WhatsApp
            </Button>
            <Button 
              className="w-full bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#F77737] hover:opacity-90 text-white font-bold text-xs py-2 rounded-xl flex items-center justify-center gap-1.5 border-none cursor-pointer"
              onClick={() => executeShare("instagram")}
            >
              Share to Instagram Story
            </Button>
            <Button 
              className="w-full bg-[#0088cc] hover:bg-[#0077b3] text-white font-bold text-xs py-2 rounded-xl flex items-center justify-center gap-1.5 border-none cursor-pointer"
              onClick={() => executeShare("telegram")}
            >
              Share to Telegram
            </Button>
          </div>
          <DialogFooter className="mt-3">
            <Button 
              variant="outline" 
              className="w-full border-border text-foreground hover:bg-muted font-bold text-xs py-2 rounded-xl cursor-pointer"
              onClick={() => setShareCard(null)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style>{`
        @keyframes floatUp {
          0% {
            transform: translateY(0) scale(0.6);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: translateY(-70vh) scale(1.3) rotate(15deg);
            opacity: 0;
          }
        }
      `}</style>
    </AppShell>
  );
}