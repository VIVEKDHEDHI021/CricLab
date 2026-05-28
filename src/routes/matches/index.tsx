import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { MatchCard } from "@/components/MatchCard";
import { fetchMatchSummaries } from "@/lib/match";
import { useAuth } from "@/hooks/useAuth";
import { matchService } from "@/lib/services/matchService";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/matches/")({ component: MatchesList });

function MatchesList() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["matches"], queryFn: fetchMatchSummaries });

  const onDelete = async (id: string) => {
    if (!confirm("Delete this match?")) return;
    try {
      await matchService.deleteMatch(id);
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["matches"] });
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    }
  };

  return (
    <AppShell title="Matches">
      <div className="flex gap-2 mb-4">
        <Link to="/teams" className="flex-1"><Button variant="secondary" className="w-full">Teams</Button></Link>
        <Link to="/players" className="flex-1"><Button variant="secondary" className="w-full">Players</Button></Link>
      </div>
      {isLoading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : (
        <div className="space-y-3">
          {(data ?? []).map((m) => (
            <MatchCard key={m.id} m={m} isAdmin={role === "admin"} onDelete={onDelete} />
          ))}
          {(data ?? []).length === 0 && <div className="text-muted-foreground">No matches yet.</div>}
        </div>
      )}
    </AppShell>
  );
}