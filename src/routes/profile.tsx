import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { authService } from "@/lib/services/authService";
import { playerService, type PlayerProfile, type Player } from "@/lib/services/playerService";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { 
  Edit, Share2, Trophy, Calendar, Shield, Award, Sparkles, Activity, 
  ChevronRight, User, LogOut, Loader2, Info
} from "lucide-react";

declare global {
  interface Window {
    google?: any;
  }
}

export const Route = createFileRoute("/profile")({
  component: UserProfilePage,
});

const ACHIEVEMENT_DEFINITIONS = [
  { id: "first_match", title: "Debutant", desc: "Played first match", icon: "🏅" },
  { id: "first_fifty", title: "Half Centurion", desc: "Scored 50+ runs in an innings", icon: "🏏" },
  { id: "first_century", title: "Centurion", desc: "Scored 100+ runs in an innings", icon: "💯" },
  { id: "first_3_wickets", title: "Triple Strike", desc: "Took 3 wickets in an innings", icon: "⚡" },
  { id: "first_5_wickets", title: "Five-Star Bowler", desc: "Took 5 wickets in an innings", icon: "🖐️" },
  { id: "man_of_the_match", title: "Match Winner", desc: "Earned Player of the Match honors", icon: "🏆" },
  { id: "tournament_mvp", title: "Tournament MVP", desc: "Achieved highest impact rating", icon: "👑" },
];

