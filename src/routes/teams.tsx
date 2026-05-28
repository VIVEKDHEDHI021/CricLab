import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { teamService, type Team } from "@/lib/services/teamService";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/teams")({ component: TeamsPage });

function TeamsPage() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [teams, setTeams] = useState<Team[]>([]);
  const [name, setName] = useState("");

  const load = async () => {
    try {
      const data = await teamService.getTeams();
      setTeams(data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    }
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name.trim()) return;
    try {
      await teamService.createTeam(name);
      setName("");
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    }
  };
  const del = async (id: string) => {
    if (!confirm("Delete team?")) return;
    try {
      await teamService.deleteTeam(id);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    }
  };

  return (
    <AppShell title="Teams">
      {isAdmin && (
        <div className="flex gap-2 mb-4">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New team name" />
          <Button onClick={add}>Add</Button>
        </div>
      )}
      <div className="space-y-2">
        {teams.map((t) => (
          <Card key={t.id} className="p-3 flex items-center justify-between rounded-2xl">
            <span className="font-medium">{t.name}</span>
            {isAdmin && (
              <Button size="icon" variant="outline" onClick={() => del(t.id)}><Trash2 className="h-4 w-4" /></Button>
            )}
          </Card>
        ))}
        {teams.length === 0 && <div className="text-muted-foreground">No teams yet.</div>}
      </div>
    </AppShell>
  );
}