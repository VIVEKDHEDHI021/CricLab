import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { playerService, type PlayerRankings, type RankingItem } from "@/lib/services/playerService";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Award, Flame, Zap, Trophy, ShieldAlert, User, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/players/rankings")({
  component: PlayerRankingsPage,
});

function PlayerRankingsPage() {
  const [loading, setLoading] = useState(true);
  const [rankings, setRankings] = useState<PlayerRankings | null>(null);

  useEffect(() => {
    const fetchRankings = async () => {
      try {
        setLoading(true);
        const data = await playerService.getPlayerRankings();
        setRankings(data);
      } catch (err: any) {
        toast.error(err.response?.data?.message || err.message || "Failed to load player rankings");
      } finally {
        setLoading(false);
      }
    };
    fetchRankings();
  }, []);

  if (loading) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-primary border-r-2"></div>
          <p className="text-muted-foreground">Loading player rankings...</p>
        </div>
      </AppShell>
    );
  }

  if (!rankings) {
    return (
      <AppShell>
        <div className="text-center py-10 text-muted-foreground">
          No rankings data available.
        </div>
      </AppShell>
    );
  }

  const renderRankingList = (items: RankingItem[], metricLabel: string, metricKey: keyof RankingItem) => {
    if (items.length === 0) {
      return (
        <div className="text-center py-10 text-muted-foreground text-sm">
          No players ranked in this category yet.
        </div>
      );
    }

    return (
      <div className="space-y-2 mt-3">
        {items.map((item, index) => {
          const rank = index + 1;
          let rankColor = "bg-muted text-muted-foreground";
          if (rank === 1) rankColor = "bg-yellow-500 text-black";
          else if (rank === 2) rankColor = "bg-slate-300 text-black";
          else if (rank === 3) rankColor = "bg-amber-600 text-white";

          return (
            <Link key={item.id} to="/players/$id" params={{ id: item.id }}>
              <Card className="p-3 border-border bg-card/45 hover:bg-card/75 transition flex items-center justify-between mb-2">
                <div className="flex items-center space-x-3">
                  <div className={`h-6 w-6 rounded-full flex items-center justify-center font-bold text-xs ${rankColor}`}>
                    {rank}
                  </div>
                  <div className="h-8 w-8 rounded-full border border-border/40 flex items-center justify-center bg-muted overflow-hidden">
                    {item.avatar ? (
                      <img src={item.avatar} alt={item.name} className="h-full w-full object-cover" />
                    ) : (
                      <User className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-foreground">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground">{item.team_name}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="text-right">
                    <p className="text-xs font-bold text-primary">{item[metricKey]}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{metricLabel}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    );
  };

  return (
    <AppShell>
      <div className="max-w-md mx-auto space-y-4 pb-10">
        
        <header className="flex items-center space-x-2.5 px-1 py-1">
          <div className="h-8 w-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">Player Leaderboard</h1>
            <p className="text-[10px] text-muted-foreground">Top performers of the season</p>
          </div>
        </header>

        <Tabs defaultValue="mvp" className="w-full">
          <TabsList className="grid grid-cols-5 w-full bg-card/40 border border-border/40 p-1 rounded-xl">
            <TabsTrigger value="mvp" className="text-[10px] px-1 py-1.5 flex flex-col items-center">
              <Flame className="h-3 w-3 mb-0.5" /> MVP
            </TabsTrigger>
            <TabsTrigger value="batters" className="text-[10px] px-1 py-1.5 flex flex-col items-center">
              <Trophy className="h-3 w-3 mb-0.5" /> Runs
            </TabsTrigger>
            <TabsTrigger value="bowlers" className="text-[10px] px-1 py-1.5 flex flex-col items-center">
              <Award className="h-3 w-3 mb-0.5" /> Wkts
            </TabsTrigger>
            <TabsTrigger value="sixes" className="text-[10px] px-1 py-1.5 flex flex-col items-center">
              <Zap className="h-3 w-3 mb-0.5" /> Sixes
            </TabsTrigger>
            <TabsTrigger value="sr" className="text-[10px] px-1 py-1.5 flex flex-col items-center">
              <Flame className="h-3 w-3 mb-0.5" /> S/R
            </TabsTrigger>
          </TabsList>

          <TabsContent value="mvp" className="mt-2">
            {renderRankingList(rankings.mvp, "MVP Pts", "mvp")}
          </TabsContent>
          
          <TabsContent value="batters" className="mt-2">
            {renderRankingList(rankings.batters, "Runs", "runs")}
          </TabsContent>

          <TabsContent value="bowlers" className="mt-2">
            {renderRankingList(rankings.bowlers, "Wickets", "wickets")}
          </TabsContent>

          <TabsContent value="sixes" className="mt-2">
            {renderRankingList(rankings.sixes, "Sixes", "sixes")}
          </TabsContent>

          <TabsContent value="sr" className="mt-2">
            {renderRankingList(rankings.strike_rates, "S/R", "sr")}
          </TabsContent>
        </Tabs>

      </div>
    </AppShell>
  );
}
