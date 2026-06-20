import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { MatchCard } from "@/components/MatchCard";
import { fetchMatchSummaries } from "@/lib/match";
import { useAuth } from "@/hooks/useAuth";
import { matchService } from "@/lib/services/matchService";
import { migrationImportService } from "@/lib/services/migrationImportService";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PlusCircle, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/matches/")({ component: MatchesList });

function MatchesList() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["matches"],
    queryFn: fetchMatchSummaries,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const matches = query.state.data as any[];
      return matches?.some((m: any) => m.status === 'live') ? 5000 : false;
    }
  });

  const handleSync = async () => {
    setIsSyncing(true);
    const toastId = toast.loading("Syncing matches and players from cloud server...");
    try {
      await migrationImportService.importFromApi((progress, status) => {
        toast.loading(`Syncing: ${status} (${progress}%)`, { id: toastId });
      });
      toast.success("Database synchronized successfully!", { id: toastId });
      qc.invalidateQueries({ queryKey: ["matches"] });
      qc.invalidateQueries({ queryKey: ["playerRankings"] });
      qc.invalidateQueries({ queryKey: ["manOfTheDay"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to synchronize database.", { id: toastId });
    } finally {
      setIsSyncing(false);
    }
  };

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
        <Link to="/teams" className="flex-1"><Button variant="secondary" className="w-full text-xs">Teams</Button></Link>
        <Link to="/players" className="flex-1"><Button variant="secondary" className="w-full text-xs">Players</Button></Link>
        <Button 
          variant="outline" 
          className="flex-1 gap-1 text-xs" 
          onClick={handleSync} 
          disabled={isSyncing}
        >
          <RefreshCw className={`h-3 w-3 ${isSyncing ? "animate-spin" : ""}`} />
          {isSyncing ? "Syncing..." : "Sync Cloud"}
        </Button>
      </div>
      {canManage && (
        <Link to="/matches/new" className="block mb-4">
          <Button className="w-full gap-2">
            <PlusCircle className="h-4 w-4" />
            Create Match
          </Button>
        </Link>
      )}      {isLoading ? (
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