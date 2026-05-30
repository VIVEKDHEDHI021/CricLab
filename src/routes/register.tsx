import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authService } from "@/lib/services/authService";
import { setToken } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { updateEchoAuth } from "@/lib/echo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
});

function RegisterPage() {
  const { user, role, loading, refreshRole } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (!loading && user && role) nav({ to: "/dashboard" });
  }, [user, role, loading, nav]);

  const [form, setForm] = useState({
    name: "",
    username: "",
    mobile: "",
    password: "",
    password_confirmation: "",
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    const name = form.name.trim();
    const username = form.username.trim().toLowerCase();
    const mobile = form.mobile.trim();
    const password = form.password;
    const confirm = form.password_confirmation;

    if (!name || !username || !mobile || !password || !confirm) {
      return toast.error("All fields are required");
    }

    if (username.length < 3) {
      return toast.error("Username must be at least 3 characters");
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return toast.error("Username can only contain letters, numbers, underscores, and hyphens");
    }

    if (!/^[0-9]{10,15}$/.test(mobile)) {
      return toast.error("Mobile number must be between 10 and 15 digits");
    }

    if (password.length < 6) {
      return toast.error("Password must be at least 6 characters");
    }

    if (password !== confirm) {
      return toast.error("Passwords do not match");
    }

    setBusy(true);
    try {
      const { token } = await authService.register(name, mobile, username, password, confirm);
      setToken(token);
      updateEchoAuth();
      await refreshRole();
      toast.success("Account created successfully!");
      nav({ to: "/setup" });
    } catch (err: any) {
      if (err.response?.data?.errors) {
        // Show the first Laravel validation error
        const errors = err.response.data.errors;
        const firstErrorKey = Object.keys(errors)[0];
        const message = errors[firstErrorKey][0];
        toast.error(message);
      } else {
        const message = err.response?.data?.message || err.message || "Registration failed";
        toast.error(message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="px-4 py-5 border-b border-border">
        <h1 className="text-2xl font-bold tracking-tight text-center">
          <span className="text-primary">Cric</span>Lab
        </h1>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md p-5 bg-card border-border rounded-2xl">
          <h2 className="text-lg font-bold text-center mb-4">Register User Account</h2>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                type="text"
                autoComplete="name"
                disabled={busy}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="username">Unique Username</Label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                disabled={busy}
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="john_doe"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mobile">Mobile Number</Label>
              <Input
                id="mobile"
                inputMode="tel"
                autoComplete="tel"
                disabled={busy}
                value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                placeholder="9876543210"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pw">Password</Label>
              <Input
                id="pw"
                type="password"
                autoComplete="new-password"
                disabled={busy}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pw_conf">Confirm Password</Label>
              <Input
                id="pw_conf"
                type="password"
                autoComplete="new-password"
                disabled={busy}
                value={form.password_confirmation}
                onChange={(e) => setForm({ ...form, password_confirmation: e.target.value })}
              />
            </div>
            <Button type="submit" className="w-full mt-2" disabled={busy}>
              {busy ? "Creating account…" : "Register"}
            </Button>
            <div className="text-center text-xs border-t border-border/40 pt-3 mt-1">
              <span className="text-muted-foreground">Already have an account? </span>
              <Link to="/" className="text-primary hover:underline font-semibold">Login here</Link>
            </div>
          </form>
        </Card>
      </main>
    </div>
  );
}
