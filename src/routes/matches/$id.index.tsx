// @ts-nocheck
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { matchService } from "@/lib/services/matchService";
import { playerService, type Player } from "@/lib/services/playerService";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ballService } from "@/lib/services/ballService";
import { echoClient, updateEchoAuth } from "@/lib/echo";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Plus, User, Search, RefreshCw, Trash2 } from "lucide-react";

export const Route = createFileRoute("/matches/$id/")({ component: MatchDetails });

function oversText(b: number) { return `${Math.floor(b / 6)}.${b % 6}`; }

function MatchDetails() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const [isLiveSync, setIsLiveSync] = useState(false);
  const { user, role } = useAuth();
  const canManage = role === 'admin' || role === 'scorer';

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["match", id],
    queryFn: () => matchService.getMatch(id),
  });

  const { m, teams, innings, players, balls } = (data || {}) as any;

  const [activeTab, setActiveTab] = useState<"live" | "scorecard" | "squads" | "overs">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`active_tab_${id}`);
      if (saved === "live" || saved === "scorecard" || saved === "squads" || saved === "overs") {
        return saved;
      }
    }
    return "live";
  });

  useEffect(() => {
    localStorage.setItem(`active_tab_${id}`, activeTab);
  }, [activeTab, id]);
  const [selectedOversInningsId, setSelectedOversInningsId] = useState<string>("");

  // Player suggestion / adding states
  const [allAppPlayers, setAllAppPlayers] = useState<Player[]>([]);
  const [isAddPlayerModalOpen, setIsAddPlayerModalOpen] = useState(false);
  const [targetTeamId, setTargetTeamId] = useState("");
  const [playerSearchQuery, setPlayerSearchQuery] = useState("");
  const [playerMobile, setPlayerMobile] = useState("");
  const [selectedExistingPlayer, setSelectedExistingPlayer] = useState<Player | null>(null);
  const [submittingPlayer, setSubmittingPlayer] = useState(false);

  // Man of the Match states
  const [isMoMModalOpen, setIsMoMModalOpen] = useState(false);
  const [selectedMoMPlayerId, setSelectedMoMPlayerId] = useState("");
  const [submittingMoM, setSubmittingMoM] = useState(false);

  // Edit Overs states
  const [isEditOversOpen, setIsEditOversOpen] = useState(false);
  const [inputOvers, setInputOvers] = useState<number>(6);
  const [submittingOvers, setSubmittingOvers] = useState(false);

  // Replace player states
  const [isReplaceModalOpen, setIsReplaceModalOpen] = useState(false);
  const [replaceOldPlayerId, setReplaceOldPlayerId] = useState("");
  const [replaceOldPlayerName, setReplaceOldPlayerName] = useState("");
  const [replaceTargetTeamId, setReplaceTargetTeamId] = useState("");
  const [replaceMode, setReplaceMode] = useState<"existing" | "new">("existing");
  const [replaceNewPlayerName, setReplaceNewPlayerName] = useState("");
  const [replaceNewPlayerMobile, setReplaceNewPlayerMobile] = useState("");
  const [selectedReplacementPlayerId, setSelectedReplacementPlayerId] = useState("");
  const [submittingReplace, setSubmittingReplace] = useState(false);
  const [replaceSearchQuery, setReplaceSearchQuery] = useState("");

  const handleSaveOvers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputOvers < 1 || inputOvers > 50) {
      toast.error("Overs must be between 1 and 50");
      return;
    }
    setSubmittingOvers(true);
    try {
      await matchService.updateMatch(id, { overs: inputOvers });
      toast.success("Match overs updated successfully!");
      setIsEditOversOpen(false);
      queryClient.invalidateQueries({ queryKey: ["match", id] });
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to update overs");
    } finally {
      setSubmittingOvers(false);
    }
  };

  // Ball correction states
  const [isEditBallOpen, setIsEditBallOpen] = useState(false);
  const [editingBall, setEditingBall] = useState<any>(null);
  const [editBatterId, setEditBatterId] = useState("");
  const [editBowlerId, setEditBowlerId] = useState("");
  const [editRuns, setEditRuns] = useState(0);
  const [editExtraType, setEditExtraType] = useState("none");
  const [editExtraRuns, setEditExtraRuns] = useState(0);
  const [editIsWicket, setEditIsWicket] = useState(false);
  const [editWicketType, setEditWicketType] = useState("bowled");
  const [editCaughtById, setEditCaughtById] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const handleBallClick = (b: any) => {
    if (!(canManage || (user && m && m.created_by === user.id))) return;
    setEditingBall(b);
    setEditBatterId(b.batter_id || "");
    setEditBowlerId(b.bowler_id || "");
    setEditRuns(b.runs ?? 0);
    setEditExtraType(b.extra_type || "none");
    setEditExtraRuns(b.extra_runs ?? 0);
    setEditIsWicket(!!b.is_wicket);
    setEditWicketType(b.wicket_type || "bowled");
    setEditCaughtById(b.caught_by_id || "");
    setIsEditBallOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingBall) return;
    setIsSavingEdit(true);

    const isWicket = editIsWicket;
    const isLegal = !["wide", "no_ball"].includes(editExtraType);

    const payload = {
      batter_id: editBatterId,
      non_striker_id: editingBall.non_striker_id,
      bowler_id: editBowlerId,
      runs: editRuns,
      extra_runs: editExtraType === "none" ? 0 : editExtraRuns,
      extra_type: editExtraType === "none" ? null : editExtraType,
      is_wicket: isWicket,
      wicket_type: isWicket ? editWicketType : null,
      is_legal: isLegal,
      caught_by_id: (isWicket && editWicketType === "caught") ? editCaughtById || null : null,
    };

    try {
      await ballService.updateBall(editingBall.id, payload);
      toast.success("Ball updated and match recalculated successfully!");
      setIsEditBallOpen(false);
      queryClient.invalidateQueries({ queryKey: ["match", id] });
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to update ball");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteBall = async () => {
    if (!editingBall) return;
    if (!confirm("Are you sure you want to delete this ball? This will recalculate the entire match.")) return;

    setIsSavingEdit(true);
    try {
      await ballService.undoBall(editingBall.id);
      toast.success("Ball deleted and match recalculated successfully!");
      setIsEditBallOpen(false);
      queryClient.invalidateQueries({ queryKey: ["match", id] });
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to delete ball");
    } finally {
      setIsSavingEdit(false);
    }
  };


  // Recommendations / player stats calculation
  const playerStats = useMemo(() => {
    if (!players || !balls) return [];
    
    return players.map((p: any) => {
      const batBalls = balls.filter((b: any) => b.batter_id === p.id);
      const runsScored = batBalls.reduce((sum: number, b: any) => sum + b.runs, 0);
      const ballsFaced = batBalls.filter((b: any) => b.extra_type !== "wide").length;
      const fours = batBalls.filter((b: any) => b.runs === 4).length;
      const sixes = batBalls.filter((b: any) => b.runs === 6).length;
      const sr = ballsFaced > 0 ? (runsScored / ballsFaced) * 100 : 0;
      const isOut = balls.some((b: any) => b.is_wicket && b.batter_id === p.id && b.wicket_type !== "retired_hurt");
      
      const bowlBalls = balls.filter((b: any) => b.bowler_id === p.id);
      const wickets = bowlBalls.filter((b: any) => b.is_wicket && b.wicket_type !== "run_out" && b.wicket_type !== "retired_hurt").length;
      const runsConceded = bowlBalls.reduce((sum: number, b: any) => sum + b.runs, 0) + 
                            bowlBalls.filter((b: any) => b.extra_type === "wide" || b.extra_type === "no_ball")
                                     .reduce((sum: number, b: any) => sum + b.extra_runs, 0);
      const legalBowled = bowlBalls.filter((b: any) => b.is_legal).length;
      const econ = legalBowled > 0 ? (runsConceded / (legalBowled / 6)) : 0;
      
      // Calculate maidens
      const oversGrouped = bowlBalls.reduce((acc: any, b: any) => {
        const key = `${b.innings_id}_${b.over_number}`;
        if (!acc[key]) acc[key] = [];
        acc[key].push(b);
        return acc;
      }, {});
      
      let maidens = 0;
      Object.values(oversGrouped).forEach((overBalls: any) => {
        const legalInOver = overBalls.filter((b: any) => b.is_legal).length;
        if (legalInOver >= 6) {
          const overRuns = overBalls.reduce((sum: number, b: any) => sum + b.runs, 0) + 
                           overBalls.filter((b: any) => b.extra_type === "wide" || b.extra_type === "no_ball")
                                    .reduce((sum: number, b: any) => sum + b.extra_runs, 0);
          if (overRuns === 0) {
            maidens++;
          }
        }
      });
      
      // Catches taken in this match
      const catches = balls.filter((b: any) => b.is_wicket && b.wicket_type === "caught" && b.caught_by_id === p.id).length;
      
      // MVP formula: runs + wickets*20 + catches*10 + sixes*5 + fours*2 + maidens*25
      const mvpPoints = runsScored + (wickets * 20) + (catches * 10) + (sixes * 5) + (fours * 2) + (maidens * 25);
      
      return {
        player: p,
        runsScored,
        ballsFaced,
        fours,
        sixes,
        sr,
        isOut,
        wickets,
        runsConceded,
        legalBowled,
        econ,
        maidens,
        catches,
        mvpPoints
      };
    });
  }, [players, balls]);

  const bestBatsman = useMemo(() => {
    if (playerStats.length === 0) return null;
    return [...playerStats].sort((a, b) => {
      if (b.runsScored !== a.runsScored) return b.runsScored - a.runsScored;
      if (a.ballsFaced !== b.ballsFaced) return a.ballsFaced - b.ballsFaced;
      return b.sr - a.sr;
    })[0];
  }, [playerStats]);

  const bestBowler = useMemo(() => {
    if (playerStats.length === 0) return null;
    return [...playerStats].sort((a, b) => {
      if (b.wickets !== a.wickets) return b.wickets - a.wickets;
      if (a.runsConceded !== b.runsConceded) return a.runsConceded - b.runsConceded;
      return a.econ - b.econ;
    })[0];
  }, [playerStats]);

  const calculatedMoM = useMemo(() => {
    if (playerStats.length === 0) return null;
    return [...playerStats].sort((a, b) => {
      if (b.mvpPoints !== a.mvpPoints) return b.mvpPoints - a.mvpPoints;
      if (b.runsScored !== a.runsScored) return b.runsScored - a.runsScored;
      return b.wickets - a.wickets;
    })[0];
  }, [playerStats]);

  const momPlayer = useMemo(() => {
    const momId = m?.man_of_the_match_id || calculatedMoM?.player.id;
    if (!momId) return null;
    return playerStats.find((ps) => ps.player.id === momId) || null;
  }, [m?.man_of_the_match_id, calculatedMoM, playerStats]);

  useEffect(() => {
    if (m) {
      setSelectedMoMPlayerId(m.man_of_the_match_id || calculatedMoM?.player.id || "");
    }
  }, [m, calculatedMoM]);

  const handleSaveMoM = async () => {
    setSubmittingMoM(true);
    try {
      await matchService.updateMatch(id, {
        man_of_the_match_id: selectedMoMPlayerId || null
      });
      toast.success("Man of the Match updated successfully");
      setIsMoMModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["match", id] });
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to update Man of the Match");
    } finally {
      setSubmittingMoM(false);
    }
  };

  const loadAppPlayers = async () => {
    try {
      const list = await playerService.getPlayers();
      setAllAppPlayers(list);
    } catch (err) {}
  };

  useEffect(() => {
    if (!echoClient) return;

    updateEchoAuth();
    setIsLiveSync(true);

    const channel = echoClient.channel(`matches.${id}`);

    channel.listen(".MatchUpdated", (updatedData: any) => {
      queryClient.setQueryData(["match", id], updatedData);
    });

    return () => {
      channel.stopListening(".MatchUpdated");
      echoClient.leave(`matches.${id}`);
      setIsLiveSync(false);
    };
  }, [id, queryClient]);

  useEffect(() => {
    loadAppPlayers();
  }, []);

  useEffect(() => {
    if (data) {
      const { innings } = data as any;
      if (innings && innings.length > 0 && !selectedOversInningsId) {
        setSelectedOversInningsId(innings[innings.length - 1].id);
      }
    }
  }, [data, selectedOversInningsId]);

  if (isLoading || !data) return <AppShell><div className="text-muted-foreground">Loading…</div></AppShell>;
  const teamName = (tid: string) => teams?.find((t: any) => t.id === tid)?.name ?? "—";

  const teamAPlayers = (players ?? []).filter((p: any) => p.team_id === m.team_a_id);
  const teamBPlayers = (players ?? []).filter((p: any) => p.team_id === m.team_b_id);

  const openReplacePlayerModal = (playerId: string, playerName: string, teamId: string) => {
    setReplaceOldPlayerId(playerId);
    setReplaceOldPlayerName(playerName);
    setReplaceTargetTeamId(teamId);
    setReplaceMode("existing");
    setReplaceNewPlayerName("");
    setReplaceNewPlayerMobile("");
    setSelectedReplacementPlayerId("");
    setReplaceSearchQuery("");
    setIsReplaceModalOpen(true);
  };

  const handleReplacePlayerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingReplace(true);

    try {
      let finalNewPlayerId = selectedReplacementPlayerId;

      if (replaceMode === "new") {
        if (!replaceNewPlayerName.trim()) {
          toast.error("Player name is required");
          setSubmittingReplace(false);
          return;
        }
        const newPlayer = await playerService.createPlayer({
          name: replaceNewPlayerName.trim(),
          team_id: replaceTargetTeamId,
          mobile: replaceNewPlayerMobile.trim() || undefined,
        });
        finalNewPlayerId = newPlayer.id;
      }

      if (!finalNewPlayerId) {
        toast.error("Please select or create a replacement player");
        setSubmittingReplace(false);
        return;
      }

      await matchService.replacePlayer(id, replaceOldPlayerId, finalNewPlayerId);
      toast.success(`Successfully replaced ${replaceOldPlayerName}!`);
      setIsReplaceModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["match", id] });
      loadAppPlayers();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to replace player");
    } finally {
      setSubmittingReplace(false);
    }
  };

  const filteredReplacementPlayers = useMemo(() => {
    if (!allAppPlayers || !players) return [];
    return allAppPlayers.filter((p) => {
      const isCurrentPlayer = p.id === replaceOldPlayerId;
      const isAlreadyInTeamA = teamAPlayers.some((tp: any) => tp.id === p.id);
      const isAlreadyInTeamB = teamBPlayers.some((tp: any) => tp.id === p.id);
      const matchesSearch = p.name.toLowerCase().includes(replaceSearchQuery.toLowerCase()) || 
                            (p.mobile && p.mobile.includes(replaceSearchQuery));
      return !isCurrentPlayer && !isAlreadyInTeamA && !isAlreadyInTeamB && matchesSearch;
    });
  }, [allAppPlayers, players, replaceOldPlayerId, replaceSearchQuery, teamAPlayers, teamBPlayers]);

  // Recommendations calculation
  const filteredRecommendations = allAppPlayers.filter(p => {
    if (!playerSearchQuery.trim()) return false;
    const query = playerSearchQuery.toLowerCase();
    const matchesName = p.name.toLowerCase().includes(query);
    const matchesMobile = p.mobile?.includes(query);
    // Exclude players already in the target team
    const alreadyInTeam = p.team_id === targetTeamId;
    return (matchesName || matchesMobile) && !alreadyInTeam;
  }).slice(0, 5);

  const openAddPlayerModal = (teamId: string) => {
    setTargetTeamId(teamId);
    setPlayerSearchQuery("");
    setPlayerMobile("");
    setSelectedExistingPlayer(null);
    setIsAddPlayerModalOpen(true);
  };

  const handleSelectRecommendation = (player: Player) => {
    setSelectedExistingPlayer(player);
    setPlayerSearchQuery(player.name);
    setPlayerMobile(player.mobile || "");
  };

  const handleAddPlayerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerSearchQuery.trim()) return toast.error("Player name is required");
    setSubmittingPlayer(true);

    try {
      if (selectedExistingPlayer) {
        // Move existing player to team
        await playerService.updatePlayerProfile(selectedExistingPlayer.id, {
          team_id: targetTeamId,
          name: playerSearchQuery,
          mobile: playerMobile || undefined,
        });
        toast.success(`Assigned ${playerSearchQuery} to team`);
      } else {
        // Create brand new player
        await playerService.createPlayer({
          name: playerSearchQuery,
          team_id: targetTeamId,
          mobile: playerMobile || undefined,
        });
        toast.success(`Created new player ${playerSearchQuery}`);
      }

      // Refresh data
      queryClient.invalidateQueries({ queryKey: ["match", id] });
      loadAppPlayers();
      setIsAddPlayerModalOpen(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to add player");
    } finally {
      setSubmittingPlayer(false);
    }
  };
  
  const handleRemovePlayer = async (playerId: string, playerName: string) => {
    if (!confirm(`Are you sure you want to remove ${playerName} from this squad?`)) return;

    try {
      await playerService.updatePlayerProfile(playerId, {
        team_id: null as any,
      });
      toast.success(`Removed ${playerName} from the squad`);
      queryClient.invalidateQueries({ queryKey: ["match", id] });
      loadAppPlayers();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to remove player");
    }
  };

  return (
    <AppShell title="Match">
      {/* Match Info Card */}
      <Card className="p-4 rounded-2xl mb-4">
        <div className="flex justify-between items-center mb-1">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
            <span>{m.ground || "—"} · {m.overs} overs · {m.match_type || ""}</span>
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  setInputOvers(m.overs);
                  setIsEditOversOpen(true);
                }}
                className="text-[10px] text-primary hover:underline font-bold bg-primary/10 hover:bg-primary/15 px-1.5 py-0.5 rounded transition-all cursor-pointer"
              >
                Edit Overs
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isLiveSync && m.status === "live" && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-500 font-semibold uppercase tracking-wider">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Live Sync
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0 rounded-full"
              onClick={() => {
                refetch();
                toast.success("Scoreboard refreshed!");
              }}
              disabled={isRefetching}
              title="Refresh Scoreboard"
            >
              <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
        <div className="text-lg font-semibold mt-1">{teamName(m.team_a_id)} vs {teamName(m.team_b_id)}</div>
        <div className="text-sm text-primary mt-1">{m.result || (m.status === "live" ? "Live" : m.status)}</div>
        {m.status !== "past" && (
          <Link to="/matches/$id/score" params={{ id }} className="block mt-3">
            <Button className="w-full">
              {canManage || (user && m && m.created_by === user.id)
                ? (m.status === "live" ? "Continue scoring" : "Start scoring")
                : "View Live Score"}
            </Button>
          </Link>
        )}
      </Card>

      {/* Top Performers Card (Only for past matches) */}
      {m.status === "past" && (
        <Card className="p-4 rounded-2xl mb-4 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-yellow-500/10 border border-amber-500/20 shadow-lg relative overflow-hidden backdrop-blur-md">
          {/* Decorative background circle */}
          <div className="absolute top-[-30px] right-[-30px] w-24 h-24 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">🏆</span>
            <h3 className="font-extrabold text-base tracking-tight text-foreground bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
              Match Honours & Top Performers
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Man of the Match */}
            <div className="p-3.5 rounded-xl bg-card/60 border border-border/80 flex flex-col justify-between shadow-sm hover:border-amber-500/30 transition-all">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-1">
                    🌟 Man of the Match
                  </span>
                  {canManage && (
                    <button
                      onClick={() => setIsMoMModalOpen(true)}
                      className="text-[10px] text-primary hover:underline font-bold"
                    >
                      {m.man_of_the_match_id ? "Change" : "Select"}
                    </button>
                  )}
                </div>
                {momPlayer ? (
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center font-bold text-amber-600 text-sm overflow-hidden shrink-0">
                      {momPlayer.player.avatar ? (
                        <img src={momPlayer.player.avatar} alt={momPlayer.player.name} className="w-full h-full object-cover" />
                      ) : (
                        momPlayer.player.name.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-foreground leading-tight">
                        {momPlayer.player.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {teamName(momPlayer.player.team_id)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic">No player selected</div>
                )}
              </div>
              {momPlayer && (
                <div className="mt-3 pt-2.5 border-t border-border/60 flex justify-between text-xs font-semibold text-muted-foreground">
                  <span>Match Performance:</span>
                  <span className="text-foreground font-bold">
                    {momPlayer.runsScored} runs {momPlayer.wickets > 0 && `& ${momPlayer.wickets} Wkts`}
                  </span>
                </div>
              )}
            </div>

            {/* Best Batsman */}
            <div className="p-3.5 rounded-xl bg-card/60 border border-border/80 flex flex-col justify-between shadow-sm hover:border-primary/20 transition-all">
              <div>
                <div className="text-[10px] font-black text-primary uppercase tracking-widest mb-2 flex items-center gap-1">
                  🏏 Best Batsman
                </div>
                {bestBatsman ? (
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-primary text-sm overflow-hidden shrink-0">
                      {bestBatsman.player.avatar ? (
                        <img src={bestBatsman.player.avatar} alt={bestBatsman.player.name} className="w-full h-full object-cover" />
                      ) : (
                        bestBatsman.player.name.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-foreground leading-tight">
                        {bestBatsman.player.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {teamName(bestBatsman.player.team_id)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic">No batting stats</div>
                )}
              </div>
              {bestBatsman && (
                <div className="mt-3 pt-2.5 border-t border-border/60 flex justify-between text-xs font-semibold text-muted-foreground">
                  <span>Score:</span>
                  <span className="text-foreground font-bold">
                    {bestBatsman.runsScored} ({bestBatsman.ballsFaced}) · SR: {bestBatsman.sr.toFixed(1)}
                  </span>
                </div>
              )}
            </div>

            {/* Best Bowler */}
            <div className="p-3.5 rounded-xl bg-card/60 border border-border/80 flex flex-col justify-between shadow-sm hover:border-purple-500/20 transition-all">
              <div>
                <div className="text-[10px] font-black text-purple-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                  🥎 Best Bowler
                </div>
                {bestBowler ? (
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center font-bold text-purple-600 text-sm overflow-hidden shrink-0">
                      {bestBowler.player.avatar ? (
                        <img src={bestBowler.player.avatar} alt={bestBowler.player.name} className="w-full h-full object-cover" />
                      ) : (
                        bestBowler.player.name.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-foreground leading-tight">
                        {bestBowler.player.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {teamName(bestBowler.player.team_id)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic">No bowling stats</div>
                )}
              </div>
              {bestBowler && (
                <div className="mt-3 pt-2.5 border-t border-border/60 flex justify-between text-xs font-semibold text-muted-foreground">
                  <span>Figures:</span>
                  <span className="text-foreground font-bold">
                    {bestBowler.wickets}/{bestBowler.runsConceded} ({oversText(bestBowler.legalBowled)})
                  </span>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-border/80 mb-4 bg-muted/40 p-1 rounded-xl">
        {(["live", "scorecard", "squads", "overs"] as const).map((tab) => (
          <button
            key={tab}
            className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg transition-all ${
              activeTab === tab
                ? "bg-background text-primary shadow-sm"
                : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* LIVE TAB CONTENT */}
      {activeTab === "live" && (
        <div className="space-y-4">
          {innings.length > 0 ? (
            (() => {
              const currentInn = innings[innings.length - 1];
              const firstInnings = innings.find((inn: any) => inn.innings_no === 1);
              const innBalls = (balls ?? []).filter((b: any) => b.innings_id === currentInn.id);
              const currentCRR = ((currentInn.runs / (currentInn.legal_balls || 1)) * 6).toFixed(2);
              const recentBalls = innBalls.slice(-12);
              const isSecondInnings = currentInn.innings_no === 2;

              let equationText = "";
              if (isSecondInnings && firstInnings) {
                const target = firstInnings.runs + 1;
                const needed = target - currentInn.runs;
                const maxBalls = m.overs * 6;
                const ballsRemaining = maxBalls - currentInn.legal_balls;
                const reqRR = ballsRemaining > 0 ? ((needed / ballsRemaining) * 6).toFixed(2) : "0.00";
                
                if (needed <= 0) {
                  equationText = `${teamName(currentInn.batting_team_id)} won the match!`;
                } else if (ballsRemaining <= 0) {
                  equationText = `${teamName(firstInnings.batting_team_id)} won by ${firstInnings.runs - currentInn.runs} runs!`;
                } else {
                  equationText = `${teamName(currentInn.batting_team_id)} needs ${needed} runs in ${ballsRemaining} balls (Req. RR: ${reqRR})`;
                }
              }

              // Get striker / non-striker partnership details from last ball
              const lastBall = innBalls[innBalls.length - 1];
              const strikerId = lastBall?.batter_id;
              const nonStrikerId = lastBall?.non_striker_id;
              const bowlerId = lastBall?.bowler_id;

              return (
                <div className="space-y-3">
                  {/* Big Score Card */}
                  <Card className="p-4 rounded-2xl bg-card border-border flex flex-col justify-center items-center text-center">
                    <div className="text-xs font-bold text-primary uppercase tracking-wider mb-1">
                      {teamName(currentInn.batting_team_id)} ({currentInn.innings_no === 1 ? "1st Innings" : "2nd Innings"})
                    </div>
                    <div className="text-4xl font-extrabold tracking-tight">
                      {currentInn.runs}/{currentInn.wickets}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Overs: <span className="font-semibold">{oversText(currentInn.legal_balls)}</span> / {m.overs}
                    </div>
                    <div className="mt-2 flex justify-center">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 px-3 rounded-full border-primary/20 hover:bg-primary/5 text-primary text-xs font-semibold cursor-pointer"
                        onClick={() => {
                          refetch();
                          toast.success("Scoreboard refreshed!");
                        }}
                        disabled={isRefetching}
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
                        Refresh Score
                      </Button>
                    </div>
                    <div className="flex gap-4 mt-3 text-xs border-t border-border/60 pt-3 w-full justify-center">
                      <div>CRR: <span className="font-bold text-foreground">{currentCRR}</span></div>
                      {isSecondInnings && firstInnings && (
                        <>
                          <div className="h-4 w-[1px] bg-border/60"></div>
                          <div>Target: <span className="font-bold text-primary">{firstInnings.runs + 1}</span></div>
                        </>
                      )}
                    </div>
                    {equationText && (
                      <div className="mt-3 text-xs font-semibold bg-primary/10 text-primary px-3 py-1.5 rounded-full border border-primary/20">
                        {equationText}
                      </div>
                    )}
                  </Card>

                  {/* Partnership / Batter summary card */}
                  {(strikerId || nonStrikerId) && (
                    <Card className="p-4 rounded-2xl space-y-2.5">
                      <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider border-b border-border/40 pb-1.5">
                        Active Batsmen
                      </div>
                      <div className="space-y-2">
                        {strikerId && (() => {
                          const p = players.find((pl: any) => pl.id === strikerId);
                          if (!p) return null;
                          const faced = innBalls.filter(b => b.batter_id === p.id && b.is_legal);
                          const runs = innBalls.filter(b => b.batter_id === p.id).reduce((sum, b) => sum + (b.runs || 0), 0);
                          const sr = faced.length ? ((runs / faced.length) * 100).toFixed(1) : "0.0";
                          return (
                            <div className="flex justify-between items-center text-sm">
                              <span className="font-semibold flex items-center gap-1.5">
                                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"></span>
                                {p.name} *
                              </span>
                              <span className="font-mono text-muted-foreground">{runs} ({faced.length}) · SR {sr}</span>
                            </div>
                          );
                        })()}
                        {nonStrikerId && strikerId !== nonStrikerId && (() => {
                          const p = players.find((pl: any) => pl.id === nonStrikerId);
                          if (!p) return null;
                          const faced = innBalls.filter(b => b.batter_id === p.id && b.is_legal);
                          const runs = innBalls.filter(b => b.batter_id === p.id).reduce((sum, b) => sum + (b.runs || 0), 0);
                          const sr = faced.length ? ((runs / faced.length) * 100).toFixed(1) : "0.0";
                          return (
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-muted-foreground flex items-center gap-1.5">
                                <span className="h-1.5 w-1.5 rounded-full bg-muted"></span>
                                {p.name}
                              </span>
                              <span className="font-mono text-muted-foreground">{runs} ({faced.length}) · SR {sr}</span>
                            </div>
                          );
                        })()}
                      </div>
                    </Card>
                  )}

                  {/* Active Bowler Card */}
                  {bowlerId && (() => {
                    const p = players.find((pl: any) => pl.id === bowlerId);
                    if (!p) return null;
                    const bowlerBalls = innBalls.filter(b => b.bowler_id === p.id);
                    const legalBalls = bowlerBalls.filter(b => b.is_legal).length;
                    const runsConceded = bowlerBalls.reduce((sum, b) => sum + (b.runs || 0) + (b.extra_runs || 0), 0);
                    const wickets = bowlerBalls.filter(b => b.is_wicket).length;
                    const econ = legalBalls > 0 ? ((runsConceded / legalBalls) * 6).toFixed(2) : "0.00";
                    return (
                      <Card className="p-4 rounded-2xl">
                        <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider border-b border-border/40 pb-1.5 mb-2">
                          Active Bowler
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="font-semibold text-secondary flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-secondary"></span>
                            {p.name}
                          </span>
                          <span className="font-mono text-muted-foreground">
                            {oversText(legalBalls)} ov · {runsConceded} runs · {wickets} wkts · Econ {econ}
                          </span>
                        </div>
                      </Card>
                    );
                  })()}

                  {/* Recent Balls */}
                  {recentBalls.length > 0 && (
                    <Card className="p-4 rounded-2xl space-y-2">
                      <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        Recent Balls
                      </div>
                      <div className="flex flex-wrap gap-1.5 items-center pt-1">
                        {recentBalls.map((b: any, idx: number, arr: any[]) => {
                          const prevBall = idx > 0 ? arr[idx - 1] : null;
                          const isNewOver = prevBall && prevBall.over_number !== b.over_number;

                          let text = "";
                          let colorClass = "bg-muted/60 text-foreground";
                          
                          if (b.is_wicket) {
                            text = "W";
                            colorClass = "bg-red-500 text-white font-bold";
                          } else if (b.runs === 6 && !b.extra_type) {
                            text = "6";
                            colorClass = "bg-purple-600 text-white font-bold";
                          } else if (b.runs === 4 && !b.extra_type) {
                            text = "4";
                            colorClass = "bg-blue-600 text-white font-bold";
                          } else if (b.runs === 0 && !b.extra_runs && !b.extra_type) {
                            text = "0";
                            colorClass = "bg-muted/60 text-muted-foreground flex items-center justify-center font-bold text-base";
                          } else {
                            if (b.extra_type === "wide") text = `${b.extra_runs}wd`;
                            else if (b.extra_type === "no_ball") text = `${b.runs + 1}nb`;
                            else if (b.extra_type === "bye") text = `${b.extra_runs}b`;
                            else if (b.extra_type === "leg_bye") text = `${b.extra_runs}lb`;
                            else text = `${b.runs}`;
                          }
                          
                          return (
                            <div key={b.id} className="flex items-center">
                              {isNewOver && (
                                <div className="w-[1.5px] h-4 bg-border/80 mx-1.5 self-center" />
                              )}
                              <span className={`w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold ${colorClass}`}>
                                {text}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  )}
                </div>
              );
            })()
          ) : (
            <div className="text-center text-muted-foreground py-8">
              No live scoring data available.
            </div>
          )}
        </div>
      )}

      {/* SCORECARD TAB CONTENT */}
      {activeTab === "scorecard" && (
        <div className="space-y-4">
          {innings.length > 0 ? (
            innings.map((inn: any) => {
              const innBalls = (balls ?? []).filter((b: any) => b.innings_id === inn.id);

              // Get all unique player IDs who participated in this innings as batter or bowler
              const activeBatterIds = Array.from(new Set(innBalls.map((b: any) => b.batter_id).filter(Boolean)));
              const activeBowlerIds = Array.from(new Set(innBalls.map((b: any) => b.bowler_id).filter(Boolean)));

              // For batting team: start with players matching batting_team_id, but ensure we add any active batters in innBalls who might be missing
              const battingTeamPlayers = (players ?? []).filter((p: any) => p.team_id === inn.batting_team_id);
              activeBatterIds.forEach((id: any) => {
                if (!battingTeamPlayers.some((p: any) => p.id === id)) {
                  const foundPlayer = (players ?? []).find((p: any) => p.id === id) || { id, name: "Unknown Player" };
                  battingTeamPlayers.push(foundPlayer);
                }
              });

              // For bowling team: start with players matching bowling_team_id, but ensure we add any active bowlers in innBalls who might be missing
              const bowlingTeamPlayers = (players ?? []).filter((p: any) => p.team_id === inn.bowling_team_id);
              activeBowlerIds.forEach((id: any) => {
                if (!bowlingTeamPlayers.some((p: any) => p.id === id)) {
                  const foundPlayer = (players ?? []).find((p: any) => p.id === id) || { id, name: "Unknown Player" };
                  bowlingTeamPlayers.push(foundPlayer);
                }
              });

              const batterStats = battingTeamPlayers.map(p => {
                const facedBalls = innBalls.filter(b => b.batter_id === p.id && b.is_legal);
                const runs = innBalls.filter(b => b.batter_id === p.id).reduce((sum, b) => sum + (b.runs || 0), 0);
                const fours = innBalls.filter(b => b.batter_id === p.id && b.runs === 4 && b.is_legal && !b.extra_type).length;
                const sixes = innBalls.filter(b => b.batter_id === p.id && b.runs === 6 && b.is_legal && !b.extra_type).length;
                const isOut = innBalls.some(b => b.batter_id === p.id && b.is_wicket);
                const wicketBall = innBalls.find(b => b.batter_id === p.id && b.is_wicket);
                const facedCount = facedBalls.length;
                const sr = facedCount > 0 ? ((runs / facedCount) * 100).toFixed(1) : "0.0";
                return { p, runs, facedCount, fours, sixes, sr, isOut, wicketBall };
              }).filter(s => s.facedCount > 0 || s.isOut);

              const bowlerStats = bowlingTeamPlayers.map(p => {
                const bowlerBalls = innBalls.filter(b => b.bowler_id === p.id);
                const legalBalls = bowlerBalls.filter(b => b.is_legal).length;
                const runsConceded = bowlerBalls.reduce((sum, b) => sum + (b.runs || 0) + (b.extra_runs || 0), 0);
                const wickets = bowlerBalls.filter(b => b.is_wicket).length;
                const econ = legalBalls > 0 ? ((runsConceded / legalBalls) * 6).toFixed(2) : "0.00";

                let maidens = 0;
                const oversGrouped = bowlerBalls.reduce((acc, b) => {
                  acc[b.over_number] = acc[b.over_number] || [];
                  acc[b.over_number].push(b);
                  return acc;
                }, {} as Record<number, any[]>);
                for (const overNo in oversGrouped) {
                  const overBalls = oversGrouped[overNo];
                  const legalInOver = overBalls.filter(b => b.is_legal).length;
                  if (legalInOver === 6) {
                    const overRuns = overBalls.reduce((sum, b) => sum + (b.runs || 0) + (b.extra_runs || 0), 0);
                    if (overRuns === 0) maidens++;
                  }
                }
                
                return { p, overs: oversText(legalBalls), maidens, runsConceded, wickets, econ, legalBalls };
              }).filter(s => s.legalBalls > 0);

              const wideCount = innBalls.filter(b => b.extra_type === "wide").reduce((sum, b) => sum + (b.extra_runs || 0), 0);
              const noballCount = innBalls.filter(b => b.extra_type === "no_ball").reduce((sum, b) => sum + (b.extra_runs || 0), 0);
              const byeCount = innBalls.filter(b => b.extra_type === "bye").reduce((sum, b) => sum + (b.extra_runs || 0), 0);
              const legbyeCount = innBalls.filter(b => b.extra_type === "leg_bye").reduce((sum, b) => sum + (b.extra_runs || 0), 0);
              const totalExtras = wideCount + noballCount + byeCount + legbyeCount;

              return (
                <Card key={inn.id} className="p-4 rounded-2xl space-y-4">
                  <div className="flex justify-between items-baseline border-b border-border/40 pb-2">
                    <span className="font-bold text-primary">{teamName(inn.batting_team_id)} Innings</span>
                    <span className="font-mono text-sm font-bold">
                      {inn.runs}/{inn.wickets} <span className="text-muted-foreground font-normal">({oversText(inn.legal_balls)} ov)</span>
                    </span>
                  </div>

                  {/* Batting table */}
                  <div className="space-y-2">
                    <div className="grid grid-cols-12 text-[10px] font-bold text-muted-foreground uppercase pb-1 border-b border-border/20">
                      <span className="col-span-6">Batter</span>
                      <span className="col-span-1 text-right">R</span>
                      <span className="col-span-1 text-right">B</span>
                      <span className="col-span-1 text-right">4s</span>
                      <span className="col-span-1 text-right">6s</span>
                      <span className="col-span-2 text-right">SR</span>
                    </div>
                    <div className="divide-y divide-border/20">
                      {batterStats.map(({ p, runs, facedCount, fours, sixes, sr, isOut, wicketBall }) => {
                        let outDesc = "not out";
                        if (isOut && wicketBall) {
                          const bowlerNameText = players.find((pl: any) => pl.id === wicketBall.bowler_id)?.name || "bowler";
                          outDesc = `b ${bowlerNameText}`;
                        }
                        return (
                          <div key={p.id} className="grid grid-cols-12 py-1.5 text-xs">
                            <div className="col-span-6 flex flex-col">
                              <span className="font-semibold text-foreground">{p.name}</span>
                              <span className="text-[10px] text-muted-foreground italic leading-tight">{outDesc}</span>
                            </div>
                            <span className="col-span-1 text-right font-bold font-mono">{runs}</span>
                            <span className="col-span-1 text-right font-mono text-muted-foreground">{facedCount}</span>
                            <span className="col-span-1 text-right font-mono text-muted-foreground">{fours}</span>
                            <span className="col-span-1 text-right font-mono text-muted-foreground">{sixes}</span>
                            <span className="col-span-2 text-right font-mono text-muted-foreground">{sr}</span>
                          </div>
                        );
                      })}
                      {batterStats.length === 0 && (
                        <div className="text-center text-xs text-muted-foreground py-2 italic">No batters active yet.</div>
                      )}
                    </div>
                  </div>

                  {/* Extras display */}
                  <div className="text-xs text-muted-foreground flex justify-between bg-muted/30 px-3 py-1.5 rounded-xl border border-border/20">
                    <span>Extras: <span className="font-bold text-foreground">{totalExtras}</span></span>
                    <span>(wd {wideCount}, nb {noballCount}, b {byeCount}, lb {legbyeCount})</span>
                  </div>

                  {/* Bowling table */}
                  <div className="space-y-2">
                    <div className="grid grid-cols-12 text-[10px] font-bold text-muted-foreground uppercase pb-1 border-b border-border/20">
                      <span className="col-span-5">Bowler</span>
                      <span className="col-span-2 text-right">O</span>
                      <span className="col-span-1 text-right">M</span>
                      <span className="col-span-1 text-right">R</span>
                      <span className="col-span-1 text-right">W</span>
                      <span className="col-span-2 text-right">Econ</span>
                    </div>
                    <div className="divide-y divide-border/20">
                      {bowlerStats.map(({ p, overs, maidens, runsConceded, wickets, econ }) => (
                        <div key={p.id} className="grid grid-cols-12 py-1.5 text-xs">
                          <span className="col-span-5 font-semibold text-foreground">{p.name}</span>
                          <span className="col-span-2 text-right font-mono text-muted-foreground">{overs}</span>
                          <span className="col-span-1 text-right font-mono text-muted-foreground">{maidens}</span>
                          <span className="col-span-1 text-right font-mono text-muted-foreground">{runsConceded}</span>
                          <span className="col-span-1 text-right font-bold font-mono text-foreground">{wickets}</span>
                          <span className="col-span-2 text-right font-mono text-muted-foreground">{econ}</span>
                        </div>
                      ))}
                      {bowlerStats.length === 0 && (
                        <div className="text-center text-xs text-muted-foreground py-2 italic">No bowlers active yet.</div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })
          ) : (
            <div className="text-center text-muted-foreground py-8">
              No scorecard data available.
            </div>
          )}
        </div>
      )}

      {/* SQUADS TAB CONTENT */}
      {activeTab === "squads" && (
        <div className="space-y-4">
          {/* Team A Squad */}
          <Card className="p-4 rounded-2xl border-border bg-card">
            <div className="flex justify-between items-center mb-3">
              <h4 className="font-semibold text-sm text-primary">{teamName(m.team_a_id)}</h4>
              {(canManage || (user && m.created_by === user.id)) && (
                <Button size="sm" variant="outline" className="h-8 px-2.5 gap-1" onClick={() => openAddPlayerModal(m.team_a_id)}>
                  <Plus className="h-3.5 w-3.5" /> Add Player
                </Button>
              )}
            </div>
            <div className="divide-y divide-border/60">
              {teamAPlayers.map((p: any) => (
                <div key={p.id} className="py-2 flex justify-between items-center text-sm">
                  <div className="flex flex-col">
                    <span className="font-semibold">{p.name} {p.jersey_number ? `(${p.jersey_number})` : ""}</span>
                    <span className="text-[10px] text-muted-foreground uppercase">{p.role || "Player"}</span>
                  </div>
                  {(canManage || (user && m.created_by === user.id)) && (
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-primary shrink-0 rounded-full"
                        onClick={() => openReplacePlayerModal(p.id, p.name, m.team_a_id)}
                        title="Replace player in match"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0 rounded-full" 
                        onClick={() => handleRemovePlayer(p.id, p.name)}
                        title="Remove player from squad"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {teamAPlayers.length === 0 && (
                <div className="text-xs text-muted-foreground py-2 italic">No players added to this squad.</div>
              )}
            </div>
          </Card>

          {/* Team B Squad */}
          <Card className="p-4 rounded-2xl border-border bg-card">
            <div className="flex justify-between items-center mb-3">
              <h4 className="font-semibold text-sm text-primary">{teamName(m.team_b_id)}</h4>
              {(canManage || (user && m.created_by === user.id)) && (
                <Button size="sm" variant="outline" className="h-8 px-2.5 gap-1" onClick={() => openAddPlayerModal(m.team_b_id)}>
                  <Plus className="h-3.5 w-3.5" /> Add Player
                </Button>
              )}
            </div>
            <div className="divide-y divide-border/60">
              {teamBPlayers.map((p: any) => (
                <div key={p.id} className="py-2 flex justify-between items-center text-sm">
                  <div className="flex flex-col">
                    <span className="font-semibold">{p.name} {p.jersey_number ? `(${p.jersey_number})` : ""}</span>
                    <span className="text-[10px] text-muted-foreground uppercase">{p.role || "Player"}</span>
                  </div>
                  {(canManage || (user && m.created_by === user.id)) && (
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-primary shrink-0 rounded-full"
                        onClick={() => openReplacePlayerModal(p.id, p.name, m.team_b_id)}
                        title="Replace player in match"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0 rounded-full" 
                        onClick={() => handleRemovePlayer(p.id, p.name)}
                        title="Remove player from squad"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {teamBPlayers.length === 0 && (
                <div className="text-xs text-muted-foreground py-2 italic">No players added to this squad.</div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* OVERS TAB CONTENT (As requested by screenshot) */}
      {activeTab === "overs" && (
        <div className="space-y-4">
          {innings.length > 0 ? (
            (() => {
              const currentSelectedInnings = innings.find((inn: any) => inn.id === selectedOversInningsId) || innings[innings.length - 1];
              const innBalls = (balls ?? []).filter((b: any) => b.innings_id === currentSelectedInnings.id);
              
              // Group balls by over_number
              const oversGrouped = innBalls.reduce((acc, b) => {
                acc[b.over_number] = acc[b.over_number] || [];
                acc[b.over_number].push(b);
                return acc;
              }, {} as Record<number, any[]>);

              // Sort over numbers descending (newest over first)
              const overNumbers = Object.keys(oversGrouped).map(Number).sort((a, b) => b - a);

              const playerNameHelper = (pid: string) => players.find((p: any) => p.id === pid)?.name ?? "Bowler";

              return (
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <div className="inline-flex border border-primary/20 rounded-full p-1 bg-muted/40">
                      {innings.map((inn: any) => (
                        <button
                          key={inn.id}
                          className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all ${
                            selectedOversInningsId === inn.id
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                          onClick={() => setSelectedOversInningsId(inn.id)}
                        >
                          {teamName(inn.batting_team_id)} ({inn.innings_no === 1 ? "1st Inn" : "2nd Inn"})
                        </button>
                      ))}
                    </div>
                  </div>

                  <Card className="rounded-2xl overflow-hidden border border-border/80 bg-card">
                    {/* Columns Header */}
                    <div className="grid grid-cols-12 text-[10px] font-bold text-muted-foreground uppercase bg-muted/30 border-b border-border/85 px-4 py-3">
                      <span className="col-span-2">Over</span>
                      <span className="col-span-8 px-2">Balls</span>
                      <span className="col-span-2 text-right">Runs</span>
                    </div>

                    <div className="divide-y divide-border/60">
                      {overNumbers.map((O) => {
                        const overBalls = oversGrouped[O];
                        const runsInOver = overBalls.reduce((sum, b) => sum + (b.runs || 0) + (b.extra_runs || 0), 0);

                        // Score at the end of this over
                        const ballsUpTo = innBalls.filter(b => b.ball_index <= Math.max(...overBalls.map(b => b.ball_index)));
                        const cumulativeRuns = ballsUpTo.reduce((sum, b) => sum + (b.runs || 0) + (b.extra_runs || 0), 0);
                        const cumulativeWickets = ballsUpTo.filter(b => b.is_wicket).length;

                        const bowlerId = overBalls[0]?.bowler_id;
                        const bowlerName = playerNameHelper(bowlerId);
                        const batterIds = Array.from(new Set(overBalls.map(b => b.batter_id)));
                        const batterNames = batterIds.map(id => playerNameHelper(id)).join(" & ");
                        const matchUpText = `${bowlerName} to ${batterNames}`;

                        return (
                          <div key={O} className="grid grid-cols-12 px-4 py-3.5 items-center gap-1 hover:bg-muted/5 transition-colors">
                            {/* Over info */}
                            <div className="col-span-2 flex flex-col justify-center">
                              <span className="text-sm font-extrabold text-foreground tracking-tight">Ov {O + 1}</span>
                              <span className="text-[10px] text-muted-foreground font-semibold leading-tight">{cumulativeRuns}-{cumulativeWickets}</span>
                            </div>

                            {/* Balls & matchup details */}
                            <div className="col-span-8 flex flex-col justify-center px-2">
                              <span className="text-[11px] font-semibold text-muted-foreground/80 leading-tight mb-2 tracking-tight">
                                {matchUpText}
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {overBalls.map((b) => {
                                  let text = "";
                                  let colorClass = "bg-muted/60 text-foreground border border-border/10";
                                  
                                  if (b.is_wicket) {
                                    text = "W";
                                    colorClass = "bg-red-500 text-white font-bold";
                                  } else if (b.runs === 6 && !b.extra_type) {
                                    text = "6";
                                    colorClass = "bg-purple-600 text-white font-bold";
                                  } else if (b.runs === 4 && !b.extra_type) {
                                    text = "4";
                                    colorClass = "bg-blue-600 text-white font-bold";
                                  } else if (b.runs === 0 && !b.extra_runs && !b.extra_type) {
                                    text = "0";
                                    colorClass = "bg-muted/60 text-muted-foreground flex items-center justify-center font-bold text-sm";
                                  } else {
                                    if (b.extra_type === "wide") {
                                      text = `${b.extra_runs}wd`;
                                    } else if (b.extra_type === "no_ball") {
                                      text = `${b.runs + 1}nb`;
                                    } else if (b.extra_type === "bye") {
                                      text = `${b.extra_runs}b`;
                                    } else if (b.extra_type === "leg_bye") {
                                      text = `${b.extra_runs}lb`;
                                    } else {
                                      text = `${b.runs}`;
                                    }
                                  }
                                  
                                  return (
                                    <button 
                                      key={b.id}
                                      type="button"
                                      onClick={() => (canManage || (user && m && m.created_by === user.id)) && handleBallClick(b)}
                                      className={`w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold shadow-sm transition-all select-none ${colorClass} ${
                                        (canManage || (user && m && m.created_by === user.id)) ? "cursor-pointer hover:scale-110 active:scale-90 border border-border/10" : ""
                                      }`}
                                    >
                                      {text}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Runs scored */}
                            <div className="col-span-2 text-right font-extrabold text-foreground text-sm flex items-center justify-end font-mono">
                              {runsInOver}
                            </div>
                          </div>
                        );
                      })}
                      {overNumbers.length === 0 && (
                        <div className="text-center text-xs text-muted-foreground py-6 italic">No overs completed yet.</div>
                      )}
                    </div>
                  </Card>
                </div>
              );
            })()
          ) : (
            <div className="text-center text-muted-foreground py-8">
              No overs data available.
            </div>
          )}
        </div>
      )}

      {/* Add Player Dialog Modal with Profile Recommendations */}
      <Dialog open={isAddPlayerModalOpen} onOpenChange={setIsAddPlayerModalOpen}>
        <DialogContent className="max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Add Player to {teamName(targetTeamId)}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddPlayerSubmit} className="space-y-4 py-2">
            
            {/* Select Existing Player Dropdown */}
            <div className="space-y-1.5">
              <Label>Select Existing Player</Label>
              <select
                value={selectedExistingPlayer?.id || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "") {
                    setSelectedExistingPlayer(null);
                    setPlayerSearchQuery("");
                    setPlayerMobile("");
                  } else {
                    const found = allAppPlayers.find(p => p.id === val);
                    if (found) {
                      handleSelectRecommendation(found);
                    }
                  }
                }}
                className="w-full h-10 px-3 py-2 text-xs border border-border bg-background rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">-- Select from existing players --</option>
                {allAppPlayers
                  .filter(p => p.team_id !== targetTeamId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.mobile ? `(${p.mobile})` : ""} {p.team_name ? `[Team: ${p.team_name}]` : "[No Team]"}
                    </option>
                  ))}
              </select>
              <p className="text-[10px] text-muted-foreground">
                Quickly select a player from the database to add or transfer to this squad.
              </p>
            </div>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-border/60"></div>
              <span className="flex-shrink mx-4 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">Or Create New</span>
              <div className="flex-grow border-t border-border/60"></div>
            </div>

            {/* Player Search Input */}
            <div className="space-y-1 relative">
              <Label htmlFor="player-search">Player Name</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="player-search"
                  value={playerSearchQuery}
                  onChange={(e) => {
                    setPlayerSearchQuery(e.target.value);
                    if (selectedExistingPlayer && e.target.value !== selectedExistingPlayer.name) {
                      setSelectedExistingPlayer(null); // Clear selection if user edits manually
                    }
                  }}
                  placeholder="Type player name or mobile number"
                  required
                  className="pl-9 bg-background border-border"
                  autoComplete="off"
                />
              </div>

              {/* Recommendations list */}
              {filteredRecommendations.length > 0 && !selectedExistingPlayer && (
                <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-xl shadow-xl divide-y divide-border overflow-hidden">
                  <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/40">
                    Existing Profiles Found:
                  </div>
                  {filteredRecommendations.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectRecommendation(p)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-primary/10 transition-colors flex items-center justify-between"
                    >
                      <div>
                        <div className="font-semibold text-primary">{p.name}</div>
                        {p.mobile && <div className="text-xs text-muted-foreground">Mobile: {p.mobile}</div>}
                      </div>
                      <div className="text-xs text-muted-foreground text-right">
                        <div>{p.role || "Player"}</div>
                        {p.team_name && <div className="italic">Team: {p.team_name}</div>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Existing profile indicator */}
            {selectedExistingPlayer && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs flex items-start gap-2">
                <User className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-bold">Link Profile Selected:</span> Matches {selectedExistingPlayer.name}.
                  {selectedExistingPlayer.team_name ? ` Will move them from "${selectedExistingPlayer.team_name}" to "${teamName(targetTeamId)}".` : ` Will assign them to "${teamName(targetTeamId)}".`}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedExistingPlayer(null);
                      setPlayerSearchQuery("");
                      setPlayerMobile("");
                    }}
                    className="block text-primary underline mt-1 font-semibold"
                  >
                    Clear selection / Create new profile
                  </button>
                </div>
              </div>
            )}

            {/* Mobile field (only requested if creating new or linked) */}
            <div className="space-y-1">
              <Label htmlFor="player-mobile">Mobile Number (Optional)</Label>
              <Input
                id="player-mobile"
                value={playerMobile}
                onChange={(e) => setPlayerMobile(e.target.value)}
                placeholder="Enter 10-digit number"
                className="bg-background border-border"
                type="tel"
                pattern="[0-9]{10}"
              />
              <p className="text-[10px] text-muted-foreground">
                If they have a registered account, adding their mobile number will auto-link stats to their account.
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsAddPlayerModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submittingPlayer}>
                {submittingPlayer ? (
                  <span className="flex items-center gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Adding...
                  </span>
                ) : selectedExistingPlayer ? (
                  "Assign Profile"
                ) : (
                  "Create & Add"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Man of the Match Selection Dialog */}
      <Dialog open={isMoMModalOpen} onOpenChange={setIsMoMModalOpen}>
        <DialogContent className="max-w-md bg-card border border-border text-foreground rounded-2xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold">
              Select Man of the Match
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">
                Choose Player
              </label>
              <select
                value={selectedMoMPlayerId}
                onChange={(e) => setSelectedMoMPlayerId(e.target.value)}
                className="w-full h-10 px-3 py-2 text-xs border border-border bg-background rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">-- Select Player --</option>
                <optgroup label={teamName(m.team_a_id)}>
                  {teamAPlayers.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={teamName(m.team_b_id)}>
                  {teamBPlayers.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          </div>
          <DialogFooter className="flex gap-2 justify-end pt-2">
            <Button
              variant="outline"
              className="text-xs h-9 font-semibold"
              onClick={() => setIsMoMModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              className="text-xs h-9 font-bold"
              onClick={handleSaveMoM}
              disabled={submittingMoM}
            >
              {submittingMoM ? "Saving..." : "Save Selection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Overs Dialog */}
      <Dialog open={isEditOversOpen} onOpenChange={setIsEditOversOpen}>
        <DialogContent className="max-w-xs bg-card border border-border text-foreground rounded-2xl shadow-xl p-5">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold">
              Edit Match Overs
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveOvers} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="match-overs" className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">
                Total Overs
              </Label>
              <Input
                id="match-overs"
                type="number"
                min="1"
                max="50"
                value={inputOvers}
                onChange={(e) => setInputOvers(parseInt(e.target.value) || 1)}
                className="bg-background border-border"
                required
              />
            </div>
            <DialogFooter className="pt-2 flex gap-2">
              <Button type="button" variant="outline" className="flex-1 text-xs h-9 font-semibold" onClick={() => setIsEditOversOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submittingOvers} className="flex-1 text-xs h-9 font-bold">
                {submittingOvers ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Ball Dialog Modal */}
      <Dialog open={isEditBallOpen} onOpenChange={setIsEditBallOpen}>
        <DialogContent className="max-w-md bg-card border-border/40 text-foreground p-6 rounded-2xl max-h-[95vh] flex flex-col overflow-hidden shadow-2xl">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-primary to-purple-500" />
          
          <DialogHeader className="pb-2">
            <DialogTitle className="text-lg font-black text-primary uppercase tracking-widest flex items-center gap-1.5 leading-none">
              Edit Ball Event
            </DialogTitle>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-1">
              Correct historical match events
            </p>
          </DialogHeader>

          {editingBall && (() => {
            const ballInnings = innings?.find((inn: any) => inn.id === editingBall.innings_id);
            const battingPlayers = ballInnings ? players.filter((p: any) => p.team_id === ballInnings.batting_team_id) : [];
            const bowlingPlayers = ballInnings ? players.filter((p: any) => p.team_id === ballInnings.bowling_team_id) : [];

            return (
              <>
                <div className="space-y-4 my-4 flex-1 overflow-y-auto pr-1 max-h-[calc(90vh-180px)]">
                  <div className="space-y-2">
                    <label className="text-[10px] text-muted-foreground font-black uppercase tracking-wider block">Batter</label>
                    <Select value={editBatterId} onValueChange={setEditBatterId}>
                      <SelectTrigger className="w-full h-10 text-xs border-border bg-card text-foreground">
                        <SelectValue placeholder="Select Batter" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border border-border text-foreground text-xs shadow-md">
                        {battingPlayers.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] text-muted-foreground font-black uppercase tracking-wider block">Bowler</label>
                    <Select value={editBowlerId} onValueChange={setEditBowlerId}>
                      <SelectTrigger className="w-full h-10 text-xs border-border bg-card text-foreground">
                        <SelectValue placeholder="Select Bowler" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border border-border text-foreground text-xs shadow-md">
                        {bowlingPlayers.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] text-muted-foreground font-black uppercase tracking-wider block">Runs (off bat)</label>
                      <Select value={String(editRuns)} onValueChange={(v) => setEditRuns(parseInt(v))}>
                        <SelectTrigger className="w-full h-10 text-xs border-border bg-card text-foreground">
                          <SelectValue placeholder="Runs" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border border-border text-foreground text-xs shadow-md">
                          {["0", "1", "2", "3", "4", "5", "6"].map((r) => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] text-muted-foreground font-black uppercase tracking-wider block">Extra Type</label>
                      <Select value={editExtraType} onValueChange={setEditExtraType}>
                        <SelectTrigger className="w-full h-10 text-xs border-border bg-card text-foreground">
                          <SelectValue placeholder="Extra Type" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border border-border text-foreground text-xs shadow-md">
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="wide">Wide</SelectItem>
                          <SelectItem value="no_ball">No Ball</SelectItem>
                          <SelectItem value="bye">Bye</SelectItem>
                          <SelectItem value="leg_bye">Leg Bye</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {editExtraType !== "none" && (
                    <div className="space-y-2">
                      <label className="text-[10px] text-muted-foreground font-black uppercase tracking-wider block">Extra Runs</label>
                      <Input
                        type="number"
                        min="0"
                        max="10"
                        value={editExtraRuns}
                        onChange={(e) => setEditExtraRuns(parseInt(e.target.value) || 0)}
                        className="w-full h-10 text-xs bg-card border-border text-foreground"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between py-2 border-t border-border/20 mt-2">
                    <span className="text-xs font-semibold text-muted-foreground">Is Wicket?</span>
                    <button
                      type="button"
                      onClick={() => setEditIsWicket(!editIsWicket)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        editIsWicket ? "bg-destructive" : "bg-muted"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          editIsWicket ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {editIsWicket && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="space-y-2">
                        <label className="text-[10px] text-muted-foreground font-black uppercase tracking-wider block">Wicket Type</label>
                        <Select value={editWicketType} onValueChange={setEditWicketType}>
                          <SelectTrigger className="w-full h-10 text-xs border-border bg-card text-foreground">
                            <SelectValue placeholder="Wicket Type" />
                          </SelectTrigger>
                          <SelectContent className="bg-card border border-border text-foreground text-xs shadow-md">
                            <SelectItem value="bowled">Bowled</SelectItem>
                            <SelectItem value="caught">Caught</SelectItem>
                            <SelectItem value="run_out">Run Out</SelectItem>
                            <SelectItem value="lbw">LBW</SelectItem>
                            <SelectItem value="stumped">Stumped</SelectItem>
                            <SelectItem value="hit_wicket">Hit Wicket</SelectItem>
                            <SelectItem value="retired_hurt">Retired Hurt</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {editWicketType === "caught" && (
                        <div className="space-y-2">
                          <label className="text-[10px] text-muted-foreground font-black uppercase tracking-wider block">Caught By</label>
                          <Select value={editCaughtById} onValueChange={setEditCaughtById}>
                            <SelectTrigger className="w-full h-10 text-xs border-border bg-card text-foreground">
                              <SelectValue placeholder="Select Fielder" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border border-border text-foreground text-xs shadow-md">
                              {bowlingPlayers.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <DialogFooter className="flex flex-col sm:flex-row gap-2 border-t border-border/20 pt-4">
                  <div className="flex gap-2 mr-auto">
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleDeleteBall}
                      disabled={isSavingEdit}
                      className="h-9 text-xs font-bold rounded-xl active:scale-95 cursor-pointer"
                    >
                      Delete Ball
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        setIsSavingEdit(true);
                        try {
                          await ballService.updateBall(editingBall.id, {
                            batter_id: editingBall.batter_id,
                            non_striker_id: editingBall.non_striker_id,
                            bowler_id: editingBall.bowler_id,
                            runs: editingBall.runs,
                            extra_runs: editingBall.extra_runs,
                            extra_type: editingBall.extra_type,
                            is_wicket: editingBall.is_wicket,
                            wicket_type: editingBall.wicket_type,
                            is_legal: editingBall.is_legal,
                            caught_by_id: editingBall.caught_by_id,
                          });
                          toast.success("Recalculation completed");
                          queryClient.invalidateQueries({ queryKey: ["match", id] });
                          setIsEditBallOpen(false);
                        } catch (err: any) {
                          toast.error(err.response?.data?.message || err.message || "Recalculation failed");
                        } finally {
                          setIsSavingEdit(false);
                        }
                      }}
                      disabled={isSavingEdit}
                      className="h-9 text-xs font-bold border-primary/20 text-primary hover:bg-primary/10 rounded-xl active:scale-95 cursor-pointer"
                    >
                      Recalculate
                    </Button>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsEditBallOpen(false)}
                      disabled={isSavingEdit}
                      className="h-9 text-xs font-bold rounded-xl cursor-pointer"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={handleSaveEdit}
                      disabled={isSavingEdit}
                      className="h-9 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl active:scale-95 cursor-pointer"
                    >
                      {isSavingEdit ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Replace Player Dialog Modal */}
      <Dialog open={isReplaceModalOpen} onOpenChange={setIsReplaceModalOpen}>
        <DialogContent className="max-w-md bg-card border border-border text-foreground p-6 rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              Replace Player in Match
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Replace all references to <strong className="text-foreground">{replaceOldPlayerName}</strong> (as batter, bowler, or fielder) with the correct player profile.
            </p>
          </DialogHeader>

          {/* Mode Selector Tabs */}
          <div className="flex border border-border/60 my-3 bg-muted/40 p-1 rounded-xl">
            <button
              type="button"
              className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-lg transition-all ${
                replaceMode === "existing"
                  ? "bg-background text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setReplaceMode("existing")}
            >
              Existing Profile
            </button>
            <button
              type="button"
              className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-lg transition-all ${
                replaceMode === "new"
                  ? "bg-background text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setReplaceMode("new")}
            >
              New Profile
            </button>
          </div>

          <form onSubmit={handleReplacePlayerSubmit} className="space-y-4 pt-2">
            {replaceMode === "existing" ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="replace-search">Search Player</Label>
                  <Input
                    id="replace-search"
                    placeholder="Type name or mobile..."
                    value={replaceSearchQuery}
                    onChange={(e) => setReplaceSearchQuery(e.target.value)}
                    className="bg-background border-border"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="replacement-player">Select Profile</Label>
                  <select
                    id="replacement-player"
                    value={selectedReplacementPlayerId}
                    onChange={(e) => setSelectedReplacementPlayerId(e.target.value)}
                    className="w-full h-10 px-3 py-2 text-xs border border-border bg-background rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    required
                  >
                    <option value="">-- Choose Replacement --</option>
                    {filteredReplacementPlayers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.mobile ? `(${p.mobile})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="space-y-3 animate-in fade-in duration-200">
                <div className="space-y-1.5">
                  <Label htmlFor="new-replace-name">Player Name</Label>
                  <Input
                    id="new-replace-name"
                    placeholder="Enter full name"
                    value={replaceNewPlayerName}
                    onChange={(e) => setReplaceNewPlayerName(e.target.value)}
                    className="bg-background border-border"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="new-replace-mobile">Mobile Number (Optional)</Label>
                  <Input
                    id="new-replace-mobile"
                    type="tel"
                    placeholder="Enter mobile"
                    value={replaceNewPlayerMobile}
                    onChange={(e) => setReplaceNewPlayerMobile(e.target.value)}
                    className="bg-background border-border"
                  />
                </div>
              </div>
            )}

            <DialogFooter className="pt-2 flex gap-2">
              <Button type="button" variant="outline" className="text-xs h-9 font-semibold" onClick={() => setIsReplaceModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submittingReplace} className="text-xs h-9 font-bold">
                {submittingReplace ? "Processing..." : "Confirm Replacement"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </AppShell>
  );
}
