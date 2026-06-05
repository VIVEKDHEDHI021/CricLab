import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { MatchCard, MatchSummary } from "@/components/MatchCard";
import { fetchMatchSummaries } from "@/lib/match";
import { useAuth } from "@/hooks/useAuth";
import { matchService } from "@/lib/services/matchService";
import { toast } from "sonner";

import { Link } from "@tanstack/react-router";
import { playerService } from "@/lib/services/playerService";
import { Sparkles } from "lucide-react";
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
  const { data: motd } = useQuery({
    queryKey: ["manOfTheDay"],
    queryFn: () => playerService.getManOfTheDay(),
  });

  const items = data ?? [];
  const live = items.filter((m) => m.status === "live");
  const upcoming = items.filter((m) => m.status === "upcoming");
  const past = items.filter((m) => m.status === "past");

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
    <AppShell>
      {isLoading ? (
        <div className="text-muted-foreground">Loading matches…</div>
      ) : (
        <div className="space-y-6">
          {/* Man of the Day Section */}
          {motd && motd.player && (
            <Card className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-purple-500/10 border border-amber-500/25 shadow-md relative overflow-hidden backdrop-blur-sm">
              <div className="absolute -top-3 -right-3 w-16 h-16 bg-amber-500/15 rounded-full blur-xl pointer-events-none" />
              
              <div className="flex items-center justify-between mb-3">
                <span className="bg-amber-500/25 border border-amber-500/40 text-amber-500 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm leading-none">
                  <Sparkles className="h-3 w-3 animate-pulse" />
                  Man of the Day
                </span>
                {motd.timeframe && (
                  <span className="text-[9px] font-extrabold text-muted-foreground bg-muted/60 border border-border/40 px-2 py-0.5 rounded-md leading-none">
                    {motd.timeframe}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3.5">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full border border-amber-400 p-0.5 bg-card shadow-sm overflow-hidden flex items-center justify-center shrink-0">
                    {motd.player.avatar ? (
                      <img src={motd.player.avatar} alt={motd.player.name} className="w-full h-full object-cover rounded-full" />
                    ) : (
                      <span className="text-amber-500 font-extrabold text-sm">
                        {motd.player.name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <span className="absolute -bottom-1 -right-1 bg-amber-500 text-[10px] p-0.5 rounded-full border border-card shadow-sm leading-none">
                    👑
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-extrabold text-sm text-foreground truncate hover:text-primary transition-colors">
                    <Link to="/players/$id" params={{ id: motd.player.id }}>
                      {motd.player.name}
                    </Link>
                  </h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5 font-semibold">
                    {motd.player.team?.name || "No Team Assigned"}
                  </p>
                  
                  <div className="flex gap-3 mt-1.5 text-xs text-muted-foreground font-semibold">
                    {motd.stats && motd.stats.runs > 0 && (
                      <div>
                        Runs: <span className="font-bold text-foreground">{motd.stats.runs}</span>
                      </div>
                    )}
                    {motd.stats && motd.stats.wickets > 0 && (
                      <div>
                        Wkts: <span className="font-bold text-foreground">{motd.stats.wickets}</span>
                      </div>
                    )}
                    {motd.stats && motd.stats.catches > 0 && (
                      <div>
                        Ctch: <span className="font-bold text-foreground">{motd.stats.catches}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[9px] text-muted-foreground uppercase font-black tracking-wider block leading-none">MVP score</span>
                  <span className="text-2xl font-black text-amber-500 block mt-1 leading-none">{motd.stats?.mvp || 0}</span>
                </div>
              </div>
            </Card>
          )}

          <Section title="Live" items={live} isAdmin={role === "admin"} onDelete={onDelete} />
          <Section title="Upcoming" items={upcoming} isAdmin={role === "admin"} onDelete={onDelete} />
          <Section title="Past" items={past} isAdmin={role === "admin"} onDelete={onDelete} />
        </div>
      )}
    </AppShell>
  );
}