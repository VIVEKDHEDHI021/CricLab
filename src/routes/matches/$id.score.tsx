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

export const Route = createFileRoute("/matches/$id/score")({ component: LiveScoring });

type Match = any; type Inn = any; type Player = any; type Ball = any;

function oversText(b: number) { return `${Math.floor(b / 6)}.${b % 6}`; }

function LiveScoring() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const [match, setMatch] = useState<Match | null>(null);
  const [innings, setInnings] = useState<Inn[]>([]);
  const [balls, setBalls] = useState<Ball[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [striker, setStriker] = useState<string>("");
  const [nonStriker, setNonStriker] = useState<string>("");
  const [bowler, setBowler] = useState<string>("");
  const [loading, setLoading] = useState(true);

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

  useEffect(() => { reload(); }, [id]);

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
    if (!isLastManActive && (!nonStriker || nonStriker === striker)) {
      return toast.error("Select a non-striker");
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
        non_striker_id: isLastManActive ? null : nonStriker,
        bowler_id: bowler,
        runs: batterRuns,
        extra_runs: extraRuns,
        extra_type: extraType,
        is_wicket: isWicket,
        is_legal: isLegal,
      });

      // strike rotation on odd batter runs (not on wide; on no_ball with runs yes)
      if (!isLastManActive && (kind === "run" || kind === "bye" || kind === "leg_bye" || kind === "no_ball") && batterRuns % 2 === 1) {
        setStriker(nonStriker); setNonStriker(striker);
      }
      // end of over swap
      const newLegal = currentInn.legal_balls + (isLegal ? 1 : 0);
      if (isLegal && newLegal % 6 === 0) {
        if (!isLastManActive) {
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
          <Card className="p-4 rounded-2xl space-y-3">
            <div>Both innings complete.</div>
            <Button onClick={endMatch} className="w-full">Finish match</Button>
          </Card>
        </AppShell>
      );
    }

    if (innings.length === 1) {
      const opponentTeamId = innings[0].batting_team_id === match.team_a_id ? match.team_b_id : match.team_a_id;
      return (
        <AppShell title="Start innings">
          <Card className="p-4 rounded-2xl space-y-3 text-center">
            <h3 className="font-semibold text-lg">Innings 1 Complete</h3>
            <p className="text-sm text-muted-foreground">{teamName(innings[0].batting_team_id)} finished their innings.</p>
            <Button className="w-full mt-2" onClick={() => startInnings(opponentTeamId)}>Start {teamName(opponentTeamId)} Innings</Button>
          </Card>
        </AppShell>
      );
    }

    return (
      <AppShell title="Start innings">
        <Card className="p-4 rounded-2xl space-y-3">
          <div>Choose batting team for innings {nextInnNo}.</div>
          <Button className="w-full" onClick={() => startInnings(match.team_a_id)}>{teamName(match.team_a_id)} bats</Button>
          <Button className="w-full" variant="secondary" onClick={() => startInnings(match.team_b_id)}>{teamName(match.team_b_id)} bats</Button>
          {innings.length >= 2 && <Button variant="outline" className="w-full" onClick={endMatch}>End match</Button>}
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Live scoring">
      <Card className="p-4 rounded-2xl mb-3">
        <div className="flex justify-between items-start mb-1">
          <div className="text-xs text-muted-foreground">{teamName(battingTeam!)} batting</div>
          {currentInn.innings_no === 2 && firstInnings && (
            <div className="text-xs font-semibold text-primary">
              Target: {firstInnings.runs + 1} ({teamName(firstInnings.batting_team_id)} 1st Inn: {firstInnings.runs}/{firstInnings.wickets} in {oversText(firstInnings.legal_balls)} ov)
            </div>
          )}
        </div>
        <div className="flex justify-between items-baseline">
          <div className="text-3xl font-bold">{currentInn.runs}/{currentInn.wickets}</div>
          <div className="font-mono text-muted-foreground">{oversText(currentInn.legal_balls)} / {match.overs}</div>
        </div>
      </Card>

      <Card className="p-3 rounded-2xl mb-3 space-y-2">
        <PSelect label="Striker" value={striker} onChange={setStriker} options={activeBattingPlayers} />
        <PSelect label="Non-striker" value={nonStriker} onChange={setNonStriker} options={activeBattingPlayers} disabled={isLastManRemaining} />
        <PSelect label="Bowler" value={bowler} onChange={setBowler} options={bowlingPlayers} />
      </Card>

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

      <Card className="p-3 rounded-2xl mt-3">
        <div className="text-xs text-muted-foreground mb-1">Recent balls</div>
        <div className="flex flex-wrap gap-1 font-mono text-sm">
          {innBalls.slice(-12).map((b) => (
            <span key={b.id} className="px-2 py-0.5 rounded bg-muted">
              {b.is_wicket ? "W" : b.extra_type === "wide" ? `Wd${(b.extra_runs ?? 1) > 1 ? "+"+((b.extra_runs??1)-1):""}` : b.extra_type === "no_ball" ? `Nb${b.runs?"+"+b.runs:""}` : b.extra_type ? `${b.extra_type[0].toUpperCase()}${b.runs}` : b.runs}
            </span>
          ))}
          {innBalls.length === 0 && <span className="text-muted-foreground">No balls yet</span>}
        </div>
      </Card>

      <Button variant="outline" className="w-full mt-4" onClick={endMatch}>End match</Button>
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