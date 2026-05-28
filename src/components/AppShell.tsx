import { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Home, ListChecks, Users, User as UserIcon, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const { user, loading, role } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    if (!loading && !user) nav({ to: "/" });
  }, [loading, user, nav]);

  if (loading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  const tabs = [
    { to: "/dashboard", label: "Home", icon: Home },
    { to: "/matches", label: "Matches", icon: ListChecks },
    { to: "/friends", label: "Friends", icon: Users },
    { to: "/profile", label: "Profile", icon: UserIcon },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-20 bg-background/90 backdrop-blur border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="text-xl font-bold tracking-tight">
          <span className="text-primary">Cric</span>Lab
        </div>
        {title && <div className="text-sm text-muted-foreground">{title}</div>}
      </header>
      <main className="flex-1 px-4 pb-28 pt-4 max-w-xl w-full mx-auto">{children}</main>

      {role === "admin" && loc.pathname === "/dashboard" && (
        <Link
          to="/matches/new"
          className="fixed bottom-20 right-5 z-30 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/40 flex items-center justify-center active:scale-95"
          aria-label="Add match"
        >
          <Plus className="h-7 w-7" />
        </Link>
      )}

      <nav className="fixed bottom-0 inset-x-0 z-20 border-t border-border bg-card/95 backdrop-blur">
        <ul className="grid grid-cols-4 max-w-xl mx-auto">
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
    </div>
  );
}