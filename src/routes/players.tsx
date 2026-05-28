import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { playerService, type Player } from "@/lib/services/playerService";
import { teamService, type Team } from "@/lib/services/teamService";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/players")({ component: PlayersPage });

function PlayersPage() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState("");

  const load = async () => {
    try {
      const [p, t] = await Promise.all([
        playerService.getPlayers(),
        teamService.getTeams(),
      ]);
      setPlayers(p);
      setTeams(t);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    }
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name.trim() || !teamId) return toast.error("Name and team required");
    try {
      await playerService.createPlayer({ name, team_id: teamId });
      setName("");
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    }
  };
  const del = async (id: string) => {
    if (!confirm("Delete player?")) return;
    try {
      await playerService.deletePlayer(id);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    }
  };

  return (
    <AppShell title="Players">
      {isAdmin && (
        <Card className="p-3 rounded-2xl mb-4 space-y-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Player name" />
          <Select value={teamId} onValueChange={setTeamId}>
            <SelectTrigger><SelectValue placeholder="Team" /></SelectTrigger>
            <SelectContent>{teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={add} className="w-full">Add player</Button>
        </Card>
      )}
      <div className="space-y-2">
        {players.map((p) => {
          const s = p.stats ?? { matches: 0, runs: 0, wickets: 0, sr: "—", econ: "—" };
          const team = teams.find((t) => t.id === p.team_id)?.name;
          return (
            <Card key={p.id} className="p-3 rounded-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{team || "—"}</div>
                </div>
                {isAdmin && <Button size="icon" variant="outline" onClick={() => del(p.id)}><Trash2 className="h-4 w-4" /></Button>}
              </div>
              <div className="grid grid-cols-5 gap-1 mt-2 text-center text-xs">
                <Stat label="M" v={s.matches} />
                <Stat label="R" v={s.runs} />
                <Stat label="W" v={s.wickets} />
                <Stat label="SR" v={s.sr} />
                <Stat label="Econ" v={s.econ} />
              </div>
            </Card>
          );
        })}
        {players.length === 0 && <div className="text-muted-foreground">No players yet.</div>}
      </div>
    </AppShell>
  );
}

function Stat({ label, v }: { label: string; v: any }) {
  return (
    <div className="bg-muted rounded-lg p-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-mono">{v}</div>
    </div>
  );
}