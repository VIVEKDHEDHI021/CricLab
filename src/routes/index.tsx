import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authService } from "@/lib/services/authService";
import { setToken, getToken } from "@/lib/api";
import { useAuth, Role } from "@/hooks/useAuth";
import { updateEchoAuth } from "@/lib/echo";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Eye, EyeOff, Lock, Smartphone, Award, Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({
  component: LoginPage,
});

function LoginPage() {
  const { user, role: currentRole, loading } = useAuth();
  const nav = useNavigate();

  // Form states
  const [role, setRole] = useState<Role>("user");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [busy, setBusy] = useState(false);

  // Forgot password states
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [forgotMobile, setForgotMobile] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotMessage, setForgotMessage] = useState("");

  useEffect(() => {
    if (!loading && user && currentRole) {
      nav({ to: "/dashboard" });
    }
  }, [user, currentRole, loading, nav]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const remembered = localStorage.getItem("criclab_remembered_mobile");
      if (remembered) {
        setMobile(remembered);
        setRememberMe(true);
      }
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070303] flex items-center justify-center">
        <div className="text-sm font-bold tracking-widest text-white/50 animate-pulse uppercase">
          Verifying Session…
        </div>
      </div>
    );
  }

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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mobile.trim() || !password) {
      return toast.error("Mobile and password required");
    }

    setBusy(true);
    try {
      const { token, user: loggedUser } = await authService.login(mobile, password, role ?? "user");
      
      setToken(token);
      updateEchoAuth();
      
      if (rememberMe) {
        localStorage.setItem("criclab_remembered_mobile", mobile);
      } else {
        localStorage.removeItem("criclab_remembered_mobile");
      }
      
      toast.success("Signed in successfully!");
      nav({ to: "/dashboard" });
    } catch (err: any) {
      let message = "Authentication failed. Please check your connection and try again.";
      if (err.code === "ECONNABORTED" || err.message?.includes("timeout")) {
        message = "Connection timed out. The backend API is taking too long to respond. Please try again.";
      } else if (err.response) {
        message = err.response.data?.message || `Auth failed: ${err.response.statusText}`;
      } else if (err.request) {
        message = "Network Error: Cannot connect to the server. Please check if your backend is online.";
      } else {
        message = err.message || message;
      }
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-primary/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-amber-500/5 blur-[120px] pointer-events-none" />

      <header className="px-4 py-8 flex justify-center items-center">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-orange-500 flex items-center justify-center shadow-lg shadow-primary/20">
            <Award className="h-6 w-6 text-slate-950 font-black" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-orange-400">Cric</span>Lab
          </h1>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 pb-16">
        <Card className="w-full max-w-md p-6 bg-slate-900/60 backdrop-blur-md border-slate-800 rounded-3xl shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-primary via-orange-500 to-amber-500" />
          
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-slate-100">Welcome Back</h2>
            <p className="text-xs text-slate-400 mt-1">Please log in to manage your cricket matches</p>
          </div>

          <div className="space-y-4">
            {/* Role Selection Tabs */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Login Role</Label>
              <Tabs value={role || "user"} onValueChange={(val) => setRole(val as Role)} className="w-full">
                <TabsList className="grid w-full grid-cols-3 bg-slate-950 border border-slate-800/80 p-1 rounded-xl animate-fade-in">
                  <TabsTrigger value="user" className="data-[state=active]:bg-primary data-[state=active]:text-slate-950 font-bold transition-all text-xs">User</TabsTrigger>
                  <TabsTrigger value="scorer" className="data-[state=active]:bg-primary data-[state=active]:text-slate-950 font-bold transition-all text-xs">Scorer</TabsTrigger>
                  <TabsTrigger value="admin" className="data-[state=active]:bg-primary data-[state=active]:text-slate-950 font-bold transition-all text-xs">Admin</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <form onSubmit={submit} className="space-y-4">
              {/* Mobile Field */}
              <div className="space-y-1.5">
                <Label htmlFor="mobile" className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Mobile Number</Label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                    <Smartphone className="h-4 w-4" />
                  </span>
                  <Input
                    id="mobile"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder="9876543210"
                    className="pl-10 h-11 bg-slate-950 border-slate-800 text-slate-100 rounded-xl focus-visible:ring-primary focus-visible:border-primary placeholder:text-slate-600 font-medium"
                    required
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <Label htmlFor="password" className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Password</Label>
                  <button
                    type="button"
                    className="text-xs text-primary hover:text-orange-400 transition font-medium"
                    onClick={() => {
                      setForgotMessage("");
                      setForgotMobile("");
                      setIsForgotOpen(true);
                    }}
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                    <Lock className="h-4 w-4" />
                  </span>
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    className="pl-10 pr-10 h-11 bg-slate-950 border-slate-800 text-slate-100 rounded-xl focus-visible:ring-primary focus-visible:border-primary placeholder:text-slate-600 font-medium"
                    required
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Remember Me */}
              <div className="flex items-center space-x-2 py-1">
                <Checkbox
                  id="remember"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(!!checked)}
                  className="border-slate-700 data-[state=checked]:bg-primary data-[state=checked]:text-slate-950"
                />
                <Label htmlFor="remember" className="text-xs font-semibold text-slate-400 cursor-pointer select-none">
                  Remember my mobile number
                </Label>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full h-11 rounded-xl bg-gradient-to-r from-primary to-orange-500 hover:from-primary hover:to-orange-600 text-slate-950 font-black tracking-wide uppercase shadow-lg shadow-primary/10 transition duration-300 active:scale-[0.98]"
                disabled={busy}
              >
                {busy ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin animate-infinite" />
                    Please wait…
                  </span>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>

            {/* Admin Register dialog trigger */}
            {role === "admin" && (
              <div className="pt-2 border-t border-slate-800/80">
                <AdminRegisterDialog />
              </div>
            )}

            {role === "user" && (
              <div className="text-center text-xs text-slate-400 pt-2 border-t border-slate-800/80">
                <span>New to CricLab? </span>
                <Link to="/register" className="text-primary hover:underline font-bold transition">
                  Register here
                </Link>
              </div>
            )}
          </div>
        </Card>
      </main>

      <Dialog open={isForgotOpen} onOpenChange={setIsForgotOpen}>
        <DialogContent className="max-w-md bg-slate-900 border-slate-800 text-slate-100 rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-100">Forgot Password</DialogTitle>
          </DialogHeader>
          {forgotMessage ? (
            <div className="space-y-4 py-4 text-center">
              <p className="text-sm font-semibold text-primary">{forgotMessage}</p>
              <Button onClick={() => { setIsForgotOpen(false); setForgotMessage(""); setForgotMobile(""); }} className="w-full h-10 rounded-xl bg-primary text-slate-950 font-bold">
                Close
              </Button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="forgot-mobile" className="text-xs text-slate-400 font-semibold">Registered Mobile Number</Label>
                <Input
                  id="forgot-mobile"
                  type="tel"
                  inputMode="tel"
                  value={forgotMobile}
                  onChange={(e) => setForgotMobile(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="h-11 bg-slate-950 border-slate-800 text-slate-100 rounded-xl"
                  required
                />
              </div>
              <Button type="submit" className="w-full h-11 rounded-xl bg-primary text-slate-950 font-bold" disabled={forgotBusy}>
                {forgotBusy ? <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> : null}
                {forgotBusy ? "Checking..." : "Submit"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdminRegisterDialog() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const { setAuthUser } = useAuth();
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
      const { token, user } = await authService.registerAdmin(
        name,
        mobile,
        username,
        form.password,
        form.password_confirmation,
        form.developer_password,
      );
      setToken(token);
      updateEchoAuth();
      setAuthUser(user);
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
        <Button type="button" variant="outline" className="w-full h-11 rounded-xl border-slate-800 text-slate-300 hover:bg-slate-800 transition font-bold mt-2">
          Register new admin
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-800 text-slate-100 rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-100">Register admin account</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-slate-400">
          You need the developer password set on the server (Render env:{" "}
          <code className="text-primary font-bold">ADMIN_REGISTRATION_PASSWORD</code>).
        </p>
        <form onSubmit={submit} className="space-y-3.5 mt-4">
          <div className="space-y-1">
            <Label className="text-slate-400 text-xs">Full name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Your name"
              className="h-10 bg-slate-950 border-slate-800 text-slate-100 rounded-xl"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-slate-400 text-xs">Username</Label>
            <Input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="admin_username"
              className="h-10 bg-slate-950 border-slate-800 text-slate-100 rounded-xl"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-slate-400 text-xs">Mobile number</Label>
            <Input
              inputMode="tel"
              value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value })}
              placeholder="9429442013"
              className="h-10 bg-slate-950 border-slate-800 text-slate-100 rounded-xl"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-slate-400 text-xs">Password</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="h-10 bg-slate-950 border-slate-800 text-slate-100 rounded-xl"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-slate-400 text-xs">Confirm password</Label>
            <Input
              type="password"
              value={form.password_confirmation}
              onChange={(e) => setForm({ ...form, password_confirmation: e.target.value })}
              className="h-10 bg-slate-950 border-slate-800 text-slate-100 rounded-xl"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-slate-400 text-xs">Developer password</Label>
            <Input
              type="password"
              value={form.developer_password}
              onChange={(e) => setForm({ ...form, developer_password: e.target.value })}
              placeholder="From server config"
              className="h-10 bg-slate-950 border-slate-800 text-slate-100 rounded-xl"
            />
          </div>
          <Button type="submit" className="w-full h-11 bg-primary text-slate-950 font-bold rounded-xl mt-4" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> : null}
            {busy ? "Creating…" : "Create admin account"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
