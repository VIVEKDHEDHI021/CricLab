import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/profile")({ component: ProfilePage });

function ProfilePage() {
  const { profileName, mobile, role, signOut } = useAuth();
  const nav = useNavigate();
  return (
    <AppShell title="Profile">
      <Card className="p-5 rounded-2xl space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold">{profileName || "—"}</div>
            <div className="text-sm text-muted-foreground">{mobile}</div>
          </div>
          <Badge className="capitalize">{role}</Badge>
        </div>
        <Button variant="outline" className="w-full" onClick={async () => { await signOut(); nav({ to: "/" }); }}>
          Sign out
        </Button>
      </Card>
      <p className="text-xs text-muted-foreground mt-3 text-center">
        Password reset is handled by an admin.
      </p>
    </AppShell>
  );
}