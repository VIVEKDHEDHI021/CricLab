import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { MatchCard } from "@/components/MatchCard";
import { fetchMatchSummaries } from "@/lib/match";
import { useAuth } from "@/hooks/useAuth";
import { matchService } from "@/lib/services/matchService";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PlusCircle } from "lucide-react";

export const Route = createFileRoute("/matches/")({ component: MatchesList });

function MatchesList() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["matches"],
    queryFn: fetchMatchSummaries,
    refetchInterval: (query) => {
      const matches = query.state.data as any[];
      return matches?.some((m: any) => m.status === 'live') ? 5000 : false;
    }
  });

  // Scorers and admins can manage matches
  const canManage = role === "admin" || role === "scorer";

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

  return (
    <AppShell title="Matches">
      <div className="flex gap-2 mb-4">
        <Link to="/teams" className="flex-1"><Button variant="secondary" className="w-full">Teams</Button></Link>
        <Link to="/players" className="flex-1"><Button variant="secondary" className="w-full">Players</Button></Link>
      </div>

      {canManage && (
        <Link to="/matches/new" className="block mb-4">
          <Button className="w-full gap-2">
            <PlusCircle className="h-4 w-4" />
            Create Match
          </Button>
        </Link>
      )}

      {isLoading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : (
        <div className="space-y-3">
          {(data ?? []).map((m) => (
            <MatchCard key={m.id} m={m} isAdmin={canManage} onDelete={canManage ? onDelete : undefined} />
          ))}
          {(data ?? []).length === 0 && (
            <Card className="p-8 text-center border-dashed border-2 border-border/80 bg-muted/5 rounded-2xl flex flex-col items-center justify-center gap-1.5 my-2">
              <p className="text-sm font-medium text-muted-foreground">No matches found</p>
              {canManage ? (
                <p className="text-xs text-muted-foreground/60">Create a new match using the button above.</p>
              ) : (
                <p className="text-xs text-muted-foreground/60">No matches available yet. Check back later.</p>
              )}
            </Card>
          )}
        </div>
      )}
    </AppShell>
  );
}