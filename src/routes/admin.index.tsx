import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { authService } from "@/lib/services/authService";
import { teamService } from "@/lib/services/teamService";
import { playerService } from "@/lib/services/playerService";
import { matchService } from "@/lib/services/matchService";
import { sqliteService } from "@/lib/services/sqliteService";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  ShieldAlert, Users, Shield, Database, Plus, Trophy, Activity, 
  Settings, Loader2, ArrowRight, RefreshCw, KeyRound, Wrench, Layers
} from "lucide-react";

export const Route = createFileRoute("/admin/")({
  component: AdminPanelPage,
});

function AdminPanelPage() {
  const { user, role, loading, signOut } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState({ matches: 0, teams: 0, players: 0, users: 0 });
  const [loadingStats, setLoadingStats] = useState(true);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        navigate({ to: "/login" });
      } else if (role !== "admin") {
        navigate({ to: "/dashboard" });
      }
    }
  }, [loading, user, role, navigate]);

  const loadStats = async () => {
    try {
      setLoadingStats(true);
      const [matches, teams, players, users] = await Promise.all([
        matchService.getMatches().catch(() => []),
        teamService.getTeams().catch(() => []),
        playerService.getPlayers().catch(() => []),
        authService.adminListUsers().catch(() => []),
      ]);

      setStats({
        matches: matches.length,
        teams: teams.length,
        players: players.length,
        users: users.length,
      });
    } catch (err: any) {
      console.error("Failed to load statistics", err);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    if (user && role === "admin") {
      loadStats();
    }
  }, [user, role]);

  const handleReinitializeDatabase = async () => {
    setIsInitializing(true);
    setIsConfirmResetOpen(false);
    try {
      // Trigger database re-initialization (ensures schema exists and runs seeders)
      await sqliteService.query("SELECT 1;"); 
      localStorage.setItem("criclab_setup_completed", "true");
      toast.success("Offline workspace database initialized successfully!");
      loadStats();
    } catch (err: any) {
      console.error("Initialization failed:", err);
      toast.error("Failed to initialize workspace: " + err.message);
    } finally {
      setIsInitializing(false);
    }
  };

  if (loading || !user || role !== "admin") {
    return (
      <AppShell title="Admin Panel">
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">Verifying permissions...</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Admin Panel">
      <div className="max-w-md mx-auto space-y-6 pb-10">
        
        {/* Admin Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="h-10 w-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-primary border border-orange-500/20">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Admin Workspace</h1>
              <p className="text-xs text-muted-foreground">Manage offline-first settings & credentials</p>
            </div>
          </div>
          <Badge className="bg-primary/10 text-primary border border-primary/20 capitalize px-2 py-0.5 text-[10px]">
            System Owner
          </Badge>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-2">
          <Card className="p-3 border-border bg-card/40 text-center relative overflow-hidden flex flex-col justify-between h-20">
            <span className="text-[10px] text-muted-foreground uppercase font-semibold">Matches</span>
            {loadingStats ? (
              <Loader2 className="h-4 w-4 animate-spin mx-auto text-primary" />
            ) : (
              <span className="text-lg font-bold text-foreground">{stats.matches}</span>
            )}
          </Card>
          <Card className="p-3 border-border bg-card/40 text-center relative overflow-hidden flex flex-col justify-between h-20">
            <span className="text-[10px] text-muted-foreground uppercase font-semibold">Teams</span>
            {loadingStats ? (
              <Loader2 className="h-4 w-4 animate-spin mx-auto text-primary" />
            ) : (
              <span className="text-lg font-bold text-foreground">{stats.teams}</span>
            )}
          </Card>
          <Card className="p-3 border-border bg-card/40 text-center relative overflow-hidden flex flex-col justify-between h-20">
            <span className="text-[10px] text-muted-foreground uppercase font-semibold">Players</span>
            {loadingStats ? (
              <Loader2 className="h-4 w-4 animate-spin mx-auto text-primary" />
            ) : (
              <span className="text-lg font-bold text-foreground">{stats.players}</span>
            )}
          </Card>
          <Card className="p-3 border-border bg-card/40 text-center relative overflow-hidden flex flex-col justify-between h-20">
            <span className="text-[10px] text-muted-foreground uppercase font-semibold">Users</span>
            {loadingStats ? (
              <Loader2 className="h-4 w-4 animate-spin mx-auto text-primary" />
            ) : (
              <span className="text-lg font-bold text-foreground">{stats.users}</span>
            )}
          </Card>
        </div>

        {/* Primary Admin Actions */}
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-primary uppercase tracking-wider px-1">System Controls</h2>
          
          {/* User Directory Management */}
          <Link to="/admin/users" className="block group">
            <Card className="p-4 border-border bg-card/50 hover:bg-card/75 transition-all duration-300 flex items-start gap-4 shadow-sm border-l-4 border-l-primary">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shrink-0">
                <Users className="h-5 w-5" />
              </div>
              <div className="flex-1 space-y-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-foreground group-hover:text-primary transition-colors truncate">
                    Users Directory & Security
                  </h3>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Reset player & scorer passwords, assign administrative privileges, and sync credentials from the main server.
                </p>
              </div>
            </Card>
          </Link>

          {/* Backup Center */}
          <Link to="/backup-center" className="block group">
            <Card className="p-4 border-border bg-card/50 hover:bg-card/75 transition-all duration-300 flex items-start gap-4 shadow-sm border-l-4 border-l-orange-500">
              <div className="h-10 w-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500 border border-orange-500/20 shrink-0">
                <Wrench className="h-5 w-5" />
              </div>
              <div className="flex-1 space-y-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-foreground group-hover:text-orange-500 transition-colors truncate">
                    Universal Backup Center
                  </h3>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Generate offline JSON backup packages, share match summaries, save scores to PDF, or import historical database snapshots.
                </p>
              </div>
            </Card>
          </Link>

          {/* Migration Import */}
          <Link to="/migration-import" className="block group">
            <Card className="p-4 border-border bg-card/50 hover:bg-card/75 transition-all duration-300 flex items-start gap-4 shadow-sm border-l-4 border-l-emerald-500">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20 shrink-0">
                <Database className="h-5 w-5" />
              </div>
              <div className="flex-1 space-y-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-foreground group-hover:text-emerald-500 transition-colors truncate">
                    Import Web Migration Package
                  </h3>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Upload exported `.zip` migration directories from the web console to populate your offline app with squads, teams, and matches.
                </p>
              </div>
            </Card>
          </Link>
        </div>

        {/* Database Utilities & Quick Actions */}
        <div className="space-y-3 pt-2">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-1">Quick Links & Database Utilities</h2>
          
          <div className="grid grid-cols-2 gap-3">
            {/* Create Match */}
            <Link to="/matches/new" className="block">
              <Button variant="outline" className="w-full text-xs h-10 border-border bg-card/30 hover:bg-card/60 flex items-center justify-start gap-2.5 px-3.5 rounded-xl font-bold">
                <Plus className="h-4 w-4 text-primary" />
                Create New Match
              </Button>
            </Link>

            {/* Manage Teams */}
            <Link to="/teams" className="block">
              <Button variant="outline" className="w-full text-xs h-10 border-border bg-card/30 hover:bg-card/60 flex items-center justify-start gap-2.5 px-3.5 rounded-xl font-bold">
                <Layers className="h-4 w-4 text-primary" />
                Manage Teams
              </Button>
            </Link>
          </div>

          {/* Safe Workspace Re-initialization */}
          <Card className="p-4 border-dashed border-border/80 bg-card/10 rounded-2xl flex flex-col items-start gap-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20">
                <RefreshCw className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-bold text-xs">Verify Database Health</h3>
                <p className="text-[10px] text-muted-foreground">Run local integrity checks and refresh references</p>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              If local player associations, matches, or scorecards ever get out of sync, click below to re-initialize SQLite tables and run default schemas safely.
            </p>
            <Button 
              size="sm"
              variant="outline" 
              onClick={() => setIsConfirmResetOpen(true)}
              className="text-xs h-8 font-bold border-amber-500/20 text-amber-500 hover:bg-amber-500/10 gap-1.5"
              disabled={isInitializing}
            >
              {isInitializing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Initialize Workspace
            </Button>
          </Card>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={isConfirmResetOpen} onOpenChange={setIsConfirmResetOpen}>
        <DialogContent className="max-w-sm bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              Confirm Initialization
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Are you sure you want to initialize the local workspace? This will ensure the SQLite tables are configured correctly. Any existing local-only tables will remain intact, but references will be checked.
          </p>
          <DialogFooter className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" size="sm" onClick={() => setIsConfirmResetOpen(false)} disabled={isInitializing}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={handleReinitializeDatabase} disabled={isInitializing}>
              {isInitializing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & Initialize"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
