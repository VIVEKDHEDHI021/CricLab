import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authService } from "@/lib/services/authService";
import { setToken } from "@/lib/api";
import { useAuth, Role } from "@/hooks/useAuth";
import { updateEchoAuth } from "@/lib/echo";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  component: LoginPage,
});

function LoginPage() {
  const { user, role, loading } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (!loading && user && role) nav({ to: "/dashboard" });
  }, [user, role, loading, nav]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="px-4 py-5 border-b border-border">
        <h1 className="text-2xl font-bold tracking-tight text-center">
          <span className="text-primary">Cric</span>Lab
        </h1>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md p-5 bg-card border-border rounded-2xl">
          <Tabs defaultValue="user" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="user">User Login</TabsTrigger>
              <TabsTrigger value="admin">Admin Login</TabsTrigger>
            </TabsList>
            <TabsContent value="user"><AuthForm expectedRole="user" /></TabsContent>
            <TabsContent value="admin"><AuthForm expectedRole="admin" /></TabsContent>
          </Tabs>
        </Card>
      </main>
    </div>
  );
}

function AuthForm({ expectedRole }: { expectedRole: Role }) {
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const { refreshRole } = useAuth();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mobile.trim() || !password) return toast.error("Mobile and password required");
    setBusy(true);
    try {
      const { token } = await authService.login(mobile, password, expectedRole ?? "user");
      setToken(token);
      updateEchoAuth();
      await refreshRole();
      toast.success("Signed in");
      nav({ to: "/dashboard" });
    } catch (err: any) {
      const message = err.response?.data?.message || err.message || "Auth failed";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="mobile">Mobile number</Label>
        <Input id="mobile" inputMode="tel" autoComplete="tel" value={mobile}
          onChange={(e) => setMobile(e.target.value)} placeholder="9876543210" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="pw">Password</Label>
        <Input id="pw" type="password" autoComplete="current-password"
          value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Please wait…" : "Sign in"}
      </Button>
      {expectedRole === "user" && (
        <div className="space-y-2 pt-2">
          <p className="text-[11px] text-muted-foreground text-center">Password reset is handled by an admin.</p>
          <div className="text-center text-xs border-t border-border/40 pt-2">
            <span className="text-muted-foreground">New to CricLab? </span>
            <Link to="/register" className="text-primary hover:underline font-semibold">Register here</Link>
          </div>
        </div>
      )}
    </form>
  );
}