function UserProfilePage() {
  const { user, profileName, mobile, role, signOut, refreshRole } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);

  const playerAchievements = useMemo(() => {
    if (!profile?.player?.id) return [];
    try {
      const stored = localStorage.getItem(`criclab_achievements_${profile.player.id}`);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  }, [profile]);
  
  // Edit Modal states
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    mobile: "",
    role: "",
    batting_style: "",
    bowling_style: "",
    jersey_number: "",
    catches: 0,
    run_outs: 0,
    age: "" as string | number,
    city: "",
  });
  const [saving, setSaving] = useState(false);

  // Google connection states
  const [gsiLoaded, setGsiLoaded] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);

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
    if (gsiLoaded && window.google && user && !user.google_id && !loading) {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (!clientId) return;

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: any) => {
          setLinkBusy(true);
          try {
            const res = await authService.linkGoogle(response.credential);
            toast.success(res.message || "Google account connected!");
            await refreshRole();
          } catch (err: any) {
            const message = err.response?.data?.message || err.message || "Google connection failed";
            toast.error(message);
          } finally {
            setLinkBusy(false);
          }
        },
      });

      const timer = setTimeout(() => {
        const btnEl = document.getElementById("google-link-btn");
        if (btnEl && window.google) {
          window.google.accounts.id.renderButton(
            btnEl,
            { theme: "outline", size: "medium", text: "signup_with", shape: "rectangular" }
          );
        }
      }, 50);

      return () => clearTimeout(timer);
    }
  }, [gsiLoaded, user, loading]);

  const handleLinkFallbackClick = () => {
    toast.error("Google Client ID is missing. Please add VITE_GOOGLE_CLIENT_ID to your environment variables (.env.production or Render config).", {
      duration: 6000
    });
  };

  const renderGoogleSection = () => {
    return (
      <Card className="p-5 border-border bg-card/60 backdrop-blur rounded-2xl space-y-3">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <svg className="h-4 w-4 text-primary" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
          </svg>
          Google Connection
        </h3>
        {user?.google_id ? (
          <div className="flex items-center justify-between text-xs bg-primary/10 border border-primary/20 p-3 rounded-xl text-primary font-medium">
            <span>Connected as: {user.email}</span>
            <span className="bg-primary text-primary-foreground px-1.5 py-0.5 rounded text-[10px] uppercase font-bold">Linked</span>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Link your CricLab profile to a Google account for faster, one-click login in the future.
            </p>
            {import.meta.env.VITE_GOOGLE_CLIENT_ID ? (
              <div className="flex justify-start min-h-[40px] pt-1" id="google-link-btn"></div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full flex items-center justify-center gap-2 h-9 text-xs"
                onClick={handleLinkFallbackClick}
                disabled={linkBusy}
              >
                Connect Google Account
              </Button>
            )}
          </div>
        )}
      </Card>
    );
  };

  const fetchProfile = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const players = await playerService.getPlayers();
      const found = players.find(p => p.mobile === user.mobile || p.user_id === user.id);
      
      if (found) {
        const data = await playerService.getPlayerProfile(found.id);
        setProfile(data);

        // Populate Edit Form
        setEditForm({
          name: data.player.name || "",
          mobile: data.player.mobile || "",
          role: data.player.role || "",
          batting_style: data.player.batting_style || "",
          bowling_style: data.player.bowling_style || "",
          jersey_number: data.player.jersey_number || "",
          catches: data.player.catches || 0,
          run_outs: data.player.run_outs || 0,
          age: data.player.age ?? "",
          city: data.player.city || "",
        });
      } else {
        setProfile(null);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to load profile details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [user]);

  const handleShare = async () => {
    if (!profile?.player.id) {
      toast.error("No player profile available to share");
      return;
    }
    const shareUrl = `${window.location.origin}/players/${profile.player.id}`;
    const shareData = {
      title: `${profile.player.name} - CricLab Player Profile`,
      text: `Checkout ${profile.player.name}'s statistics, records, and performance history on CricLab!`,
      url: shareUrl,
    };

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        toast.success("Profile shared successfully!");
      } catch (err: any) {
        if (err.name !== "AbortError") {
          navigator.clipboard.writeText(shareUrl);
          toast.success("Profile link copied to clipboard!");
        }
      }
    } else {
      navigator.clipboard.writeText(shareUrl);
      toast.success("Profile link copied to clipboard!");
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      const dataToSend = {
        ...editForm,
        age: editForm.age === "" ? null : Number(editForm.age),
      };
      await playerService.updatePlayerProfile(profile.player.id, dataToSend);
      toast.success("Profile updated successfully!");
      setIsEditOpen(false);
      fetchProfile();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  if (loading) {
    return (
      <AppShell title="Profile">
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">Loading your profile...</p>
        </div>
      </AppShell>
    );
  }

  // If user is logged in but doesn't have an active Player profile record in DB
  if (!profile) {
    return (
      <AppShell title="Profile">
        <div className="max-w-md mx-auto space-y-5 pb-10">
          <Card className="p-5 border-border bg-card/60 backdrop-blur rounded-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-foreground">{profileName || "User"}</h1>
                <p className="text-xs text-muted-foreground">{mobile}</p>
              </div>
              <Badge className="capitalize">{role}</Badge>
            </div>
            <div className="mt-4 pt-4 border-t border-border/40 flex justify-end">
              <Button variant="destructive" size="sm" className="w-full gap-2 text-xs" onClick={handleSignOut}>
                <LogOut className="h-4 w-4" /> Sign out
              </Button>
            </div>
          </Card>

          {renderGoogleSection()}

          <Card className="p-6 border-dashed border-border/80 bg-card/20 rounded-2xl flex flex-col items-center text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Info className="h-6 w-6" />
            </div>
            <h3 className="font-bold text-sm">No Cricket Profile Linked</h3>
            <p className="text-xs text-muted-foreground max-w-xs">
              Scorers can add you to matches using your registered mobile number <strong>{mobile}</strong>, which will automatically link your career stats here!
            </p>
            <div className="pt-2 w-full">
              <Link to="/setup">
                <Button className="w-full text-xs font-bold py-2 rounded-xl">
                  Set Up Player Profile
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </AppShell>
    );
  }

  const { player, career, tournament, recent, history, teams } = profile;

  return (
    <AppShell title="Profile">
      <div className="max-w-md mx-auto space-y-5 pb-10">
        
        {/* Profile Card Header */}
        <Card className="p-5 border-border bg-card/60 backdrop-blur rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-full blur-3xl"></div>
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-4">
              <div className="relative">
                <div className="h-16 w-16 rounded-full border-2 border-primary/80 flex items-center justify-center bg-muted text-muted-foreground font-bold text-2xl overflow-hidden">
                  {player.avatar ? (
                    <img src={player.avatar} alt={player.name} className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-8 w-8 text-primary" />
                  )}
                </div>
                {player.jersey_number && (
                  <span className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground text-[10px] font-extrabold px-1.5 py-0.5 rounded-full border border-card shadow">
                    #{player.jersey_number}
                  </span>
                )}
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground flex items-center gap-1.5">
                  {player.name}
                  <Badge className="text-[9px] h-4 uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">{role}</Badge>
                </h1>
                <p className="text-xs text-muted-foreground">
                  {player.team?.name || "No Team Assigned"}
                </p>
                {player.role && (
                  <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/15 text-primary border border-primary/20">
                    {player.role}
                  </span>
                )}
              </div>
            </div>

            <div className="flex space-x-1">
              <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={handleShare}>
                <Share2 className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" onClick={() => setIsEditOpen(true)}>
                <Edit className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Quick Stats Summary Grid */}
          <div className="grid grid-cols-3 gap-2 mt-5 border-t border-border/40 pt-4 text-center">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Matches</p>
              <p className="text-lg font-bold text-foreground">{career.matches}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Runs</p>
              <p className="text-lg font-bold text-primary">{career.runs}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Wickets</p>
              <p className="text-lg font-bold text-foreground">{career.wickets}</p>
            </div>
          </div>

          {/* Sign Out Trigger */}
          <Button variant="destructive" size="sm" className="w-full mt-4 gap-2 text-xs h-9" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </Card>

        {renderGoogleSection()}

        {/* Dynamic Detail Tabs */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid grid-cols-5 w-full bg-card/40 border border-border/40 p-1 rounded-xl">
            <TabsTrigger value="overview" className="text-[10px] px-1 py-1.5">Overview</TabsTrigger>
            <TabsTrigger value="batting" className="text-[10px] px-1 py-1.5">Batting</TabsTrigger>
            <TabsTrigger value="bowling" className="text-[10px] px-1 py-1.5">Bowling</TabsTrigger>
            <TabsTrigger value="matches" className="text-[10px] px-1 py-1.5">Matches</TabsTrigger>
            <TabsTrigger value="teams" className="text-[10px] px-1 py-1.5">Teams</TabsTrigger>
          </TabsList>

          {/* Overview Tab Content */}
          <TabsContent value="overview" className="space-y-4 mt-3">
            {/* Awards & Achievements Card */}
            <Card className="p-4 border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-yellow-500/10 relative overflow-hidden shadow">
              <div className="absolute top-[-20px] right-[-20px] w-16 h-16 bg-amber-500/10 rounded-full blur-xl pointer-events-none" />
              <h3 className="text-xs font-bold text-amber-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Trophy className="h-3.5 w-3.5" /> Awards & Honours
              </h3>
              <div className="grid grid-cols-3 gap-2.5 text-center">
                <div className="bg-card/70 border border-amber-500/25 p-2.5 rounded-xl flex flex-col justify-between items-center shadow-sm">
                  <span className="text-[18px]">🌟</span>
                  <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider mt-1 leading-none">Man of Match</span>
                  <p className="text-lg font-black text-foreground mt-1.5 leading-none">{profile.awards?.man_of_the_match ?? 0}</p>
                </div>
                <div className="bg-card/70 border border-primary/20 p-2.5 rounded-xl flex flex-col justify-between items-center shadow-sm">
                  <span className="text-[18px]">🏏</span>
                  <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider mt-1 leading-none">Best Batsman</span>
                  <p className="text-lg font-black text-primary mt-1.5 leading-none">{profile.awards?.best_batsman ?? 0}</p>
                </div>
                <div className="bg-card/70 border border-purple-500/20 p-2.5 rounded-xl flex flex-col justify-between items-center shadow-sm">
                  <span className="text-[18px]">🥎</span>
                  <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider mt-1 leading-none">Best Bowler</span>
                  <p className="text-lg font-black text-purple-500 mt-1.5 leading-none">{profile.awards?.best_bowler ?? 0}</p>
                </div>
              </div>
            </Card>

            {/* Career Achievements Card */}
            <Card className="p-4 border border-border/40 bg-gradient-to-br from-slate-900/60 to-slate-950/80 backdrop-blur-md">
              <h3 className="text-xs font-bold text-primary uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Trophy className="h-3.5 w-3.5 text-primary" /> Permanent Career Achievements
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {ACHIEVEMENT_DEFINITIONS.map((ach) => {
                  const isUnlocked = playerAchievements.includes(ach.id);
                  return (
                    <div
                      key={ach.id}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-all duration-300 ${
                        isUnlocked
                          ? "bg-amber-500/10 border-amber-500/40 text-foreground shadow-[0_0_12px_rgba(245,158,11,0.15)]"
                          : "bg-muted/10 border-border/30 text-muted-foreground/60 opacity-60"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className={`text-2xl shrink-0 ${isUnlocked ? "" : "grayscale"}`}>{ach.icon}</span>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold truncate">{ach.title}</h4>
                          <p className="text-[10px] text-muted-foreground truncate">{ach.desc}</p>
                        </div>
                      </div>
                      {isUnlocked ? (
                        <span className="text-[10px] bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded font-black uppercase tracking-wider scale-90 shrink-0">
                          Unlocked
                        </span>
                      ) : (
                        <span className="text-xs shrink-0">🔒</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="p-4 border-border bg-card/40">
              <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-3 flex items-center">
                <Sparkles className="h-3 w-3 mr-1.5" /> Player Info
              </h3>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">Player Role</span>
                  <p className="font-semibold mt-0.5 text-foreground">{player.role || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Age</span>
                  <p className="font-semibold mt-0.5 text-foreground">{player.age ? `${player.age} years` : "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Batting Style</span>
                  <p className="font-semibold mt-0.5 text-foreground">{player.batting_style || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Bowling Style</span>
                  <p className="font-semibold mt-0.5 text-foreground">{player.bowling_style || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Hometown / City</span>
                  <p className="font-semibold mt-0.5 text-foreground">{player.city || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Jersey Number</span>
                  <p className="font-semibold mt-0.5 text-foreground">{player.jersey_number ? `#${player.jersey_number}` : "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Catches</span>
                  <p className="font-semibold mt-0.5 text-foreground">{career.catches}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Run Outs</span>
                  <p className="font-semibold mt-0.5 text-foreground">{career.run_outs}</p>
                </div>
              </div>
            </Card>

            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Recent Matches</h3>
              {recent.length === 0 ? (
                <div className="text-center text-muted-foreground text-xs py-6 bg-card/25 border border-dashed border-border rounded-xl">
                  No recent matches played
                </div>
              ) : (
                recent.map((hist, i) => (
                  <Link key={i} to="/matches/$id" params={{ id: hist.match_id }}>
                    <Card className="p-3 border-border bg-card/40 hover:bg-card/75 transition flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-3">
                        <div className="h-7 w-7 rounded bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                          vs
                        </div>
                        <div>
                          <p className="text-xs font-bold text-foreground">vs {hist.opponent}</p>
                          <p className="text-[9px] text-muted-foreground">{new Date(hist.match_date).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="text-right flex items-center space-x-2">
                        <div className="text-xs font-bold text-foreground">
                          {hist.runs}{hist.is_out ? "" : "*"}
                          {hist.wickets > 0 && <span className="text-primary ml-1.5">({hist.wickets} Wkt)</span>}
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </Card>
                  </Link>
                ))
              )}
            </div>
          </TabsContent>

          {/* Batting Tab Content */}
          <TabsContent value="batting" className="space-y-4 mt-3">
            <Card className="p-4 border-border bg-card/40">
              <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-4 flex items-center">
                <Trophy className="h-3.5 w-3.5 mr-1.5" /> Career Batting Stats
              </h3>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="bg-background/45 p-2 rounded-lg border border-border/20">
                  <span className="text-[10px] text-muted-foreground uppercase">Innings</span>
                  <p className="text-base font-bold text-foreground mt-0.5">{career.innings}</p>
                </div>
                <div className="bg-background/45 p-2 rounded-lg border border-border/20">
                  <span className="text-[10px] text-muted-foreground uppercase">Runs</span>
                  <p className="text-base font-bold text-primary mt-0.5">{career.runs}</p>
                </div>
                <div className="bg-background/45 p-2 rounded-lg border border-border/20">
                  <span className="text-[10px] text-muted-foreground uppercase">Average</span>
                  <p className="text-base font-bold text-foreground mt-0.5">{career.average}</p>
                </div>
                <div className="bg-background/45 p-2 rounded-lg border border-border/20">
                  <span className="text-[10px] text-muted-foreground uppercase">Strike Rate</span>
                  <p className="text-base font-bold text-foreground mt-0.5">{career.strike_rate}</p>
                </div>
                <div className="bg-background/45 p-2 rounded-lg border border-border/20">
                  <span className="text-[10px] text-muted-foreground uppercase">Highest Score</span>
                  <p className="text-base font-bold text-foreground mt-0.5">{career.highest_score}</p>
                </div>
                <div className="bg-background/45 p-2 rounded-lg border border-border/20 flex justify-around items-center">
                  <div>
                    <span className="text-[9px] text-muted-foreground block uppercase">4s</span>
                    <span className="text-sm font-bold">{career.fours}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-muted-foreground block uppercase">6s</span>
                    <span className="text-sm font-bold">{career.sixes}</span>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-4 border-border bg-card/40">
              <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-3 flex items-center">
                <Award className="h-3.5 w-3.5 mr-1.5" /> Tournament Statistics
              </h3>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="flex justify-between border-b border-border/20 pb-1.5">
                  <span className="text-muted-foreground">Tournament Runs</span>
                  <span className="font-bold">{tournament.runs}</span>
                </div>
                <div className="flex justify-between border-b border-border/20 pb-1.5">
                  <span className="text-muted-foreground">Average</span>
                  <span className="font-bold">{tournament.average}</span>
                </div>
                <div className="flex justify-between border-b border-border/20 pb-1.5">
                  <span className="text-muted-foreground">Strike Rate</span>
                  <span className="font-bold">{tournament.strike_rate}</span>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* Bowling Tab Content */}
          <TabsContent value="bowling" className="space-y-4 mt-3">
            <Card className="p-4 border-border bg-card/40">
              <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-4 flex items-center">
                <Activity className="h-3.5 w-3.5 mr-1.5" /> Career Bowling Stats
              </h3>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="bg-background/45 p-2 rounded-lg border border-border/20">
                  <span className="text-[10px] text-muted-foreground uppercase">Wickets</span>
                  <p className="text-base font-bold text-primary mt-0.5">{career.wickets}</p>
                </div>
                <div className="bg-background/45 p-2 rounded-lg border border-border/20">
                  <span className="text-[10px] text-muted-foreground uppercase">Economy</span>
                  <p className="text-base font-bold text-foreground mt-0.5">{career.economy}</p>
                </div>
                <div className="bg-background/45 p-2 rounded-lg border border-border/20">
                  <span className="text-[10px] text-muted-foreground uppercase">Average</span>
                  <p className="text-base font-bold text-foreground mt-0.5">{career.bowling_average}</p>
                </div>
                <div className="bg-background/45 p-2 rounded-lg border border-border/20">
                  <span className="text-[10px] text-muted-foreground uppercase">Best Bowling</span>
                  <p className="text-base font-bold text-foreground mt-0.5">{career.best_bowling}</p>
                </div>
                <div className="bg-background/45 p-2 rounded-lg border border-border/20 col-span-2">
                  <span className="text-[10px] text-muted-foreground uppercase">Maiden Overs</span>
                  <p className="text-base font-bold text-foreground mt-0.5">{career.maidens}</p>
                </div>
              </div>
            </Card>

            <Card className="p-4 border-border bg-card/40">
              <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-3 flex items-center">
                <Award className="h-3.5 w-3.5 mr-1.5" /> Tournament Statistics
              </h3>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="flex justify-between border-b border-border/20 pb-1.5">
                  <span className="text-muted-foreground">Tournament Wickets</span>
                  <span className="font-bold">{tournament.wickets}</span>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* Matches History Tab Content */}
          <TabsContent value="matches" className="space-y-3 mt-3">
            {history.length === 0 ? (
              <div className="text-center text-muted-foreground text-xs py-8 bg-card/25 border border-dashed border-border rounded-xl">
                No matches played yet
              </div>
            ) : (
              history.map((hist, i) => (
                <Link key={i} to="/matches/$id" params={{ id: hist.match_id }}>
                  <Card className="p-4 border-border bg-card/40 hover:bg-card/75 transition space-y-2 mb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-foreground">vs {hist.opponent}</p>
                        <p className="text-[9px] text-muted-foreground flex items-center">
                          <Calendar className="h-2.5 w-2.5 mr-1" />
                          {new Date(hist.match_date).toLocaleDateString()}
                        </p>
                      </div>
                      <span className="text-[10px] font-semibold text-primary border border-primary/20 px-2 py-0.5 rounded bg-primary/10">
                        {hist.result.includes("won") ? "Result" : "Scorecard"}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1 pt-2 border-t border-border/20 text-center text-xs">
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Batting</span>
                        <span className="font-semibold">
                          {hist.runs}{hist.is_out ? "" : "*"} <span className="text-[9px] text-muted-foreground">({hist.balls}b)</span>
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Bowling</span>
                        <span className="font-semibold">
                          {hist.bowling_overs !== "0.0" ? `${hist.wickets}/${hist.bowling_runs} (${hist.bowling_overs})` : "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-end text-[10px] text-muted-foreground">
                        View details <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                      </div>
                    </div>
                  </Card>
                </Link>
              ))
            )}
          </TabsContent>

          {/* Teams Tab Content */}
          <TabsContent value="teams" className="space-y-3 mt-3">
            {teams.length === 0 ? (
              <div className="text-center text-muted-foreground text-xs py-8 bg-card/25 border border-dashed border-border rounded-xl">
                No teams registered
              </div>
            ) : (
              teams.map((t, i) => (
                <Card key={i} className="p-4 border-border bg-card/40 flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                      <Shield className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{t.name}</p>
                      {player.team_id === t.id && (
                        <span className="text-[9px] text-primary font-semibold">Primary Team</span>
                      )}
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>

        {/* Edit Profile Modal Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="max-w-md bg-card border-border text-foreground">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold">Edit Player Profile</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSaveProfile} className="space-y-4 py-2">
              <div className="space-y-1">
                <Label htmlFor="edit-name">Full Name</Label>
                <Input
                  id="edit-name"
                  value={editForm.name}
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="Full Name"
                  required
                  className="bg-background border-border"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="edit-mobile">Mobile Number</Label>
                <Input
                  id="edit-mobile"
                  value={editForm.mobile}
                  onChange={e => setEditForm({ ...editForm, mobile: e.target.value })}
                  placeholder="Mobile number"
                  className="bg-background border-border"
                  disabled
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="edit-jersey">Jersey Number</Label>
                  <Input
                    id="edit-jersey"
                    value={editForm.jersey_number}
                    onChange={e => setEditForm({ ...editForm, jersey_number: e.target.value })}
                    placeholder="e.g. 7"
                    className="bg-background border-border"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-role">Player Role</Label>
                  <Select
                    value={editForm.role}
                    onValueChange={val => setEditForm({ ...editForm, role: val })}
                  >
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue placeholder="Select Role" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="Batter">Batter</SelectItem>
                      <SelectItem value="Bowler">Bowler</SelectItem>
                      <SelectItem value="All-rounder">All-rounder</SelectItem>
                      <SelectItem value="Wicket keeper">Wicket keeper</SelectItem>
                      <SelectItem value="Captain">Captain</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="edit-batting">Batting Style</Label>
                  <Select
                    value={editForm.batting_style}
                    onValueChange={val => setEditForm({ ...editForm, batting_style: val })}
                  >
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue placeholder="Select Style" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="Right-hand bat">Right-hand bat</SelectItem>
                      <SelectItem value="Left-hand bat">Left-hand bat</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-bowling">Bowling Style</Label>
                  <Select
                    value={editForm.bowling_style}
                    onValueChange={val => setEditForm({ ...editForm, bowling_style: val })}
                  >
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue placeholder="Select Style" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="Right-arm fast">Right-arm fast</SelectItem>
                      <SelectItem value="Right-arm spin">Right-arm spin</SelectItem>
                      <SelectItem value="Left-arm fast">Left-arm fast</SelectItem>
                      <SelectItem value="Left-arm spin">Left-arm spin</SelectItem>
                      <SelectItem value="None">None</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="edit-age">Age</Label>
                  <Input
                    id="edit-age"
                    type="number"
                    value={editForm.age}
                    onChange={e => setEditForm({ ...editForm, age: e.target.value === "" ? "" : parseInt(e.target.value) || "" })}
                    placeholder="e.g. 25"
                    className="bg-background border-border"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-city">City / Hometown</Label>
                  <Input
                    id="edit-city"
                    value={editForm.city}
                    onChange={e => setEditForm({ ...editForm, city: e.target.value })}
                    placeholder="e.g. Mumbai"
                    className="bg-background border-border"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="edit-catches">Catches (Override)</Label>
                  <Input
                    id="edit-catches"
                    type="number"
                    value={editForm.catches}
                    onChange={e => setEditForm({ ...editForm, catches: parseInt(e.target.value) || 0 })}
                    className="bg-background border-border"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-runouts">Run Outs (Override)</Label>
                  <Input
                    id="edit-runouts"
                    type="number"
                    value={editForm.run_outs}
                    onChange={e => setEditForm({ ...editForm, run_outs: parseInt(e.target.value) || 0 })}
                    className="bg-background border-border"
                  />
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

      </div>
    </AppShell>
  );
}