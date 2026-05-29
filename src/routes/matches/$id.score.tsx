import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { matchService } from "@/lib/services/matchService";
import { inningsService } from "@/lib/services/inningsService";
import { ballService } from "@/lib/services/ballService";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";
import { echoClient, updateEchoAuth } from "@/lib/echo";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/matches/$id/score")({ component: LiveScoring });

type Match = any; type Inn = any; type Player = any; type Ball = any;

function oversText(b: number) { return `${Math.floor(b / 6)}.${b % 6}`; }

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
  const [isSoloPlay, setIsSoloPlay] = useState(false);

  const canScore = role === "admin" || (user && match && match.created_by === user.id);
  const playerName = (pid: string) => players.find((p) => p.id === pid)?.name ?? "—";

  const [isLiveSync, setIsLiveSync] = useState(false);

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

    const channel = echoClient.private(`matches.${id}`);

    channel.listen(".MatchUpdated", (data: any) => {
      setMatch(data.m);
      setTeams(data.teams ?? []);
      setInnings(data.innings ?? []);
      setPlayers(data.players ?? []);
      setBalls(data.balls ?? []);
    });

    return () => {
      channel.stopListening(".MatchUpdated");
      echoClient.leave(`matches.${id}`);
      setIsLiveSync(false);
    };
  }, [id]);

  const currentInn = useMemo(() => innings.find((i) => i.innings_no === match?.current_innings && !i.is_closed) || innings[innings.length - 1], [innings, match]);
  const battingTeam = currentInn?.batting_team_id;
  const bowlingTeam = currentInn?.bowling_team_id;
  const battingPlayers = players.filter((p) => p.team_id === battingTeam);
  const bowlingPlayers = players.filter((p) => p.team_id === bowlingTeam);
  const innBalls = balls.filter((b) => b.innings_id === currentInn?.id);

  const outBatterIds = useMemo(() => {
    return new Set(
      innBalls
        .filter((b) => b.is_wicket)
        .map((b) => b.batter_id)
        .filter(Boolean)
    );
  }, [innBalls]);

  const activeBattingPlayers = useMemo(() => {
    return battingPlayers.filter((p) => !outBatterIds.has(p.id));
  }, [battingPlayers, outBatterIds]);

  const isLastManRemaining = useMemo(() => {
    return !!(match?.last_man_batting && activeBattingPlayers.length === 1);
  }, [match, activeBattingPlayers]);

  const firstInnings = useMemo(() => innings.find((i) => i.innings_no === 1), [innings]);

  const isInningsOver = useMemo(() => {
    if (!currentInn || !match) return false;
    const maxWickets = battingPlayers.length > 0 
      ? (match.last_man_batting ? battingPlayers.length : battingPlayers.length - 1) 
      : 10;
    
    // Check if target is chased
    if (currentInn.innings_no === 2 && firstInnings && currentInn.runs > firstInnings.runs) {
      return true;
    }
    
    return currentInn.legal_balls >= match.overs * 6 || currentInn.wickets >= maxWickets || currentInn.wickets >= 10;
  }, [currentInn, match, battingPlayers, firstInnings]);

  useEffect(() => {
    if (isLastManRemaining) {
      const loneBatsmanId = activeBattingPlayers[0].id;
      if (striker !== loneBatsmanId) {
        setStriker(loneBatsmanId);
      }
      if (nonStriker !== "") {
        setNonStriker("");
      }
    }
  }, [isLastManRemaining, activeBattingPlayers, striker, nonStriker]);

  const isOverStarted = useMemo(() => {
    if (!currentInn) return false;
    const currentOverNo = Math.floor((currentInn.legal_balls ?? 0) / 6);
    const currentOverBalls = innBalls.filter(b => b.over_number === currentOverNo);
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
      const totalLegalBalls = innBalls.filter(b => b.is_legal).length;
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

      if (lastBall.batter_id && !lastBall.non_striker_id && !isLastManRemaining) {
        setIsSoloPlay(true);
      }

      if (!striker && expectedStriker && !outBatterIds.has(expectedStriker)) {
        setStriker(expectedStriker);
      }
      if (!isSoloPlay && !nonStriker && expectedNonStriker && !outBatterIds.has(expectedNonStriker)) {
        setNonStriker(expectedNonStriker);
      }
      if (!bowler && lastBall.bowler_id && !isEndOfOver) {
        setBowler(lastBall.bowler_id);
      }
    }
  }, [innBalls, outBatterIds, striker, nonStriker, bowler, isLastManRemaining, isSoloPlay]);

  const allPlayersSelected = useMemo(() => {
    const isLastManActive = !!(match?.last_man_batting && currentInn && currentInn.wickets >= (battingPlayers.length > 0 ? battingPlayers.length - 1 : 10));
    return !!(striker && (isSoloPlay || isLastManActive || nonStriker) && bowler);
  }, [striker, nonStriker, bowler, match, currentInn, battingPlayers, isSoloPlay]);

  const isLocked = isOverStarted && allPlayersSelected && !unlocked;

  const strikerStats = useMemo(() => {
    if (!striker) return { runs: 0, balls: 0, sr: "0.0" };
    const batterBalls = innBalls.filter(b => b.batter_id === striker);
    const runs = batterBalls.reduce((sum, b) => sum + (b.runs ?? 0), 0);
    const balls = batterBalls.filter(b => b.extra_type !== "wide").length;
    const sr = balls > 0 ? ((runs / balls) * 100).toFixed(1) : "0.0";
    return { runs, balls, sr };
  }, [innBalls, striker]);

  const nonStrikerStats = useMemo(() => {
    if (!nonStriker) return { runs: 0, balls: 0, sr: "0.0" };
    const batterBalls = innBalls.filter(b => b.batter_id === nonStriker);
    const runs = batterBalls.reduce((sum, b) => sum + (b.runs ?? 0), 0);
    const balls = batterBalls.filter(b => b.extra_type !== "wide").length;
    const sr = balls > 0 ? ((runs / balls) * 100).toFixed(1) : "0.0";
    return { runs, balls, sr };
  }, [innBalls, nonStriker]);

  const bowlerStats = useMemo(() => {
    if (!bowler) return { overs: "0.0", maidens: 0, runs: 0, wickets: 0 };
    const bowlerBalls = innBalls.filter(b => b.bowler_id === bowler);
    
    const runs = bowlerBalls.reduce((sum, b) => {
      let r = b.runs ?? 0;
      if (b.extra_type === "wide" || b.extra_type === "no_ball") {
        r += (b.extra_runs ?? 0);
      }
      return sum + r;
    }, 0);

    const legalCount = bowlerBalls.filter(b => b.is_legal).length;
    const overs = `${Math.floor(legalCount / 6)}.${legalCount % 6}`;
    
    const wickets = bowlerBalls.filter(b => b.is_wicket).length;

    const oversGrouped: Record<number, any[]> = {};
    innBalls.forEach(b => {
      if (!oversGrouped[b.over_number]) oversGrouped[b.over_number] = [];
      oversGrouped[b.over_number].push(b);
    });

    let maidens = 0;
    Object.keys(oversGrouped).forEach((oKey) => {
      const oNum = parseInt(oKey);
      const ballsInOver = oversGrouped[oNum];
      const bowlerBallsInThisOver = ballsInOver.filter(b => b.bowler_id === bowler);
      const legalBowlerBalls = bowlerBallsInThisOver.filter(b => b.is_legal).length;
      if (legalBowlerBalls === 6) {
        const runsConcededInOver = bowlerBallsInThisOver.reduce((sum, b) => {
          let r = b.runs ?? 0;
          if (b.extra_type === "wide" || b.extra_type === "no_ball") {
            r += (b.extra_runs ?? 0);
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

  const addBall = async (kind: "run" | "wide" | "no_ball" | "bye" | "leg_bye" | "wicket", runs = 0) => {
    if (!currentInn) return toast.error("Start an innings first");
    const isLastManActive = !!(match?.last_man_batting && currentInn.wickets >= (battingPlayers.length > 0 ? battingPlayers.length - 1 : 10));

    if (!striker || !bowler) return toast.error("Select striker and bowler");
    if (!isSoloPlay && !isLastManActive && (!nonStriker || nonStriker === striker)) {
      return toast.error("Select a distinct non-striker");
    }
    const wideRun = match.wide_run ?? 1;
    const noballRun = match.noball_run ?? 1;
    const isLegal = kind === "run" || kind === "bye" || kind === "leg_bye" || kind === "wicket";
    let batterRuns = 0; let extraRuns = 0; let extraType: string | null = null; let isWicket = false;
    if (kind === "run") batterRuns = runs;
    else if (kind === "wide") { extraType = "wide"; extraRuns = wideRun + runs; }
    else if (kind === "no_ball") { extraType = "no_ball"; extraRuns = noballRun; batterRuns = runs; }
    else if (kind === "bye") { extraType = "bye"; extraRuns = runs; }
    else if (kind === "leg_bye") { extraType = "leg_bye"; extraRuns = runs; }
    else if (kind === "wicket") { isWicket = true; batterRuns = runs; }

    const ballIndex = innBalls.length;
    const legalCount = currentInn.legal_balls;
    const overNo = Math.floor(legalCount / 6);
    const ballInOver = (legalCount % 6) + (isLegal ? 1 : 0);

    try {
      await ballService.addBall(currentInn.id, {
        match_id: id,
        ball_index: ballIndex,
        over_number: overNo,
        ball_in_over: isLegal ? ballInOver : (legalCount % 6) + 1,
        batter_id: striker,
        non_striker_id: (isSoloPlay || isLastManActive) ? null : nonStriker,
        bowler_id: bowler,
        runs: batterRuns,
        extra_runs: extraRuns,
        extra_type: extraType,
        is_wicket: isWicket,
        is_legal: isLegal,
      });

      // strike rotation on odd batter runs (not on wide; on no_ball with runs yes)
      if (!isSoloPlay && !isLastManActive && (kind === "run" || kind === "bye" || kind === "leg_bye" || kind === "no_ball") && batterRuns % 2 === 1) {
        setStriker(nonStriker); setNonStriker(striker);
      }
      // end of over swap
      const newLegal = currentInn.legal_balls + (isLegal ? 1 : 0);
      if (isLegal && newLegal % 6 === 0) {
        if (!isSoloPlay && !isLastManActive) {
          setStriker(nonStriker); setNonStriker(striker);
        }
        toast.success("End of over");
      }
      
      const newWickets = currentInn.wickets + (isWicket ? 1 : 0);
      const maxWickets = battingPlayers.length > 0 
        ? (match.last_man_batting ? battingPlayers.length : battingPlayers.length - 1) 
        : 10;
      if (newLegal >= match.overs * 6 || newWickets >= maxWickets || newWickets >= 10) {
        toast.success("Innings closed");
      } else if (kind === "wicket") {
        setStriker("");
        toast.info("Wicket! Select new batsman");
      }

      reload();
      if (kind !== "wicket") {
        setUnlocked(false);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    }
  };

  const undo = async () => {
    if (!currentInn || innBalls.length === 0) return;
    const last = innBalls[innBalls.length - 1];
    try {
      await ballService.undoBall(last.id);
      reload();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    }
  };

  if (loading || !match) return <AppShell><div className="text-muted-foreground">Loading…</div></AppShell>;

  const teamName = (tid: string) => teams.find((t) => t.id === tid)?.name ?? "—";

  if (!currentInn || currentInn.is_closed) {
    const nextInnNo = (innings[innings.length - 1]?.innings_no ?? 0) + 1;
    if (nextInnNo > 2) {
      return (
        <AppShell title="Live scoring">
          <div className="flex items-center justify-between mb-3 px-1">
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 text-xs font-semibold rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 gap-1.5 pl-2 pr-3"
              onClick={() => nav({ to: "/matches/$id", params: { id } })}
            >
              <span className="text-sm">←</span> Back to Match
            </Button>
          </div>
          <Card className="p-4 rounded-2xl space-y-3 text-center">
            <h3 className="font-semibold text-lg">Match Complete</h3>
            <p className="text-sm text-muted-foreground">Both innings are complete.</p>
            {canScore ? (
              <Button onClick={endMatch} className="w-full">Finish match</Button>
            ) : (
              <p className="text-xs text-primary animate-pulse font-medium mt-2">Waiting for scorer to finish the match...</p>
            )}
          </Card>
        </AppShell>
      );
    }

    if (innings.length === 1) {
      const opponentTeamId = innings[0].batting_team_id === match.team_a_id ? match.team_b_id : match.team_a_id;
      return (
        <AppShell title="Start innings">
          <div className="flex items-center justify-between mb-3 px-1">
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 text-xs font-semibold rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 gap-1.5 pl-2 pr-3"
              onClick={() => nav({ to: "/matches/$id", params: { id } })}
            >
              <span className="text-sm">←</span> Back to Match
            </Button>
          </div>
          <Card className="p-4 rounded-2xl space-y-3 text-center">
            <h3 className="font-semibold text-lg">Innings 1 Complete</h3>
            <p className="text-sm text-muted-foreground">{teamName(innings[0].batting_team_id)} finished their innings.</p>
            {canScore ? (
              <Button className="w-full mt-2" onClick={() => startInnings(opponentTeamId)}>Start {teamName(opponentTeamId)} Innings</Button>
            ) : (
              <p className="text-xs text-primary animate-pulse mt-2 font-medium">Waiting for scorer to start {teamName(opponentTeamId)} innings...</p>
            )}
          </Card>
        </AppShell>
      );
    }

    return (
      <AppShell title="Start innings">
        <div className="flex items-center justify-between mb-3 px-1">
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 text-xs font-semibold rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 gap-1.5 pl-2 pr-3"
            onClick={() => nav({ to: "/matches/$id", params: { id } })}
          >
            <span className="text-sm">←</span> Back to Match
          </Button>
        </div>
        <Card className="p-4 rounded-2xl space-y-3 text-center">
          <h3 className="font-semibold text-lg">Waiting to Start</h3>
          <p className="text-sm text-muted-foreground">Innings {nextInnNo} is about to begin.</p>
          {canScore ? (
            <div className="space-y-2 mt-2">
              <Button className="w-full" onClick={() => startInnings(match.team_a_id)}>{teamName(match.team_a_id)} bats</Button>
              <Button className="w-full" variant="secondary" onClick={() => startInnings(match.team_b_id)}>{teamName(match.team_b_id)} bats</Button>
              {innings.length >= 2 && <Button variant="outline" className="w-full" onClick={endMatch}>End match</Button>}
            </div>
          ) : (
            <p className="text-xs text-primary animate-pulse mt-2 font-medium">Waiting for scorer to choose batting team...</p>
          )}
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Live scoring">
      <div className="flex items-center justify-between mb-3 px-1">
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-8 text-xs font-semibold rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 gap-1.5 pl-2 pr-3"
          onClick={() => nav({ to: "/matches/$id", params: { id } })}
        >
          <span className="text-sm">←</span> Back to Match
        </Button>
      </div>
      <Card className="p-4 rounded-2xl mb-3">
        <div className="flex justify-between items-start mb-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {isLiveSync && (
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            )}
            <span>{teamName(battingTeam!)} batting</span>
          </div>
          {currentInn.innings_no === 2 && firstInnings && (
            <div className="text-xs font-semibold text-primary">
              Target: {firstInnings.runs + 1} ({teamName(firstInnings.batting_team_id)} 1st Inn: {firstInnings.runs}/{firstInnings.wickets} in {oversText(firstInnings.legal_balls)} ov)
            </div>
          )}
        </div>
        <div className="flex justify-between items-baseline mb-3">
          <div className="text-3xl font-bold">{currentInn.runs}/{currentInn.wickets}</div>
          <div className="font-mono text-muted-foreground">{oversText(currentInn.legal_balls)} / {match.overs}</div>
        </div>

        <div className="border-t border-border/40 pt-3 mt-2.5 space-y-2 text-xs">
          <div className="grid grid-cols-12 text-muted-foreground font-medium pb-0.5">
            <span className="col-span-6">Batter</span>
            <span className="col-span-2 text-right">R</span>
            <span className="col-span-2 text-right">B</span>
            <span className="col-span-2 text-right font-mono">SR</span>
          </div>
          
          {striker ? (
            <div className="grid grid-cols-12 font-semibold">
              <span className="col-span-6 flex items-center gap-1 text-foreground">
                <span>{playerName(striker)}</span>
                <span className="text-[10px] text-primary animate-pulse font-bold">*</span>
              </span>
              <span className="col-span-2 text-right text-foreground">{strikerStats.runs}</span>
              <span className="col-span-2 text-right text-muted-foreground">{strikerStats.balls}</span>
              <span className="col-span-2 text-right text-muted-foreground font-mono">{strikerStats.sr}</span>
            </div>
          ) : (
            <div className="grid grid-cols-12 text-muted-foreground/60 italic">
              <span className="col-span-12">Select striker...</span>
            </div>
          )}

          {!isLastManRemaining && !isSoloPlay && (
            nonStriker ? (
              <div className="grid grid-cols-12 font-medium">
                <span className="col-span-6 text-muted-foreground">{playerName(nonStriker)}</span>
                <span className="col-span-2 text-right text-foreground">{nonStrikerStats.runs}</span>
                <span className="col-span-2 text-right text-muted-foreground">{nonStrikerStats.balls}</span>
                <span className="col-span-2 text-right text-muted-foreground font-mono">{nonStrikerStats.sr}</span>
              </div>
            ) : (
              <div className="grid grid-cols-12 text-muted-foreground/60 italic">
                <span className="col-span-12">Select non-striker...</span>
              </div>
            )
          )}

          <div className="border-t border-border/40 pt-2.5 mt-1.5">
            <div className="grid grid-cols-12 text-muted-foreground font-medium pb-0.5">
              <span className="col-span-6">Bowler</span>
              <span className="col-span-2 text-right">O</span>
              <span className="col-span-2 text-right">M</span>
              <span className="col-span-2 text-right">R</span>
              <span className="col-span-2 text-right">W</span>
            </div>
            {bowler ? (
              <div className="grid grid-cols-12 font-medium">
                <span className="col-span-6 text-muted-foreground">{playerName(bowler)}</span>
                <span className="col-span-2 text-right text-foreground">{bowlerStats.overs}</span>
                <span className="col-span-2 text-right text-muted-foreground">{bowlerStats.maidens}</span>
                <span className="col-span-2 text-right text-muted-foreground">{bowlerStats.runs}</span>
                <span className="col-span-2 text-right text-foreground font-semibold font-mono">{bowlerStats.wickets}</span>
              </div>
            ) : (
              <div className="grid grid-cols-12 text-muted-foreground/60 italic">
                <span className="col-span-12">Select bowler...</span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {canScore ? (
        <Card className="p-3 rounded-2xl mb-3 space-y-2 relative overflow-hidden">
          {isLocked && (
            <div className="absolute inset-0 bg-background/85 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center gap-2 p-3">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                🔒 Selection Locked (Over in progress)
              </span>
              <Button 
                variant="outline" 
                className="h-8 text-xs px-3 rounded-full font-medium shadow-sm bg-card hover:bg-muted" 
                onClick={() => {
                  if (confirm("Do you have permission to change players during an active over?")) {
                    setUnlocked(true);
                  }
                }}
              >
                Unlock Selection
              </Button>
            </div>
          )}
          <div className="flex items-center justify-between pb-1.5 border-b border-border/40 mb-1">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Mode</span>
            <Button
              type="button"
              variant={isSoloPlay ? "default" : "outline"}
              className="h-6 text-[10px] px-2 rounded-full font-bold uppercase"
              onClick={() => {
                setIsSoloPlay(!isSoloPlay);
                if (!isSoloPlay) {
                  setNonStriker("");
                }
              }}
              disabled={isLocked}
            >
              {isSoloPlay ? "⚡ Solo Play: ON" : "👥 Standard Play"}
            </Button>
          </div>
          <PSelect label="Striker" value={striker} onChange={setStriker} options={activeBattingPlayers} disabled={isLocked} />
          {!isSoloPlay && (
            <PSelect label="Non-striker" value={nonStriker} onChange={setNonStriker} options={activeBattingPlayers} disabled={isLocked || isLastManRemaining} />
          )}
          <PSelect label="Bowler" value={bowler} onChange={setBowler} options={bowlingPlayers} disabled={isLocked} />
        </Card>
      ) : (
        <Card className="p-3 rounded-2xl mb-3 space-y-2 text-sm">
          <div className="flex justify-between items-center py-1 border-b border-border/50">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"></span>
              Striker:
            </span>
            <span className="font-semibold">{playerName(striker) || "Not Selected"}</span>
          </div>
          <div className="flex justify-between items-center py-1 border-b border-border/50">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-muted"></span>
              Non-striker:
            </span>
            <span className="font-semibold">
              {isLastManRemaining 
                ? "None (Last Man Standing)" 
                : (isSoloPlay ? "None (Solo Play)" : (playerName(nonStriker) || "Not Selected"))}
            </span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-secondary"></span>
              Bowler:
            </span>
            <span className="font-semibold">{playerName(bowler) || "Not Selected"}</span>
          </div>
        </Card>
      )}

      {canScore ? (
        <>
          <div className="grid grid-cols-4 gap-2 mb-2">
            {[0,1,2,3,4,6].map((r) => (
              <Button key={r} variant={r === 4 || r === 6 ? "default" : "secondary"} onClick={() => addBall("run", r)} disabled={isInningsOver}>{r}</Button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <Button variant="outline" onClick={() => addBall("wide")} disabled={isInningsOver}>Wide</Button>
            <Button variant="outline" onClick={() => addBall("no_ball", 0)} disabled={isInningsOver}>No ball</Button>
            <Button variant="outline" onClick={() => addBall("bye", 1)} disabled={isInningsOver}>Bye</Button>
            <Button variant="outline" onClick={() => addBall("leg_bye", 1)} disabled={isInningsOver}>Leg bye</Button>
            <Button variant="destructive" onClick={() => addBall("wicket")} disabled={isInningsOver}>Wicket</Button>
            <Button variant="secondary" onClick={undo} disabled={isInningsOver}>Undo</Button>
          </div>
        </>
      ) : (
        <div className="bg-card text-muted-foreground border border-border text-center py-3 px-4 rounded-2xl text-xs font-medium mb-2 space-y-1">
          <div className="text-emerald-500 font-semibold uppercase tracking-wider flex items-center justify-center gap-1.5">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Live Match Spectator View
          </div>
          <div>Only the match creator or administrators can modify this score.</div>
        </div>
      )}

      <Card className="p-3 rounded-2xl mt-3">
        <div className="text-xs text-muted-foreground mb-1">Recent balls</div>
        <div className="flex flex-wrap gap-1 items-center font-mono text-sm">
          {innBalls.slice(-12).map((b, idx, arr) => {
            const prevBall = idx > 0 ? arr[idx - 1] : null;
            const isNewOver = prevBall && prevBall.over_number !== b.over_number;
            return (
              <div key={b.id} className="flex items-center">
                {isNewOver && (
                  <div className="w-[1.5px] h-4 bg-border/80 mx-1.5 self-center" />
                )}
                <span className="px-2 py-0.5 rounded bg-muted">
                  {b.is_wicket ? "W" : b.extra_type === "wide" ? `Wd${(b.extra_runs ?? 1) > 1 ? "+"+((b.extra_runs??1)-1):""}` : b.extra_type === "no_ball" ? `Nb${b.runs?"+"+b.runs:""}` : b.extra_type ? `${b.extra_type[0].toUpperCase()}${b.runs}` : b.runs}
                </span>
              </div>
            );
          })}
          {innBalls.length === 0 && <span className="text-muted-foreground">No balls yet</span>}
        </div>
      </Card>

      {yetToBatPlayers.length > 0 && (
        <Card className="p-3 rounded-2xl mt-3">
          <div className="text-xs text-muted-foreground mb-2">Next Batsmen & State</div>
          <div className="space-y-1.5">
            {yetToBatPlayers.map((p, idx) => (
              <div key={p.id} className="flex justify-between items-center text-sm py-1 border-b border-border/20 last:border-0">
                <span className="font-semibold text-foreground flex items-center gap-2">
                  <span>{p.name}</span>
                  {idx === 0 && (
                    <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                      Next Up
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground font-medium">Yet to bat</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {canScore && <Button variant="outline" className="w-full mt-4" onClick={endMatch}>End match</Button>}
    </AppShell>
  );
}

function PSelect({ label, value, onChange, options, disabled }: { label: string; value: string; onChange: (v: string) => void; options: any[]; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground w-24">{label}</span>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="flex-1" disabled={disabled}><SelectValue placeholder="Select" /></SelectTrigger>
        <SelectContent>{options.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}