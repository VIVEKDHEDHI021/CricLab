import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Trash2, UserPlus, UserMinus, Search, X } from "lucide-react";

export const Route = createFileRoute("/players/")({ component: PlayersPage });

function PlayersPage() {
  const { role, user: currentUser } = useAuth();
  const isAdmin = role === "admin";
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  // Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Player[] | null>(null);
  const [searching, setSearching] = useState(false);

  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState("");

  const load = async () => {
    try {
      const [p, t, f] = await Promise.all([
        playerService.getPlayers(),
        teamService.getTeams(),
        currentUser ? friendService.getFriends() : Promise.resolve([]),
      ]);
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

  const add = async () => {
    if (!name.trim() || !teamId) return toast.error("Name and team required");
    try {
      await playerService.createPlayer({ name, team_id: teamId });
      setName("");
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    }
  };

  const del = async (id: string) => {
    if (!confirm("Delete player?")) return;
    try {
      await playerService.deletePlayer(id);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const res = await playerService.searchPlayers(searchQuery.trim());
      setSearchResults(res);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults(null);
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
      // Refresh friends list
      const updatedFriends = await friendService.getFriends();
      setFriends(updatedFriends);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Connection update failed");
    } finally {
      setConnectingId(null);
    }
  };

  const listToRender = searchResults !== null ? searchResults : players;

  return (
    <AppShell title="Players">
      {isAdmin && (
        <Card className="p-3 rounded-2xl mb-4 space-y-2 border-border bg-card/60">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Player name" />
          <Select value={teamId} onValueChange={setTeamId}>
            <SelectTrigger className="bg-background border-border">
              <SelectValue placeholder="Team" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={add} className="w-full">
            Add player
          </Button>
        </Card>
      )}

      {/* Search Bar */}
      <Card className="p-3 rounded-2xl mb-4 bg-card/60 border-border">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Mobile, Username or ID..."
              className="pr-8 bg-background border-border"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button type="submit" disabled={searching} className="flex items-center gap-1">
            <Search className="h-4 w-4" />
            {searching ? "Searching..." : "Search"}
          </Button>
        </form>
      </Card>

      <div className="space-y-2">
        {searchResults !== null && (
          <div className="flex justify-between items-center px-1 mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase">
              Search Results ({searchResults.length})
            </span>
            <Button variant="link" onClick={clearSearch} className="h-auto p-0 text-xs text-primary font-semibold">
              Show All
            </Button>
          </div>
        )}

        {listToRender.map((p) => {
          const s = p.stats ?? { matches: 0, runs: 0, wickets: 0, sr: "—", econ: "—" };
          const team = teams.find((t) => t.id === p.team_id)?.name;
          const isFriend = p.mobile ? friends.some((f) => f.profile?.mobile === p.mobile) : false;
          const showFriendBtn = currentUser && p.mobile && p.user_id !== currentUser.id;

          return (
            <Card
              key={p.id}
              className="p-3 rounded-2xl border-border bg-card/60 hover:bg-card transition relative overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <Link to="/players/$id" params={{ id: p.id }} className="hover:underline flex-1">
                  <div className="font-semibold text-foreground flex items-center gap-2">
                    {p.name}
                    {p.user_id === currentUser?.id && (
                      <span className="text-[9px] bg-primary/15 text-primary px-1.5 py-0.5 rounded font-bold border border-primary/20">
                        You
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{team || "—"}</div>
                </Link>
                <div className="flex items-center gap-1.5">
                  {showFriendBtn && (
                    <Button
                      size="sm"
                      variant={isFriend ? "secondary" : "outline"}
                      className="text-xs px-2.5 h-8 font-semibold flex items-center gap-1.5"
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
                      variant="outline"
                      className="h-8 w-8 text-destructive border-destructive/20 hover:bg-destructive/10"
                      onClick={() => del(p.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-5 gap-1 mt-2 text-center text-xs">
                <Stat label="M" v={s.matches} />
                <Stat label="R" v={s.runs} />
                <Stat label="W" v={s.wickets} />
                <Stat label="SR" v={s.sr} />
                <Stat label="Econ" v={s.econ} />
              </div>
            </Card>
          );
        })}
        {listToRender.length === 0 && (
          <div className="text-muted-foreground text-center py-6 border border-dashed border-border rounded-2xl bg-card/25 text-sm">
            {searchResults !== null ? "No players found matching your query." : "No players yet."}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Stat({ label, v }: { label: string; v: any }) {
  return (
    <div className="bg-muted rounded-lg p-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-mono">{v}</div>
    </div>
  );
}
