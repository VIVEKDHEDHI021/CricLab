import { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Home, ListChecks, Users, User as UserIcon, Plus, Shield, Trophy } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { echoClient, updateEchoAuth } from "@/lib/echo";
import { PageBuffer } from "@/components/PageBuffer";
import { ThemeToggle } from "@/components/ThemeToggle";

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const { user, loading, role, mustChangePassword } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        nav({ to: "/" });
      } else if (mustChangePassword) {
        if (loc.pathname !== "/change-password") {
          nav({ to: "/change-password" });
        }
      }
    }
  }, [loading, user, mustChangePassword, loc.pathname, nav]);

  useEffect(() => {
    if (!echoClient || !user) return;

    updateEchoAuth();

    const channel = echoClient.channel("matches");

    channel.listen(".MatchUpdated", (payload: any) => {
      const matchData = payload.m;
      const teamA = payload.teams?.find((t: any) => t.id === matchData.team_a_id) || null;
      const teamB = payload.teams?.find((t: any) => t.id === matchData.team_b_id) || null;
      
      const matchSummaryItem = {
        id: matchData.id,
        status: matchData.status,
        match_date: matchData.match_date,
        ground: matchData.ground,
        match_type: matchData.match_type,
        overs: matchData.overs,
        result: matchData.result,
        team_a: teamA ? { id: teamA.id, name: teamA.name } : null,
        team_b: teamB ? { id: teamB.id, name: teamB.name } : null,
        innings: (payload.innings ?? []).map((i: any) => ({
          innings_no: i.innings_no,
          runs: i.runs,
          wickets: i.wickets,
          legal_balls: i.legal_balls,
          batting_team_id: i.batting_team_id,
        })),
      };

      queryClient.setQueryData<any[]>(["matches"], (old) => {
        if (!old) return old;
        const exists = old.some((item) => item.id === matchSummaryItem.id);
        if (!exists) {
          queryClient.invalidateQueries({ queryKey: ["matches"] });
          return old;
        }
        return old.map((item) => item.id === matchSummaryItem.id ? matchSummaryItem : item);
      });
    });

    return () => {
      channel.stopListening(".MatchUpdated");
      if (echoClient) {
        echoClient.leave("matches");
      }
    };
  }, [user, queryClient]);

  if (loading || !user) {
    return <PageBuffer />;
  }

  const tabs = [
    { to: "/dashboard", label: "Home", icon: Home },
    { to: "/matches", label: "Matches", icon: ListChecks },
    { to: "/players/rankings", label: "Leaderboard", icon: Trophy },
    role === "admin"
      ? { to: "/admin/users", label: "Users", icon: Users }
      : { to: "/friends", label: "Friends", icon: Users },
    { to: "/profile", label: "Profile", icon: UserIcon },
  ];

  const isScoringPage = loc.pathname.endsWith("/score");
  const isChangePasswordPage = loc.pathname === "/change-password";
  const hideNav = isScoringPage || isChangePasswordPage;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {!hideNav && (
        <header className="sticky top-0 z-20 bg-background/90 backdrop-blur border-b border-border px-4 py-3 flex items-center justify-between">
          <div className="text-xl font-bold tracking-tight">
            <span className="text-primary">Cric</span>Lab
          </div>
          <div className="flex items-center gap-3">
            {title && <div className="text-sm text-muted-foreground">{title}</div>}
            <ThemeToggle />
          </div>
        </header>
      )}
      <main className={hideNav ? "flex-1 pb-8 w-full" : "flex-1 px-4 pt-4 max-w-xl w-full mx-auto pb-28"}>
        {children}
      </main>

      {loc.pathname === "/dashboard" && !hideNav && (
        <Link
          to="/matches/new"
          className="fixed bottom-20 right-5 z-30 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/40 flex items-center justify-center active:scale-95"
          aria-label="Add match"
        >
          <Plus className="h-7 w-7" />
        </Link>
      )}

      {!hideNav && (
        <nav className="fixed bottom-0 inset-x-0 z-20 border-t border-border bg-card/95 backdrop-blur">
          <ul className="grid grid-cols-5 max-w-xl mx-auto">
            {tabs.map((t) => {
              const active = loc.pathname === t.to || loc.pathname.startsWith(t.to + "/");
              const Icon = t.icon;
              return (
                <li key={t.to}>
                  <Link
                    to={t.to}
                    className={`flex flex-col items-center gap-1 py-3 text-xs ${
                      active ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {t.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}