import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { authService } from "@/lib/services/authService";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { KeyRound, Loader2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/change-password")({
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const { refreshRole, signOut } = useAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword || !newPassword || !confirmPassword) {
      return toast.error("All fields are required.");
    }

    if (newPassword.length < 8) {
      return toast.error("New password must be at least 8 characters long.");
    }

    if (newPassword !== confirmPassword) {
      return toast.error("New password and confirm password do not match.");
    }

    setSaving(true);
    try {
      await authService.changePassword(currentPassword, newPassword, confirmPassword);
      toast.success("Password changed successfully!");
      await refreshRole();
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      const message = err.response?.data?.message || err.message || "Failed to change password.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell title="Change Password">
      <div className="max-w-md mx-auto py-10 px-4 space-y-6">
        <div className="text-center space-y-2">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto text-primary mb-2 border border-primary/20">
            <KeyRound className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Change Your Password</h1>
          <p className="text-xs text-muted-foreground">
            For security reasons, you must change your temporary password before you can proceed.
          </p>
        </div>

        <Card className="p-5 border-border bg-card/60 backdrop-blur rounded-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="current-pw">Current Password</Label>
              <Input
                id="current-pw"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                required
                className="bg-background border-border"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-pw">New Password</Label>
              <Input
                id="new-pw"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                required
                className="bg-background border-border"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-pw">Confirm New Password</Label>
              <Input
                id="confirm-pw"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                required
                className="bg-background border-border"
              />
            </div>

            <div className="pt-2">
              <Button type="submit" className="w-full h-10 font-bold gap-2 text-sm" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Updating Password...
                  </>
                ) : (
                  "Update Password"
                )}
              </Button>
            </div>
          </form>
        </Card>

        <div className="text-center">
          <button
            type="button"
            onClick={signOut}
            className="text-xs text-muted-foreground/80 hover:text-destructive hover:underline transition-colors"
          >
            Cancel and Sign Out
          </button>
        </div>
      </div>
    </AppShell>
  );
}
