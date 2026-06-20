import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { playerService, type Player } from "@/lib/services/playerService";
import { teamService, type Team } from "@/lib/services/teamService";
import { friendService, type Friend } from "@/lib/services/friendService";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";
import { 
  Trash2, UserPlus, UserMinus, Search, X, Plus, 
  SlidersHorizontal, ArrowUpDown, User
} from "lucide-react";

export const Route = createFileRoute("/players/")({ component: PlayersPage });

function PlayersPage() {
  const { role, user: currentUser } = useAuth();
  const isAdmin = role === "admin";
  const navigate = useNavigate();

  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  // Filter and Sorting states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRole, setSelectedRole] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const load = async () => {
    try {
      const [p, t, f] = await Promise.all([
        playerService.getPlayers(),
        teamService.getTeams(),
        currentUser ? friendService.getFriends() : Promise.resolve([]),
      ]);

      // Calculate matches count for local SQLite players
      for (const player of p) {
        try {
          const profile = await playerService.getPlayerProfile(player.id);
          player.stats = {
            matches: profile.career.matches,
            runs: profile.career.runs,
            wickets: profile.career.wickets,
            sr: profile.career.strike_rate,
            econ: profile.career.economy
          };
        } catch (e) {
          player.stats = { matches: 0, runs: 0, wickets: 0, sr: "—", econ: "—" };
        }
      }

      setPlayers(p);
      setTeams(t);
      setFriends(f);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    }
  };

  useEffect(() => {
    load();
  }, [currentUser]);

  const del = async (id: string) => {
    if (!confirm("Are you sure you want to delete this player?")) return;
    try {
      await playerService.deletePlayer(id);
      toast.success("Player deleted successfully");
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    }
  };

  const toggleFriend = async (player: Player) => {
    if (!player.mobile) return;
    setConnectingId(player.id);
    const existingFriend = friends.find((f) => f.profile?.mobile === player.mobile);
    try {
      if (existingFriend) {
        await friendService.removeFriend(existingFriend.id);
        toast.success(`Removed connection with ${player.name}`);
      } else {
        await friendService.addFriend(player.mobile);
        toast.success(`Connected with ${player.name}!`);
      }
      const updatedFriends = await friendService.getFriends();
      setFriends(updatedFriends);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Connection update failed");
    } finally {
      setConnectingId(null);
    }
  };

  // Client side filtering & sorting
  const processedPlayers = players
    .filter((p) => {
      // 1. Search Query
      const matchSearch =
        searchQuery.trim() === "" ||
        (p.name && p.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.mobile && p.mobile.includes(searchQuery)) ||
        (p.email && p.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.city && p.city.toLowerCase().includes(searchQuery.toLowerCase()));

      // 2. Role Filter
      const matchRole =
        selectedRole === "all" ||
        (p.primary_role && p.primary_role.toLowerCase() === selectedRole.toLowerCase()) ||
        (p.role && p.role.toLowerCase() === selectedRole.toLowerCase());

      return matchSearch && matchRole;
    })
    .sort((a, b) => {
      let comparison = 0;
      if (sortBy === "jersey_number") {
        const numA = parseInt(a.jersey_number || "0") || 0;
        const numB = parseInt(b.jersey_number || "0") || 0;
        comparison = numA - numB;
      } else if (sortBy === "matches_played") {
        const matchesA = a.stats?.matches || 0;
        const matchesB = b.stats?.matches || 0;
        comparison = matchesA - matchesB;
      } else {
        comparison = (a.name || "").localeCompare(b.name || "");
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

  const toggleDirection = () => {
    setSortDirection(prev => prev === "asc" ? "desc" : "asc");
  };

  return (
    <AppShell title="Players">
      <div className="space-y-4 pb-8">
        {/* Header Action */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Cricketers</h1>
            <p className="text-xs text-muted-foreground">Manage and view player profiles</p>
          </div>
          {isAdmin && (
            <Button 
              onClick={() => navigate({ to: "/players/new" })} 
              className="rounded-2xl px-4 py-2 font-semibold flex items-center gap-1.5 shadow-lg shadow-primary/20"
            >
              <Plus className="h-4 w-4" />
              Add Cricketer
            </Button>
          )}
        </div>

        {/* Filter Controls */}
        <Card className="p-4 border-border bg-card/40 space-y-3 rounded-2xl">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Name, Mobile, City..."
                className="pl-9 pr-8 bg-background border-border rounded-xl"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase flex items-center gap-1">
                <SlidersHorizontal className="h-3 w-3" /> Filter Role
              </span>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger className="bg-background border-border rounded-xl">
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="batsman">Batsman</SelectItem>
                  <SelectItem value="bowler">Bowler</SelectItem>
                  <SelectItem value="all rounder">All Rounder</SelectItem>
                  <SelectItem value="wicket keeper">Wicket Keeper</SelectItem>
                  <SelectItem value="wicket keeper batter">Wicket Keeper Batter</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase flex items-center gap-1">
                <ArrowUpDown className="h-3 w-3" /> Sort By
              </span>
              <div className="flex gap-1">
                <Select value={sortBy} onValueChange={setSortBy} className="flex-1">
                  <SelectTrigger className="bg-background border-border rounded-xl flex-1">
                    <SelectValue placeholder="Name" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="jersey_number">Jersey Number</SelectItem>
                    <SelectItem value="matches_played">Matches Played</SelectItem>
                  </SelectContent>
                </Select>
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={toggleDirection} 
                  className="bg-background border-border rounded-xl h-10 w-10 shrink-0"
                >
                  <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Players List Grid */}
        <div className="grid grid-cols-1 gap-3">
          {processedPlayers.map((p) => {
            const s = p.stats ?? { matches: 0, runs: 0, wickets: 0, sr: "—", econ: "—" };
            const team = teams.find((t) => t.id === p.preferred_team_id)?.name;
            const isFriend = p.mobile ? friends.some((f) => f.profile?.mobile === p.mobile) : false;
            const showFriendBtn = currentUser && p.mobile && p.user_id !== currentUser.id;

            return (
              <Card
                key={p.id}
                className="p-4 rounded-2xl border-border bg-card/50 hover:bg-card/75 transition-all relative overflow-hidden"
              >
                <div className="flex items-start justify-between gap-3">
                  <Link to="/players/$id" params={{ id: p.id }} className="flex items-center gap-3 flex-1 hover:opacity-90">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center overflow-hidden border border-border shrink-0">
                      {p.profile_photo || p.avatar ? (
                        <img src={p.profile_photo || p.avatar} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <User className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-foreground flex items-center gap-1.5 text-sm">
                        {p.name}
                        {p.user_id === currentUser?.id && (
                          <span className="text-[8px] bg-primary/15 text-primary px-1 py-0.5 rounded font-bold border border-primary/20">
                            You
                          </span>
                        )}
                        {p.jersey_number && (
                          <span className="text-xs font-semibold text-muted-foreground">
                            #{p.jersey_number}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                        <span>{p.primary_role || p.role || "Cricketer"}</span>
                        {team && (
                          <>
                            <span className="h-1 w-1 bg-border rounded-full" />
                            <span className="text-primary font-medium">{team}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </Link>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {showFriendBtn && (
                      <Button
                        size="sm"
                        variant={isFriend ? "secondary" : "outline"}
                        className="text-xs px-2.5 h-8 font-semibold flex items-center gap-1.5 rounded-xl"
                        disabled={connectingId === p.id}
                        onClick={() => toggleFriend(p)}
                      >
                        {isFriend ? (
                          <>
                            <UserMinus className="h-3.5 w-3.5 text-muted-foreground" />
                            Connected
                          </>
                        ) : (
                          <>
                            <UserPlus className="h-3.5 w-3.5 text-primary" />
                            Connect
                          </>
                        )}
                      </Button>
                    )}
                    {isAdmin && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-xl"
                        onClick={() => del(p.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Micro statistics */}
                <div className="grid grid-cols-5 gap-1.5 mt-3 text-center text-xs">
                  <Stat label="Matches" v={s.matches} />
                  <Stat label="Runs" v={s.runs} />
                  <Stat label="Wickets" v={s.wickets} />
                  <Stat label="S/R" v={s.sr} />
                  <Stat label="Econ" v={s.econ} />
                </div>
              </Card>
            );
          })}

          {processedPlayers.length === 0 && (
            <div className="text-muted-foreground text-center py-10 border border-dashed border-border rounded-2xl bg-card/10 text-sm">
              No cricketers match your selection.
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ label, v }: { label: string; v: any }) {
  return (
    <div className="bg-muted/40 border border-border/20 rounded-xl p-1.5">
      <div className="text-[9px] font-semibold text-muted-foreground uppercase">{label}</div>
      <div className="font-bold text-foreground text-xs mt-0.5">{v}</div>
    </div>
  );
}
