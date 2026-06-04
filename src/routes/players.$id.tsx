import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { playerService, type PlayerProfile, type Player } from "@/lib/services/playerService";
import { friendService, type Friend } from "@/lib/services/friendService";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { 
  Edit, Share2, UserPlus, UserMinus, Trophy, Calendar, 
  Shield, Award, Sparkles, Activity, ChevronRight, User
} from "lucide-react";

export const Route = createFileRoute("/players/$id")({
  component: PlayerProfilePage,
});

function PlayerProfilePage() {
  const { id } = Route.useParams();
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  
  // Follow/Friend states
  const [friends, setFriends] = useState<Friend[]>([]);
  const [connecting, setConnecting] = useState(false);

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

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const data = await playerService.getPlayerProfile(id);
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

      // Fetch friends for connection check
      if (currentUser) {
        const friendList = await friendService.getFriends();
        setFriends(friendList);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to load player profile");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [id, currentUser]);

  const isOwnerOrAdmin = useMemo(() => {
    if (!currentUser || !profile) return false;
    return currentUser.role === "admin" || profile.player.user_id === currentUser.id;
  }, [currentUser, profile]);

  const isConnected = useMemo(() => {
    if (!profile?.player.mobile) return false;
    return friends.some(f => f.profile?.mobile === profile.player.mobile);
  }, [friends, profile]);

  const friendRecordId = useMemo(() => {
    if (!profile?.player.mobile) return null;
    return friends.find(f => f.profile?.mobile === profile.player.mobile)?.id ?? null;
  }, [friends, profile]);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Profile link copied to clipboard!");
  };

  const handleConnectionToggle = async () => {
    if (!profile?.player.mobile) return;
    setConnecting(true);
    try {
      if (isConnected && friendRecordId) {
        await friendService.removeFriend(friendRecordId);
        toast.success("Removed connection");
      } else {
        await friendService.addFriend(profile.player.mobile);
        toast.success("Connected successfully!");
      }
      // Refresh friends list
      const friendList = await friendService.getFriends();
      setFriends(friendList);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Connection update failed");
    } finally {
      setConnecting(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const dataToSend = {
        ...editForm,
        age: editForm.age === "" ? null : Number(editForm.age),
      };
      await playerService.updatePlayerProfile(id, dataToSend);
      toast.success("Profile updated successfully!");
      setIsEditOpen(false);
      fetchProfile();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppShell title="Players">
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-primary border-r-2"></div>
          <p className="text-muted-foreground">Loading player profile...</p>
        </div>
      </AppShell>
    );
  }

  if (!profile) {
    return (
      <AppShell title="Players">
        <div className="text-center py-10">
          <h2 className="text-xl font-bold text-red-500">Player Not Found</h2>
          <p className="text-muted-foreground mt-2">The requested player profile does not exist.</p>
          <Button className="mt-4" onClick={() => navigate({ to: "/dashboard" })}>
            Back to Dashboard
          </Button>
        </div>
      </AppShell>
    );
  }

  const { player, career, tournament, recent, history, teams } = profile;

  return (
    <AppShell title="Players">
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
                <h1 className="text-xl font-bold text-foreground flex items-center">
                  {player.name}
                </h1>
                <p className="text-xs text-muted-foreground">
                  {player.team?.name || "No Team"}
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
              {isOwnerOrAdmin && (
                <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" onClick={() => setIsEditOpen(true)}>
                  <Edit className="h-4 w-4" />
                </Button>
              )}
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

          {/* Follow Connection Trigger */}
          {currentUser && player.mobile && player.user_id !== currentUser.id && (
            <Button
              className="w-full mt-4 flex items-center justify-center space-x-1 text-xs"
              variant={isConnected ? "secondary" : "default"}
              disabled={connecting}
              onClick={handleConnectionToggle}
            >
              {isConnected ? (
                <>
                  <UserMinus className="h-3 w-3 mr-1" /> Connected
                </>
              ) : (
                <>
                  <UserPlus className="h-3 w-3 mr-1" /> Connect Friend
                </>
              )}
            </Button>
          )}
        </Card>

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
