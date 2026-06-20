import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Home, ListChecks, Users, User as UserIcon, Plus, Shield, Trophy } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { echoClient, updateEchoAuth } from "@/lib/echo";
import { PageBuffer } from "@/components/PageBuffer";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const { user, loading, role, mustChangePassword, signOut } = useAuth();
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

  if (loading || !user) {
    return <PageBuffer />;
  }

  const tabs = [
    { to: "/dashboard", label: "Home", icon: Home },
    { to: "/matches", label: "Matches", icon: ListChecks },
    { to: "/players/rankings", label: "Leaderboard", icon: Trophy },
  ];

  if (role === "admin") {
    tabs.push({ to: "/admin", label: "Admin", icon: Shield });
  }

  const isScoringPage = loc.pathname.endsWith("/score");
  const isChangePasswordPage = loc.pathname === "/change-password";
  const hideNav = isScoringPage || isChangePasswordPage;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {!hideNav && (
        <header 
          className="sticky z-20 bg-background/90 backdrop-blur border-b border-border px-4 py-3 flex items-center justify-between"
          style={{ top: "env(safe-area-inset-top)" }}
        >
          <div className="text-xl font-bold tracking-tight">
            <span className="text-primary">Cric</span>Lab
          </div>
          <div className="flex items-center gap-3">
            {title && <div className="text-sm text-muted-foreground">{title}</div>}
            <ThemeToggle />
            {user && user.id !== "guest" ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs font-semibold hover:text-destructive text-muted-foreground cursor-pointer px-2.5 rounded-lg border border-border/40 hover:bg-destructive/5"
                onClick={signOut}
              >
                Sign Out
              </Button>
            ) : (
              <Link to="/login">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs font-semibold hover:text-primary text-muted-foreground cursor-pointer px-2.5 rounded-lg border border-border/40 hover:bg-primary/5"
                >
                  Admin Login
                </Button>
              </Link>
            )}
          </div>
        </header>
      )}
      <main className={hideNav ? "flex-1 pb-8 w-full" : "flex-1 px-4 pt-4 max-w-xl w-full mx-auto pb-28"}>
        {children}
      </main>

      {loc.pathname === "/dashboard" && !hideNav && (role === "admin" || role === "scorer") && (
        <Link
          to="/matches/new"
          className="fixed right-5 z-30 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/40 flex items-center justify-center active:scale-95"
          style={{ bottom: "calc(5rem + env(safe-area-inset-bottom))" }}
          aria-label="Add match"
        >
          <Plus className="h-7 w-7" />
        </Link>
      )}
 

 
      {!hideNav && (
        <nav 
          className="fixed bottom-0 inset-x-0 z-20 border-t border-border bg-card/95 backdrop-blur"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <ul className={`grid max-w-xl mx-auto ${tabs.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
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