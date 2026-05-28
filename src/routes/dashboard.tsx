import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { MatchCard, MatchSummary } from "@/components/MatchCard";
import { fetchMatchSummaries } from "@/lib/match";
import { useAuth } from "@/hooks/useAuth";
import { matchService } from "@/lib/services/matchService";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/dashboard")({ component: Dashboard });

function Section({ title, items, isAdmin, onDelete }: { title: string; items: MatchSummary[]; isAdmin: boolean; onDelete: (id: string) => void }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm uppercase tracking-wider text-muted-foreground px-1">{title}</h2>
      {items.length === 0 ? (
        <Card className="p-6 text-center border-dashed border-2 border-border/80 bg-muted/5 rounded-2xl flex flex-col items-center justify-center gap-1 my-1">
          <p className="text-sm font-medium text-muted-foreground">No {title.toLowerCase()} matches</p>
          <p className="text-xs text-muted-foreground/60">Matches in this category will appear here.</p>
        </Card>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
          {items.map((m) => (
            <div key={m.id} className="min-w-[85%] snap-start">
              <MatchCard m={m} isAdmin={isAdmin} onDelete={onDelete} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Dashboard() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["matches"], queryFn: fetchMatchSummaries });
  const items = data ?? [];
  const live = items.filter((m) => m.status === "live");
  const upcoming = items.filter((m) => m.status === "upcoming");
  const past = items.filter((m) => m.status === "past");

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
    <AppShell>
      {isLoading ? (
        <div className="text-muted-foreground">Loading matches…</div>
      ) : (
        <div className="space-y-6">
          <Section title="Live" items={live} isAdmin={role === "admin"} onDelete={onDelete} />
          <Section title="Upcoming" items={upcoming} isAdmin={role === "admin"} onDelete={onDelete} />
          <Section title="Past" items={past} isAdmin={role === "admin"} onDelete={onDelete} />
        </div>
      )}
    </AppShell>
  );
}