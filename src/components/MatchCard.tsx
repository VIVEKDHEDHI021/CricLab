import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Pencil, Radio } from "lucide-react";

type Innings = { innings_no: number; runs: number; wickets: number; legal_balls: number; batting_team_id: string };

export type MatchSummary = {
  id: string;
  status: "upcoming" | "live" | "past" | string;
  match_date: string;
  ground: string | null;
  match_type: string | null;
  overs: number;
  result: string | null;
  team_a: { id: string; name: string } | null;
  team_b: { id: string; name: string } | null;
  innings: Innings[];
};

function oversText(legalBalls: number) {
  return `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;
}

export function MatchCard({
  m,
  isAdmin,
  onDelete,
}: {
  m: MatchSummary;
  isAdmin?: boolean;
  onDelete?: (id: string) => void;
}) {
  const a = m.team_a?.name ?? "Team A";
  const b = m.team_b?.name ?? "Team B";
  const innA = m.innings.find((i) => i.batting_team_id === m.team_a?.id);
  const innB = m.innings.find((i) => i.batting_team_id === m.team_b?.id);

  return (
    <Card className="p-4 rounded-2xl bg-card border-border relative overflow-hidden">
      {m.status === "live" && (
        <span className="absolute top-3 right-3 flex items-center gap-1 text-xs text-accent-foreground bg-accent px-2 py-0.5 rounded-full">
          <Radio className="h-3 w-3 animate-pulse" /> LIVE
        </span>
      )}
      {m.status === "upcoming" && (
        <Badge variant="secondary" className="absolute top-3 right-3">Upcoming</Badge>
      )}
      {m.status === "past" && (
        <Badge variant="outline" className="absolute top-3 right-3">Past</Badge>
      )}

      <div className="text-xs text-muted-foreground mb-2">
        {m.ground || "—"} · {m.overs} overs {m.match_type ? `· ${m.match_type}` : ""}
      </div>

      <div className="space-y-1.5">
        <Row name={a} runs={innA?.runs} wkts={innA?.wickets} balls={innA?.legal_balls} />
        <Row name={b} runs={innB?.runs} wkts={innB?.wickets} balls={innB?.legal_balls} />
      </div>

      <div className="mt-3 text-sm text-primary min-h-[1.25rem]">
        {m.result || (m.status === "live" ? "In progress" : "")}
      </div>

      <div className="mt-3 flex gap-2">
        <Link to="/matches/$id" params={{ id: m.id }} className="flex-1">
          <Button variant="secondary" className="w-full">View</Button>
        </Link>
        {m.status !== "past" && (
          <Link to="/matches/$id/score" params={{ id: m.id }} className="flex-1">
            <Button className="w-full">{m.status === "live" ? "Continue" : "Start scoring"}</Button>
          </Link>
        )}
        {isAdmin && (
          <Button variant="outline" size="icon" onClick={() => onDelete?.(m.id)} aria-label="Delete">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </Card>
  );
}

function Row({
  name, runs, wkts, balls,
}: { name: string; runs?: number; wkts?: number; balls?: number }) {
  return (
    <div className="flex items-center justify-between">
      <div className="font-semibold">{name}</div>
      <div className="font-mono text-sm">
        {runs != null ? `${runs}/${wkts ?? 0}` : "—"}
        {balls != null && <span className="text-muted-foreground"> ({oversText(balls)})</span>}
      </div>
    </div>
  );
}