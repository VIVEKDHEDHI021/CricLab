import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { authService, type AdminUserListItem } from "@/lib/services/authService";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { 
  Users, Key, Search, Loader2, Phone, Mail, CheckCircle2, AlertTriangle, Copy, ShieldAlert, CloudDownload
} from "lucide-react";

export const Route = createFileRoute("/admin/users")({
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [fetching, setFetching] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Reset dialog states
  const [resettingUser, setResettingUser] = useState<AdminUserListItem | null>(null);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [tempPassword, setTempPassword] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  // Success dialog (to show the password once)
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);

  // Sync-all-users dialog state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0, name: '' });

  useEffect(() => {
    if (!loading) {
      if (!user) {
        navigate({ to: "/" });
      } else if (role !== "admin") {
        navigate({ to: "/dashboard" });
      }
    }
  }, [loading, user, role, navigate]);

  const fetchUsers = async () => {
    try {
      setFetching(true);
      const data = await authService.adminListUsers();
      setUsers(data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to load users list");
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (user && role === "admin") {
      fetchUsers();
    }
  }, [user, role]);

  const handleSyncUsers = async () => {
    setIsSyncing(true);
    setSyncProgress({ current: 0, total: 0, name: 'Starting sync...' });
    try {
      const { synced, errors } = await authService.syncAllUsersLocally(
        (current, total, name) => setSyncProgress({ current, total, name })
      );
      toast.success(`Sync complete — ${synced} user${synced !== 1 ? 's' : ''} saved locally${errors > 0 ? `, ${errors} error(s)` : ''}.`);
      fetchUsers(); // Refresh the visible list
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to sync users from server.');
    } finally {
      setIsSyncing(false);
      setSyncProgress({ current: 0, total: 0, name: '' });
    }
  };

  const handleResetPassword = async () => {
    if (!resettingUser) return;
    setIsBusy(true);
    try {
      const res = await authService.adminResetPassword(resettingUser.id);
      setTempPassword(res.temporary_password);
      setIsResetOpen(false);
      setIsSuccessOpen(true);
      fetchUsers(); // Refresh status list
      toast.success(`Password reset for ${resettingUser.name}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to reset password.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleCopyPassword = () => {
    navigator.clipboard.writeText(tempPassword);
    toast.success("Temporary password copied to clipboard!");
  };

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return users;
    return users.filter(
      u => 
        u.name.toLowerCase().includes(query) || 
        u.mobile.includes(query) ||
        (u.email && u.email.toLowerCase().includes(query))
    );
  }, [users, searchQuery]);

  if (loading || fetching && users.length === 0) {
    return (
      <AppShell title="Users Management">
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">Loading users list...</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Users Management">
      <div className="max-w-md mx-auto space-y-5 pb-10">
        
        {/* Header Summary */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Users Directory</h1>
              <p className="text-xs text-muted-foreground">{users.length} registered accounts</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncUsers}
              disabled={isSyncing}
              className="text-xs h-8 gap-1.5 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10"
            >
              {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudDownload className="h-3.5 w-3.5" />}
              Sync Users
            </Button>
            <Button variant="outline" size="sm" onClick={fetchUsers} className="text-xs h-8">
              Refresh
            </Button>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, mobile, or email..."
            className="pl-9 bg-card/60 border-border"
          />
        </div>

        {/* Users List */}
        <div className="space-y-3">
          {filteredUsers.length === 0 ? (
            <div className="text-center text-muted-foreground text-xs py-8 bg-card/25 border border-dashed border-border rounded-xl">
              No users found matching your search.
            </div>
          ) : (
            filteredUsers.map((u) => (
              <Card key={u.id} className="p-4 border-border bg-card/50 backdrop-blur flex flex-col justify-between space-y-3.5">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                      {u.name}
                      <Badge className="text-[9px] h-4 uppercase bg-primary/10 text-primary border border-primary/20">
                        {u.role}
                      </Badge>
                    </h3>
                    
                    <div className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                      <p className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3" />
                        {u.mobile}
                      </p>
                      {u.email && (
                        <p className="flex items-center gap-1.5">
                          <Mail className="h-3 w-3" />
                          {u.email}
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    {u.must_change_password ? (
                      <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/20 bg-amber-500/5 gap-1">
                        <AlertTriangle className="h-2.5 w-2.5" /> Temp Pass Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/20 bg-emerald-500/5 gap-1">
                        <CheckCircle2 className="h-2.5 w-2.5" /> Active
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-border/30">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-8 border-amber-500/30 text-amber-500 hover:bg-amber-500/10 gap-1.5"
                    onClick={() => {
                      setResettingUser(u);
                      setIsResetOpen(true);
                    }}
                    disabled={u.role === "admin" && u.id === user?.id} // Cannot reset own password from users list
                  >
                    <Key className="h-3.5 w-3.5" />
                    Reset Password
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Confirm Reset Dialog */}
      <Dialog open={isResetOpen} onOpenChange={setIsResetOpen}>
        <DialogContent className="max-w-sm bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              Confirm Password Reset
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Are you sure you want to reset the password for <strong>{resettingUser?.name}</strong>?
            This will generate a temporary password that they will be forced to change on their next login.
          </p>
          <DialogFooter className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" size="sm" onClick={() => setIsResetOpen(false)} disabled={isBusy}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={handleResetPassword} disabled={isBusy}>
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reset Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Temporary Password Reveal Dialog (Once) */}
      <Dialog open={isSuccessOpen} onOpenChange={(open) => {
        if (!open) {
          setIsSuccessOpen(false);
          setTempPassword("");
          setResettingUser(null);
        }
      }}>
        <DialogContent className="max-w-sm bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-emerald-500 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              Temporary Password Generated
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 my-2">
            <p className="text-xs text-muted-foreground">
              Please share this temporary password with <strong>{resettingUser?.name}</strong>.
              It will only be shown <span className="text-amber-500 font-bold">ONCE</span> for security.
            </p>
            <div className="bg-background border border-border p-3.5 rounded-xl flex items-center justify-between font-mono font-bold text-lg tracking-wider text-center select-all">
              <span>{tempPassword}</span>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" onClick={handleCopyPassword}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button onClick={() => setIsSuccessOpen(false)} className="w-full">
              I have saved the password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sync Users Progress Dialog */}
      <Dialog open={isSyncing}>
        <DialogContent className="max-w-sm bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <CloudDownload className="h-5 w-5 text-emerald-500" />
              Syncing Users from Server
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 my-2">
            <p className="text-xs text-muted-foreground">
              Downloading all registered accounts and saving them locally so they can log in offline.
            </p>
            {syncProgress.total > 0 && (
              <>
                <Progress
                  value={Math.round((syncProgress.current / syncProgress.total) * 100)}
                  className="h-2"
                />
                <p className="text-xs text-center text-muted-foreground">
                  {syncProgress.current} / {syncProgress.total} — <span className="text-foreground font-medium">{syncProgress.name}</span>
                </p>
              </>
            )}
            {syncProgress.total === 0 && (
              <div className="flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
