import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { matchService } from "@/lib/services/matchService";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/matches/$id/")({ component: MatchDetails });

function oversText(b: number) { return `${Math.floor(b / 6)}.${b % 6}`; }

function MatchDetails() {
  const { id } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["match", id],
    queryFn: () => matchService.getMatch(id),
  });

  if (isLoading || !data) return <AppShell><div className="text-muted-foreground">Loading…</div></AppShell>;
  const { m, teams, innings, players, balls } = data as any;
  const teamName = (tid: string) => teams?.find((t: any) => t.id === tid)?.name ?? "—";

  return (
    <AppShell title="Match">
      <Card className="p-4 rounded-2xl mb-4">
        <div className="text-xs text-muted-foreground">{m.ground || "—"} · {m.overs} overs · {m.match_type || ""}</div>
        <div className="text-lg font-semibold mt-1">{teamName(m.team_a_id)} vs {teamName(m.team_b_id)}</div>
        <div className="text-sm text-primary mt-1">{m.result || (m.status === "live" ? "Live" : m.status)}</div>
        {m.status !== "past" && (
          <Link to="/matches/$id/score" params={{ id }} className="block mt-3">
            <Button className="w-full">{m.status === "live" ? "Continue scoring" : "Start scoring"}</Button>
          </Link>
        )}
      </Card>

      <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-2">Scorecard</h3>
      {(innings ?? []).map((inn: any) => {
        const innBalls = (balls ?? []).filter((b: any) => b.innings_id === inn.id);
        const battingPlayers = (players ?? []).filter((p: any) => p.team_id === inn.batting_team_id);
        return (
          <Card key={inn.id} className="p-4 rounded-2xl mb-3">
            <div className="flex justify-between items-baseline mb-2">
              <div className="font-semibold">{teamName(inn.batting_team_id)}</div>
              <div className="font-mono">{inn.runs}/{inn.wickets} <span className="text-muted-foreground text-sm">({oversText(inn.legal_balls)})</span></div>
            </div>
            <div className="text-xs text-muted-foreground mb-1">Batters</div>
            <div className="space-y-1">
              {battingPlayers.map((p: any) => {
                const faced = innBalls.filter((b: any) => b.batter_id === p.id && b.is_legal);
                const runs = innBalls.filter((b: any) => b.batter_id === p.id).reduce((s: number, b: any) => s + (b.runs || 0), 0);
                if (!faced.length && runs === 0) return null;
                const sr = faced.length ? ((runs / faced.length) * 100).toFixed(1) : "0.0";
                return (
                  <div key={p.id} className="flex justify-between text-sm">
                    <span>{p.name}</span>
                    <span className="font-mono text-muted-foreground">{runs} ({faced.length}) · SR {sr}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
      {(innings ?? []).length === 0 && <div className="text-muted-foreground text-sm">Not started yet.</div>}
    </AppShell>
  );
}
