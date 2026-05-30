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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
            <TabsList className="grid w-full grid-cols-3 mb-4">
              <TabsTrigger value="user">User</TabsTrigger>
              <TabsTrigger value="scorer">Scorer</TabsTrigger>
              <TabsTrigger value="admin">Admin</TabsTrigger>
            </TabsList>
            <TabsContent value="user"><AuthForm expectedRole="user" /></TabsContent>
            <TabsContent value="scorer"><AuthForm expectedRole="scorer" /></TabsContent>
            <TabsContent value="admin">
              <AuthForm expectedRole="admin" />
              <AdminRegisterDialog />
            </TabsContent>
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
        <Label htmlFor={`mobile-${expectedRole}`}>Mobile number</Label>
        <Input
          id={`mobile-${expectedRole}`}
          inputMode="tel"
          autoComplete="tel"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          placeholder="9876543210"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`pw-${expectedRole}`}>Password</Label>
        <Input
          id={`pw-${expectedRole}`}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Please wait…" : "Sign in"}
      </Button>
      {expectedRole === "user" && (
        <div className="space-y-2 pt-2">
          <p className="text-[11px] text-muted-foreground text-center">
            Password reset is handled by an admin.
          </p>
          <div className="text-center text-xs border-t border-border/40 pt-2">
            <span className="text-muted-foreground">New to CricLab? </span>
            <Link to="/register" className="text-primary hover:underline font-semibold">
              Register here
            </Link>
          </div>
        </div>
      )}
    </form>
  );
}

function AdminRegisterDialog() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const { refreshRole } = useAuth();
  const [form, setForm] = useState({
    name: "",
    username: "",
    mobile: "",
    password: "",
    password_confirmation: "",
    developer_password: "",
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    const username = form.username.trim().toLowerCase();
    const mobile = form.mobile.trim();
    if (!name || !username || !mobile || !form.password || !form.developer_password) {
      return toast.error("All fields are required");
    }
    if (form.password !== form.password_confirmation) {
      return toast.error("Passwords do not match");
    }
    setBusy(true);
    try {
      const { token } = await authService.registerAdmin(
        name,
        mobile,
        username,
        form.password,
        form.password_confirmation,
        form.developer_password,
      );
      setToken(token);
      updateEchoAuth();
      await refreshRole();
      toast.success("Admin account created");
      setOpen(false);
      nav({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="w-full mt-3">
          Register new admin
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Register admin account</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          You need the developer password set on the server (Render env:{" "}
          <code className="text-primary">ADMIN_REGISTRATION_PASSWORD</code>).
        </p>
        <form onSubmit={submit} className="space-y-3 mt-2">
          <div className="space-y-1">
            <Label>Full name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Your name"
            />
          </div>
          <div className="space-y-1">
            <Label>Username</Label>
            <Input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="admin_username"
            />
          </div>
          <div className="space-y-1">
            <Label>Mobile number</Label>
            <Input
              inputMode="tel"
              value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value })}
              placeholder="9429442013"
            />
          </div>
          <div className="space-y-1">
            <Label>Password</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Confirm password</Label>
            <Input
              type="password"
              value={form.password_confirmation}
              onChange={(e) => setForm({ ...form, password_confirmation: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Developer password</Label>
            <Input
              type="password"
              value={form.developer_password}
              onChange={(e) => setForm({ ...form, developer_password: e.target.value })}
              placeholder="From server config"
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Creating…" : "Create admin account"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
