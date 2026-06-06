import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authService } from "@/lib/services/authService";
import { setToken, getToken } from "@/lib/api";
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070303] flex items-center justify-center">
        <div className="text-sm font-bold tracking-widest text-white/50 animate-pulse uppercase">
          Verifying Session…
        </div>
      </div>
    );
  }

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
  const [gsiLoaded, setGsiLoaded] = useState(false);

  // Forgot password states
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [forgotMobile, setForgotMobile] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotMessage, setForgotMessage] = useState("");

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotMobile.trim()) return toast.error("Mobile number is required");
    setForgotBusy(true);
    try {
      const res = await authService.forgotPassword(forgotMobile);
      setForgotMessage(res.message);
    } catch (err: any) {
      const message = err.response?.data?.message || err.message || "Mobile number not found.";
      toast.error(message);
    } finally {
      setForgotBusy(false);
    }
  };

  useEffect(() => {
    const handleScriptLoad = () => setGsiLoaded(true);
    
    if (window.google) {
      setGsiLoaded(true);
    } else {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = handleScriptLoad;
      document.body.appendChild(script);
    }
  }, []);

  useEffect(() => {
    if (gsiLoaded && window.google && !getToken()) {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (!clientId) return;

      window.google.accounts.id.initialize({
        client_id: clientId,
        auto_select: true,
        callback: async (response: any) => {
          setBusy(true);
          try {
            const { token } = await authService.loginWithGoogle(response.credential);
            setToken(token);
            updateEchoAuth();
            await refreshRole();
            toast.success("Signed in with Google");
            nav({ to: "/dashboard" });
          } catch (err: any) {
            const message = err.response?.data?.message || err.message || "Google Sign-in failed";
            toast.error(message);
          } finally {
            setBusy(false);
          }
        },
      });

      const timer = setTimeout(() => {
        const btnEl = document.getElementById(`google-btn-${expectedRole}`);
        if (btnEl && window.google) {
          window.google.accounts.id.renderButton(
            btnEl,
            { theme: "outline", size: "large", text: "signin_with", shape: "rectangular", width: 350 }
          );
          window.google.accounts.id.prompt();
        }
      }, 50);

      return () => clearTimeout(timer);
    }
  }, [gsiLoaded, expectedRole]);

  const handleFallbackClick = () => {
    toast.error("Google Client ID is missing. Please add VITE_GOOGLE_CLIENT_ID to your environment variables (.env.production or Render config).", {
      duration: 6000
    });
  };

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
    <div className="space-y-4">
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
          <div className="flex justify-between items-center">
            <Label htmlFor={`pw-${expectedRole}`}>Password</Label>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => {
                setForgotMessage("");
                setForgotMobile("");
                setIsForgotOpen(true);
              }}
            >
              Forgot Password?
            </button>
          </div>
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
      </form>

      <Dialog open={isForgotOpen} onOpenChange={setIsForgotOpen}>
        <DialogContent className="max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle>Forgot Password</DialogTitle>
          </DialogHeader>
          {forgotMessage ? (
            <div className="space-y-4 py-4 text-center">
              <p className="text-sm font-semibold text-primary">{forgotMessage}</p>
              <Button onClick={() => { setIsForgotOpen(false); setForgotMessage(""); setForgotMobile(""); }} className="w-full">
                Close
              </Button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4 py-2">
              <div className="space-y-1">
                <Label htmlFor="forgot-mobile">Registered Mobile Number</Label>
                <Input
                  id="forgot-mobile"
                  inputMode="tel"
                  value={forgotMobile}
                  onChange={(e) => setForgotMobile(e.target.value)}
                  placeholder="e.g. 9876543210"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={forgotBusy}>
                {forgotBusy ? "Checking..." : "Submit"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <div className="relative my-3">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">Or</span>
        </div>
      </div>

      {import.meta.env.VITE_GOOGLE_CLIENT_ID ? (
        <div className="flex justify-center w-full min-h-[44px]" id={`google-btn-${expectedRole}`}></div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full flex items-center justify-center gap-2 h-11"
          onClick={handleFallbackClick}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
          </svg>
          Sign in with Google
        </Button>
      )}

      {expectedRole === "user" && (
        <div className="space-y-2 pt-1">
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
    </div>
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
