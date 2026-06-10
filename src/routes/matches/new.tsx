import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useRef } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { teamService, type Team } from "@/lib/services/teamService";
import { matchService } from "@/lib/services/matchService";
import { playerService, type Player } from "@/lib/services/playerService";
import { inningsService } from "@/lib/services/inningsService";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Check,
  Info,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Trophy,
  Star,
  Users,
  Calendar,
  MapPin,
  UserPlus,
  Trash2,
  Crown,
  ShieldAlert,
  Loader2,
  Clock,
  Sparkles,
  Award
} from "lucide-react";

export const Route = createFileRoute("/matches/new")({ component: NewMatch });

interface GuestPlayer {
  id: string; // generated client-side: e.g. "guest-uuid"
  name: string;
  nickname?: string;
  jersey_number?: string;
  role?: string;
}

// Similarity checker for duplicate prevention warning
function getSimilarity(s1: string, s2: string): number {
  const norm1 = s1.trim().toLowerCase();
  const norm2 = s2.trim().toLowerCase();
  if (!norm1 || !norm2) return 0;
  if (norm1 === norm2) return 1.0;
  if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.85;

  let prefix = 0;
  for (let i = 0; i < Math.min(norm1.length, norm2.length); i++) {
    if (norm1[i] === norm2[i]) prefix++;
    else break;
  }
  if (prefix >= 4) return 0.8;

  return 0;
}

function formatRelativeTime(dateStr?: string) {
  if (!dateStr) return "Never";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "Never";
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - d.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return `${diffDays} Days Ago`;
}

function calculateRating(stats?: any) {
  const base = 3.5;
  const runs = stats?.runs || 0;
  const wickets = stats?.wickets || 0;
  const matches = stats?.matches || 0;
  
  const runsBonus = Math.min(1.0, runs / 500);
  const wicketsBonus = Math.min(1.0, wickets / 20);
  const matchesBonus = Math.min(0.5, matches / 10);
  
  return parseFloat(Math.min(5.0, Math.max(3.0, base + runsBonus + wicketsBonus + matchesBonus)).toFixed(1));
}

function triggerHaptic() {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    try {
      navigator.vibrate(40);
    } catch (e) {}
  }
}

function NewMatch() {
  const nav = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [teams, setTeams] = useState<Team[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Match configurations
  const [form, setForm] = useState({
    overs: 6,
    wide_run: 1,
    noball_run: 1,
    match_type: "T6",
    ground: "",
    match_date: new Date().toISOString().slice(0, 16),
    last_man_batting: false,
    batting_first_id: "",
  });

  // Team Naming states
  const [teamAName, setTeamAName] = useState("");
  const [teamBName, setTeamBName] = useState("");
  const [selectedTeamAId, setSelectedTeamAId] = useState<string | null>(null);
  const [selectedTeamBId, setSelectedTeamBId] = useState<string | null>(null);

  // Suggestion UI toggles
  const [showASuggestions, setShowASuggestions] = useState(false);
  const [showBSuggestions, setShowBSuggestions] = useState(false);

  // Squad selection lists
  const [selectedPlayersA, setSelectedPlayersA] = useState<string[]>([]);
  const [selectedPlayersB, setSelectedPlayersB] = useState<string[]>([]);
  const [rolesA, setRolesA] = useState<Record<string, "Captain" | "Vice Captain" | "Wicket Keeper" | "">>({});
  const [rolesB, setRolesB] = useState<Record<string, "Captain" | "Vice Captain" | "Wicket Keeper" | "">>({});

  // Search filter
  const [searchA, setSearchA] = useState("");
  const [searchB, setSearchB] = useState("");

  // Guest players
  const [guestPlayersA, setGuestPlayersA] = useState<GuestPlayer[]>([]);
  const [guestPlayersB, setGuestPlayersB] = useState<GuestPlayer[]>([]);
  const [isGuestModalOpen, setIsGuestModalOpen] = useState(false);
  const [guestTargetTeam, setGuestTargetTeam] = useState<"a" | "b">("a");
  const [newGuestName, setNewGuestName] = useState("");
  const [newGuestNickname, setNewGuestNickname] = useState("");
  const [newGuestJersey, setNewGuestJersey] = useState("");
  const [newGuestRole, setNewGuestRole] = useState("All-rounder");

  // Roster Tab
  const [rosterTab, setRosterTab] = useState<"a" | "b">("a");

  // Role context menu
  const [roleMenuPlayerId, setRoleMenuPlayerId] = useState<string | null>(null);
  const [roleMenuTeam, setRoleMenuTeam] = useState<"a" | "b">("a");

  // Import team modal
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importTargetTeam, setImportTargetTeam] = useState<"a" | "b">("a");
  const [importSourceTeamId, setImportSourceTeamId] = useState("");

  // Submitting loader status
  const [isStartingMatch, setIsStartingMatch] = useState(false);
  const [startStatusText, setStartStatusText] = useState("");

  const teamAInputRef = useRef<HTMLInputElement>(null);

  // Load backend teams and players
  const loadData = async () => {
    try {
      const teamList = await teamService.getTeams();
      const playerList = await playerService.getPlayers();
      setTeams(teamList);
      setAllPlayers(playerList);
    } catch (err: any) {
      toast.error("Failed to load initial teams and players data.");
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    loadData();
    // Auto focus Team A Input
    setTimeout(() => {
      teamAInputRef.current?.focus();
    }, 100);
  }, []);

  // Compute suggestions
  const suggestionsA = useMemo(() => {
    if (!teamAName.trim()) return [];
    return teams.filter(t => t.name.toLowerCase().includes(teamAName.toLowerCase()) && t.id !== selectedTeamBId);
  }, [teamAName, teams, selectedTeamBId]);

  const suggestionsB = useMemo(() => {
    if (!teamBName.trim()) return [];
    return teams.filter(t => t.name.toLowerCase().includes(teamBName.toLowerCase()) && t.id !== selectedTeamAId);
  }, [teamBName, teams, selectedTeamAId]);

  // Duplicate Warning checks
  const similarTeamA = useMemo(() => {
    if (!teamAName.trim() || selectedTeamAId) return null;
    return teams.find(t => {
      const sim = getSimilarity(teamAName, t.name);
      return sim >= 0.75 && sim < 1.0;
    });
  }, [teamAName, teams, selectedTeamAId]);

  const similarTeamB = useMemo(() => {
    if (!teamBName.trim() || selectedTeamBId) return null;
    return teams.find(t => {
      const sim = getSimilarity(teamBName, t.name);
      return sim >= 0.75 && sim < 1.0;
    });
  }, [teamBName, teams, selectedTeamBId]);

  // Team recognition cards details
  const teamARecognition = useMemo(() => {
    if (!selectedTeamAId) return null;
    const teamObj = teams.find(t => t.id === selectedTeamAId);
    if (!teamObj) return null;
    const playersInTeam = allPlayers.filter(p => p.team_id === selectedTeamAId);
    const captain = playersInTeam.find(p => p.role?.toLowerCase() === "captain");
    return {
      name: teamObj.name,
      playersCount: playersInTeam.length,
      captainName: captain?.name || "None Specified",
    };
  }, [selectedTeamAId, teams, allPlayers]);

  const teamBRecognition = useMemo(() => {
    if (!selectedTeamBId) return null;
    const teamObj = teams.find(t => t.id === selectedTeamBId);
    if (!teamObj) return null;
    const playersInTeam = allPlayers.filter(p => p.team_id === selectedTeamBId);
    const captain = playersInTeam.find(p => p.role?.toLowerCase() === "captain");
    return {
      name: teamObj.name,
      playersCount: playersInTeam.length,
      captainName: captain?.name || "None Specified",
    };
  }, [selectedTeamBId, teams, allPlayers]);

  // Roster lists for Step 2
  // We union: 
  // 1) players belonging to this team ID
  // 2) any players with other team IDs imported manually
  // 3) guest players
  const availablePlayersA = useMemo(() => {
    return [...allPlayers];
  }, [allPlayers]);

  const availablePlayersB = useMemo(() => {
    return [...allPlayers];
  }, [allPlayers]);

  // Filter lists based on search
  const filteredPlayersA = useMemo(() => {
    const query = searchA.toLowerCase();
    const list = [...availablePlayersA];
    
    // Add guest players
    guestPlayersA.forEach(g => {
      list.push({
        id: g.id,
        name: g.name,
        team_id: selectedTeamAId || "",
        role: g.role,
        jersey_number: g.jersey_number,
        mobile: "",
        stats: { matches: 0, runs: 0, wickets: 0, sr: "0.0", econ: "0.0" }
      });
    });

    // Sort:
    // 1. Selected players first
    // 2. Players belonging to Team A next
    // 3. Alphabetically by name
    list.sort((a, b) => {
      const aSel = selectedPlayersA.includes(a.id);
      const bSel = selectedPlayersA.includes(b.id);
      if (aSel && !bSel) return -1;
      if (!aSel && bSel) return 1;

      const aTeam = a.team_id === selectedTeamAId;
      const bTeam = b.team_id === selectedTeamAId;
      if (aTeam && !bTeam) return -1;
      if (!aTeam && bTeam) return 1;

      return a.name.localeCompare(b.name);
    });

    if (!query) return list;
    return list.filter(p => 
      p.name.toLowerCase().includes(query) ||
      (p.role && p.role.toLowerCase().includes(query)) ||
      (p.jersey_number && p.jersey_number.includes(query))
    );
  }, [availablePlayersA, guestPlayersA, searchA, selectedTeamAId, selectedPlayersA]);

  const filteredPlayersB = useMemo(() => {
    const query = searchB.toLowerCase();
    const list = [...availablePlayersB];

    // Add guest players
    guestPlayersB.forEach(g => {
      list.push({
        id: g.id,
        name: g.name,
        team_id: selectedTeamBId || "",
        role: g.role,
        jersey_number: g.jersey_number,
        mobile: "",
        stats: { matches: 0, runs: 0, wickets: 0, sr: "0.0", econ: "0.0" }
      });
    });

    // Sort:
    // 1. Selected players first
    // 2. Players belonging to Team B next
    // 3. Alphabetically by name
    list.sort((a, b) => {
      const aSel = selectedPlayersB.includes(a.id);
      const bSel = selectedPlayersB.includes(b.id);
      if (aSel && !bSel) return -1;
      if (!aSel && bSel) return 1;

      const aTeam = a.team_id === selectedTeamBId;
      const bTeam = b.team_id === selectedTeamBId;
      if (aTeam && !bTeam) return -1;
      if (!aTeam && bTeam) return 1;

      return a.name.localeCompare(b.name);
    });

    if (!query) return list;
    return list.filter(p => 
      p.name.toLowerCase().includes(query) ||
      (p.role && p.role.toLowerCase().includes(query)) ||
      (p.jersey_number && p.jersey_number.includes(query))
    );
  }, [availablePlayersB, guestPlayersB, searchB, selectedTeamBId, selectedPlayersB]);

  // Handle Team A selection
  const handleSelectTeamA = (team: Team) => {
    setTeamAName(team.name);
    setSelectedTeamAId(team.id);
    setShowASuggestions(false);
    
    // Load playing XI memory if exists
    const remembered = localStorage.getItem(`criclab_prev_playing_xi_${team.id}`);
    if (remembered) {
      try {
        setSelectedPlayersA(JSON.parse(remembered));
      } catch (e) {}
    } else {
      setSelectedPlayersA([]);
    }
  };

  // Handle Team B selection
  const handleSelectTeamB = (team: Team) => {
    setTeamBName(team.name);
    setSelectedTeamBId(team.id);
    setShowBSuggestions(false);

    // Load playing XI memory if exists
    const remembered = localStorage.getItem(`criclab_prev_playing_xi_${team.id}`);
    if (remembered) {
      try {
        setSelectedPlayersB(JSON.parse(remembered));
      } catch (e) {}
    } else {
      setSelectedPlayersB([]);
    }
  };

  const handleStep1Submit = () => {
    if (!teamAName.trim() || !teamBName.trim()) {
      toast.error("Both Team A and Team B names are required");
      return;
    }
    if (teamAName.trim().toLowerCase() === teamBName.trim().toLowerCase()) {
      toast.error("Please pick two different teams");
      return;
    }
    setStep(2);
  };

  // Squad selection toggle
  const togglePlayerASelection = (playerId: string) => {
    if (selectedPlayersB.includes(playerId)) {
      toast.error("Player is already selected in Team B");
      return;
    }
    triggerHaptic();
    setSelectedPlayersA(prev => 
      prev.includes(playerId) ? prev.filter(id => id !== playerId) : [...prev, playerId]
    );
  };

  const togglePlayerBSelection = (playerId: string) => {
    if (selectedPlayersA.includes(playerId)) {
      toast.error("Player is already selected in Team A");
      return;
    }
    triggerHaptic();
    setSelectedPlayersB(prev => 
      prev.includes(playerId) ? prev.filter(id => id !== playerId) : [...prev, playerId]
    );
  };

  // Bulk selectors
  const selectAllA = () => {
    const allIds = filteredPlayersA.map(p => p.id).filter(id => !selectedPlayersB.includes(id));
    setSelectedPlayersA(allIds);
  };

  const selectAllB = () => {
    const allIds = filteredPlayersB.map(p => p.id).filter(id => !selectedPlayersA.includes(id));
    setSelectedPlayersB(allIds);
  };

  const deselectAllA = () => {
    setSelectedPlayersA([]);
  };

  const deselectAllB = () => {
    setSelectedPlayersB([]);
  };

  // Suggested XI
  const useSuggestedXIA = () => {
    const sorted = [...filteredPlayersA]
      .filter(p => !selectedPlayersB.includes(p.id))
      .sort((a, b) => calculateRating(b.stats) - calculateRating(a.stats));
    const top11 = sorted.slice(0, 11).map(p => p.id);
    setSelectedPlayersA(top11);
    toast.success("Loaded top-rated players into Team A Suggested XI");
  };

  const useSuggestedXIB = () => {
    const sorted = [...filteredPlayersB]
      .filter(p => !selectedPlayersA.includes(p.id))
      .sort((a, b) => calculateRating(b.stats) - calculateRating(a.stats));
    const top11 = sorted.slice(0, 11).map(p => p.id);
    setSelectedPlayersB(top11);
    toast.success("Loaded top-rated players into Team B Suggested XI");
  };

  // Restore Previous Playing XI
  const usePreviousXIA = () => {
    if (selectedTeamAId) {
      const remembered = localStorage.getItem(`criclab_prev_playing_xi_${selectedTeamAId}`);
      if (remembered) {
        try {
          const ids = JSON.parse(remembered) as string[];
          // Only select those that exist in filtered list and not in the other team
          const validIds = ids.filter(id => filteredPlayersA.some(fp => fp.id === id) && !selectedPlayersB.includes(id));
          setSelectedPlayersA(validIds);
          toast.success("Restored previous lineup from team memory");
          return;
        } catch (e) {}
      }
    }
    // Fallback: select first 11 available
    const fallbackIds = filteredPlayersA.filter(p => !selectedPlayersB.includes(p.id)).slice(0, 11).map(p => p.id);
    setSelectedPlayersA(fallbackIds);
    toast.info("No previous memory found. Selected first 11 players.");
  };

  const usePreviousXIB = () => {
    if (selectedTeamBId) {
      const remembered = localStorage.getItem(`criclab_prev_playing_xi_${selectedTeamBId}`);
      if (remembered) {
        try {
          const ids = JSON.parse(remembered) as string[];
          const validIds = ids.filter(id => filteredPlayersB.some(fp => fp.id === id) && !selectedPlayersA.includes(id));
          setSelectedPlayersB(validIds);
          toast.success("Restored previous lineup from team memory");
          return;
        } catch (e) {}
      }
    }
    // Fallback: select first 11 available
    const fallbackIds = filteredPlayersB.filter(p => !selectedPlayersA.includes(p.id)).slice(0, 11).map(p => p.id);
    setSelectedPlayersB(fallbackIds);
    toast.info("No previous memory found. Selected first 11 players.");
  };

  // Guest creation
  const handleOpenGuestModal = (team: "a" | "b") => {
    setGuestTargetTeam(team);
    setNewGuestName("");
    setNewGuestNickname("");
    setNewGuestJersey("");
    setNewGuestRole("All-rounder");
    setIsGuestModalOpen(true);
  };

  const handleAddGuestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGuestName.trim()) {
      toast.error("Guest name is required");
      return;
    }
    const guestId = `guest-${Math.random().toString(36).substr(2, 9)}`;
    const guestObj: GuestPlayer = {
      id: guestId,
      name: newGuestName.trim(),
      nickname: newGuestNickname.trim() || undefined,
      jersey_number: newGuestJersey.trim() || undefined,
      role: newGuestRole,
    };

    if (guestTargetTeam === "a") {
      setGuestPlayersA(prev => [...prev, guestObj]);
      setSelectedPlayersA(prev => [...prev, guestId]);
    } else {
      setGuestPlayersB(prev => [...prev, guestObj]);
      setSelectedPlayersB(prev => [...prev, guestId]);
    }

    setIsGuestModalOpen(false);
    toast.success(`Guest player "${newGuestName}" added to the roster!`);
  };

  // Import team players modal
  const handleOpenImportModal = (team: "a" | "b") => {
    setImportTargetTeam(team);
    setImportSourceTeamId("");
    setIsImportModalOpen(true);
  };

  const handleImportSubmit = () => {
    if (!importSourceTeamId) {
      toast.error("Please pick a team to import players from");
      return;
    }
    const sourcePlayers = allPlayers.filter(p => p.team_id === importSourceTeamId);
    if (sourcePlayers.length === 0) {
      toast.error("No players found in selected team");
      return;
    }

    const playerIds = sourcePlayers.map(p => p.id);

    if (importTargetTeam === "a") {
      setSelectedPlayersA(prev => {
        const uniqueNew = playerIds.filter(id => !prev.includes(id) && !selectedPlayersB.includes(id));
        return [...prev, ...uniqueNew];
      });
      toast.success(`Selected ${sourcePlayers.length} players from imported team roster into Team A`);
    } else {
      setSelectedPlayersB(prev => {
        const uniqueNew = playerIds.filter(id => !prev.includes(id) && !selectedPlayersA.includes(id));
        return [...prev, ...uniqueNew];
      });
      toast.success(`Selected ${sourcePlayers.length} players from imported team roster into Team B`);
    }
    setIsImportModalOpen(false);
  };

  // Role contexts
  const handleSetRole = (role: "Captain" | "Vice Captain" | "Wicket Keeper" | "") => {
    if (!roleMenuPlayerId) return;
    
    if (roleMenuTeam === "a") {
      // Clear previous captain/vice captain/wicket keeper if setting new ones
      const newRoles = { ...rolesA };
      if (role) {
        Object.keys(newRoles).forEach(k => {
          if (newRoles[k] === (role as any)) newRoles[k] = "";
        });
      }
      newRoles[roleMenuPlayerId] = role;
      setRolesA(newRoles);
    } else {
      const newRoles = { ...rolesB };
      if (role) {
        Object.keys(newRoles).forEach(k => {
          if (newRoles[k] === (role as any)) newRoles[k] = "";
        });
      }
      newRoles[roleMenuPlayerId] = role;
      setRolesB(newRoles);
    }
    setRoleMenuPlayerId(null);
  };

  // Validation before review
  const handleProceedToReview = () => {
    if (selectedPlayersA.length < 2) {
      toast.error("Team A must have at least 2 players selected");
      return;
    }
    if (selectedPlayersB.length < 2) {
      toast.error("Team B must have at least 2 players selected");
      return;
    }

    // Role validations: exactly 1 Captain per team
    const capsA = Object.values(rolesA).filter(r => r === "Captain").length;
    const capsB = Object.values(rolesB).filter(r => r === "Captain").length;

    if (capsA !== 1) {
      toast.error("Please assign exactly 1 Captain (👑) for Team A");
      return;
    }
    if (capsB !== 1) {
      toast.error("Please assign exactly 1 Captain (👑) for Team B");
      return;
    }

    setStep(3);
  };

  // Start scoring match setup flow
  const handleStartMatch = async () => {
    setIsStartingMatch(true);
    try {
      // 1. Create Team A if new
      let finalTeamAId = selectedTeamAId;
      if (!finalTeamAId) {
        setStartStatusText(`Creating Team A: "${teamAName}"...`);
        const newTeam = await teamService.createTeam(teamAName);
        finalTeamAId = newTeam.id;
      }

      // 2. Create Team B if new
      let finalTeamBId = selectedTeamBId;
      if (!finalTeamBId) {
        setStartStatusText(`Creating Team B: "${teamBName}"...`);
        const newTeam = await teamService.createTeam(teamBName);
        finalTeamBId = newTeam.id;
      }

      // Store in memory
      localStorage.setItem(`criclab_prev_playing_xi_${finalTeamAId}`, JSON.stringify(selectedPlayersA));
      localStorage.setItem(`criclab_prev_playing_xi_${finalTeamBId}`, JSON.stringify(selectedPlayersB));

      // Map to track created guest/imported player ids
      const finalPlayerIdsA: string[] = [];
      const finalPlayerIdsB: string[] = [];

      // 3. Create guest players and update roles/team for Team A
      setStartStatusText("Registering Team A squad...");
      for (const pId of selectedPlayersA) {
        if (pId.startsWith("guest-") || pId.startsWith("imported-")) {
          const guest = guestPlayersA.find(g => g.id === pId);
          if (guest) {
            const created = await playerService.createPlayer({
              name: guest.name,
              team_id: finalTeamAId,
            });
            finalPlayerIdsA.push(created.id);
            // Save role/jersey number
            const roleVal = rolesA[pId] || guest.role || "All-rounder";
            await playerService.updatePlayerProfile(created.id, {
              role: roleVal,
              jersey_number: guest.jersey_number || undefined,
            });
          }
        } else {
          finalPlayerIdsA.push(pId);
          // Update profile role if modified, and associate player with team_id for this match
          const updateData: Partial<Player> = { team_id: finalTeamAId };
          if (rolesA[pId]) {
            updateData.role = rolesA[pId];
          }
          await playerService.updatePlayerProfile(pId, updateData);
        }
      }

      // 4. Create guest players and update roles/team for Team B
      setStartStatusText("Registering Team B squad...");
      for (const pId of selectedPlayersB) {
        if (pId.startsWith("guest-") || pId.startsWith("imported-")) {
          const guest = guestPlayersB.find(g => g.id === pId);
          if (guest) {
            const created = await playerService.createPlayer({
              name: guest.name,
              team_id: finalTeamBId,
            });
            finalPlayerIdsB.push(created.id);
            // Save role/jersey number
            const roleVal = rolesB[pId] || guest.role || "All-rounder";
            await playerService.updatePlayerProfile(created.id, {
              role: roleVal,
              jersey_number: guest.jersey_number || undefined,
            });
          }
        } else {
          finalPlayerIdsB.push(pId);
          // Update profile role if modified, and associate player with team_id for this match
          const updateData: Partial<Player> = { team_id: finalTeamBId };
          if (rolesB[pId]) {
            updateData.role = rolesB[pId];
          }
          await playerService.updatePlayerProfile(pId, updateData);
        }
      }

      // 5. Create Match
      setStartStatusText("Creating match entry...");
      const matchRes = await matchService.createMatch({
        team_a_id: finalTeamAId,
        team_b_id: finalTeamBId,
        overs: form.overs,
        wide_run: form.wide_run,
        noball_run: form.noball_run,
        match_type: form.match_type,
        ground: form.ground || "Main Ground",
        match_date: form.match_date,
        last_man_batting: form.last_man_batting,
      });

      // 6. Initialize Innings 1
      setStartStatusText("Initializing first innings...");
      await inningsService.startInnings(matchRes.id, {
        batting_team_id: finalTeamAId,
        bowling_team_id: finalTeamBId,
        innings_no: 1,
      });

      toast.success("Match started successfully!");
      nav({ to: `/matches/$id/score`, params: { id: matchRes.id } });
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to initialize match");
    } finally {
      setIsStartingMatch(false);
    }
  };

  return (
    <AppShell title="Match setup">
      {/* Wizard Step Indicator */}
      <div className="flex items-center justify-between bg-muted/40 p-1.5 rounded-2xl mb-6 border border-border/60 backdrop-blur-md">
        {[
          { label: "1. Settings", stepNo: 1 },
          { label: "2. Squads", stepNo: 2 },
          { label: "3. Review", stepNo: 3 },
        ].map(s => (
          <button
            key={s.stepNo}
            disabled={true}
            className={`flex-1 py-2 text-xs font-bold uppercase rounded-xl transition-all ${
              step === s.stepNo
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 scale-105"
                : "text-muted-foreground opacity-60"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loadingData ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground font-semibold">Loading setup configs...</span>
        </div>
      ) : (
        <>
          {/* STEP 1: MATCH SETTINGS & TEAM NAMING */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Team A Input Card */}
                <div className="p-5 bg-card/45 border border-border/80 rounded-3xl relative flex flex-col gap-3 shadow-md backdrop-blur-md">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-1">
                      🏏 Team A (Batting First)
                    </Label>
                  </div>
                  
                  <div className="relative">
                    <Input
                      ref={teamAInputRef}
                      placeholder="Type Team A name"
                      value={teamAName}
                      onChange={(e) => {
                        setTeamAName(e.target.value);
                        setSelectedTeamAId(null);
                        setShowASuggestions(true);
                      }}
                      onFocus={() => setShowASuggestions(true)}
                      onBlur={() => setTimeout(() => setShowASuggestions(false), 200)}
                      className="bg-background/90 border-border/80 text-foreground placeholder:text-muted-foreground/50 h-11 text-sm font-bold tracking-tight rounded-xl focus:ring-2 focus:ring-primary focus:border-primary border shadow-inner"
                    />

                    {/* Suggestions Dropdown */}
                    {showASuggestions && suggestionsA.length > 0 && (
                      <div className="absolute z-50 w-full mt-1.5 bg-card border border-border rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-border/60">
                        {suggestionsA.map(t => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => handleSelectTeamA(t)}
                            className="w-full px-4 py-2.5 text-left text-xs font-semibold hover:bg-muted/80 flex justify-between items-center transition-colors"
                          >
                            <span>{t.name}</span>
                            <span className="text-[10px] text-muted-foreground font-bold bg-muted px-2 py-0.5 rounded-full">
                              Select
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Inline Creation Suggestion */}
                  {teamAName.trim() && !selectedTeamAId && suggestionsA.length === 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        toast.success(`Will create new team "${teamAName}"`);
                        setSelectedTeamAId(null);
                      }}
                      className="p-3 bg-primary/10 border border-primary/20 text-primary text-xs font-bold rounded-xl flex items-center justify-between hover:bg-primary/15 transition-all"
                    >
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="h-4 w-4" /> Create New Team "{teamAName}"
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  )}

                  {/* Similarity Badge */}
                  {similarTeamA && (
                    <div className="bg-amber-500/10 border border-amber-500/25 text-amber-500 rounded-xl p-3 text-xs flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>
                        Similar team exists: <strong className="underline">{similarTeamA.name}</strong>. Keep typing or select it.
                      </span>
                    </div>
                  )}

                  {/* Recognition Card */}
                  {teamARecognition && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl p-3 flex items-start gap-3">
                      <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center font-bold text-sm shrink-0">
                        {teamARecognition.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="text-xs">
                        <div className="font-extrabold text-foreground">{teamARecognition.name}</div>
                        <div className="text-muted-foreground mt-0.5 font-medium">
                          👥 {teamARecognition.playersCount} Players · 👑 Captain: {teamARecognition.captainName}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Team B Input Card */}
                <div className="p-5 bg-card/45 border border-border/80 rounded-3xl relative flex flex-col gap-3 shadow-md backdrop-blur-md">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-1">
                      🏏 Team B (Bowling First)
                    </Label>
                  </div>
                  
                  <div className="relative">
                    <Input
                      placeholder="Type Team B name"
                      value={teamBName}
                      onChange={(e) => {
                        setTeamBName(e.target.value);
                        setSelectedTeamBId(null);
                        setShowBSuggestions(true);
                      }}
                      onFocus={() => setShowBSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowBSuggestions(false), 200)}
                      className="bg-background/90 border-border/80 text-foreground placeholder:text-muted-foreground/50 h-11 text-sm font-bold tracking-tight rounded-xl focus:ring-2 focus:ring-primary focus:border-primary border shadow-inner"
                    />

                    {/* Suggestions Dropdown */}
                    {showBSuggestions && suggestionsB.length > 0 && (
                      <div className="absolute z-50 w-full mt-1.5 bg-card border border-border rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-border/60">
                        {suggestionsB.map(t => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => handleSelectTeamB(t)}
                            className="w-full px-4 py-2.5 text-left text-xs font-semibold hover:bg-muted/80 flex justify-between items-center transition-colors"
                          >
                            <span>{t.name}</span>
                            <span className="text-[10px] text-muted-foreground font-bold bg-muted px-2 py-0.5 rounded-full">
                              Select
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Inline Creation Suggestion */}
                  {teamBName.trim() && !selectedTeamBId && suggestionsB.length === 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        toast.success(`Will create new team "${teamBName}"`);
                        setSelectedTeamBId(null);
                      }}
                      className="p-3 bg-primary/10 border border-primary/20 text-primary text-xs font-bold rounded-xl flex items-center justify-between hover:bg-primary/15 transition-all"
                    >
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="h-4 w-4" /> Create New Team "{teamBName}"
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  )}

                  {/* Similarity Badge */}
                  {similarTeamB && (
                    <div className="bg-amber-500/10 border border-amber-500/25 text-amber-500 rounded-xl p-3 text-xs flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>
                        Similar team exists: <strong className="underline">{similarTeamB.name}</strong>. Keep typing or select it.
                      </span>
                    </div>
                  )}

                  {/* Recognition Card */}
                  {teamBRecognition && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl p-3 flex items-start gap-3">
                      <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center font-bold text-sm shrink-0">
                        {teamBRecognition.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="text-xs">
                        <div className="font-extrabold text-foreground">{teamBRecognition.name}</div>
                        <div className="text-muted-foreground mt-0.5 font-medium">
                          👥 {teamBRecognition.playersCount} Players · 👑 Captain: {teamBRecognition.captainName}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Match Rules & Settings Container */}
              <div className="p-5 bg-card/45 border border-border/80 rounded-3xl shadow-md space-y-4 backdrop-blur-md">
                <h3 className="text-sm font-black text-foreground uppercase tracking-wider mb-2">
                  ⚙️ Match Configurations & Ground Rules
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-muted-foreground uppercase">Overs Count</Label>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={form.overs}
                      onChange={(e) => setForm({ ...form, overs: parseInt(e.target.value || "1") })}
                      className="bg-background border-border"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-muted-foreground uppercase">Wide Run Penalty</Label>
                    <Select value={String(form.wide_run)} onValueChange={(v) => setForm({ ...form, wide_run: parseInt(v) })}>
                      <SelectTrigger className="bg-background border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        <SelectItem value="0">0 Run</SelectItem>
                        <SelectItem value="1">1 Run</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-muted-foreground uppercase">No-Ball Run Penalty</Label>
                    <Select value={String(form.noball_run)} onValueChange={(v) => setForm({ ...form, noball_run: parseInt(v) })}>
                      <SelectTrigger className="bg-background border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        <SelectItem value="0">0 Run</SelectItem>
                        <SelectItem value="1">1 Run</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-muted-foreground uppercase">Last Man Batting Rule</Label>
                    <Select value={String(form.last_man_batting)} onValueChange={(v) => setForm({ ...form, last_man_batting: v === "true" })}>
                      <SelectTrigger className="bg-background border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        <SelectItem value="false">Disabled (Normal)</SelectItem>
                        <SelectItem value="true">Enabled (Bat Alone)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-muted-foreground uppercase">Match Type Tag</Label>
                    <Input
                      value={form.match_type}
                      onChange={(e) => setForm({ ...form, match_type: e.target.value })}
                      placeholder="e.g. T6, T10, T20"
                      className="bg-background border-border"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-muted-foreground uppercase">Match Ground Venue</Label>
                    <Input
                      value={form.ground}
                      onChange={(e) => setForm({ ...form, ground: e.target.value })}
                      placeholder="Main Stadium"
                      className="bg-background border-border"
                    />
                  </div>

                  <div className="space-y-1 md:col-span-3">
                    <Label className="text-xs font-bold text-muted-foreground uppercase">Match Date & Scheduled Time</Label>
                    <Input
                      type="datetime-local"
                      value={form.match_date}
                      onChange={(e) => setForm({ ...form, match_date: e.target.value })}
                      className="bg-background border-border"
                    />
                  </div>
                </div>
              </div>

              <Button
                type="button"
                onClick={handleStep1Submit}
                className="w-full h-12 font-bold text-sm gap-2 shadow-lg shadow-primary/20"
              >
                Proceed to Squad Selection <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* STEP 2: SQUAD SELECTION SCREEN */}
          {step === 2 && (
            <div className="space-y-6">
              {/* Tab Header for Team Selection */}
              <div className="flex border-b border-border mb-4 bg-muted/40 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setRosterTab("a")}
                  className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg transition-all ${
                    rosterTab === "a"
                      ? "bg-background text-primary shadow-sm"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  }`}
                >
                  {teamAName || "Team A"} ({selectedPlayersA.length} selected)
                </button>
                <button
                  type="button"
                  onClick={() => setRosterTab("b")}
                  className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg transition-all ${
                    rosterTab === "b"
                      ? "bg-background text-primary shadow-sm"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  }`}
                >
                  {teamBName || "Team B"} ({selectedPlayersB.length} selected)
                </button>
              </div>

              {/* Roster Controls / Bulk Selection Actions */}
              <div className="flex flex-wrap gap-2.5 items-center justify-between bg-card/40 border border-border/80 p-4 rounded-2xl backdrop-blur-md">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs font-bold border-primary/20 text-primary hover:bg-primary/5 gap-1"
                    onClick={rosterTab === "a" ? usePreviousXIA : usePreviousXIB}
                  >
                    ⚡ Use Previous XI
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs font-bold border-primary/20 text-primary hover:bg-primary/5 gap-1"
                    onClick={rosterTab === "a" ? useSuggestedXIA : useSuggestedXIB}
                  >
                    🔥 Use Suggested XI
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs font-bold border-border gap-1"
                    onClick={() => handleOpenImportModal(rosterTab)}
                  >
                    📥 Import Team
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-[11px] font-bold text-muted-foreground hover:text-foreground"
                    onClick={rosterTab === "a" ? selectAllA : selectAllB}
                  >
                    Select All
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-[11px] font-bold text-muted-foreground hover:text-foreground"
                    onClick={rosterTab === "a" ? deselectAllA : deselectAllB}
                  >
                    Deselect All
                  </Button>
                </div>
              </div>

              {/* Roster Search bar & Guest player addition */}
              <div className="flex gap-3 items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={`Search players for ${rosterTab === "a" ? teamAName : teamBName}...`}
                    value={rosterTab === "a" ? searchA : searchB}
                    onChange={(e) => rosterTab === "a" ? setSearchA(e.target.value) : setSearchB(e.target.value)}
                    className="pl-9 h-11 bg-card border-border"
                  />
                </div>
                <Button
                  type="button"
                  onClick={() => handleOpenGuestModal(rosterTab)}
                  className="h-11 font-bold gap-1.5 px-4"
                >
                  <UserPlus className="h-4 w-4" /> Guest
                </Button>
              </div>

              {/* Players Card Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(rosterTab === "a" ? filteredPlayersA : filteredPlayersB).map((p) => {
                  const isSelected = rosterTab === "a" 
                    ? selectedPlayersA.includes(p.id) 
                    : selectedPlayersB.includes(p.id);
                  
                  const isSelectedInOtherTeam = rosterTab === "a"
                    ? selectedPlayersB.includes(p.id)
                    : selectedPlayersA.includes(p.id);

                  const isGuest = p.id.startsWith("guest-") || p.id.startsWith("imported-");
                  const activeRoles = rosterTab === "a" ? rolesA : rolesB;
                  const roleVal = activeRoles[p.id] || "";
                  const rating = calculateRating(p.stats);

                  return (
                    <div
                      key={p.id}
                      onClick={() => rosterTab === "a" ? togglePlayerASelection(p.id) : togglePlayerBSelection(p.id)}
                      className={`group p-4 bg-card/45 border rounded-2xl cursor-pointer select-none transition-all flex flex-col justify-between relative shadow-sm hover:shadow-md ${
                        isSelected 
                          ? "border-primary shadow-[0_0_15px_rgba(249,115,22,0.25)] scale-[1.01]" 
                          : isSelectedInOtherTeam
                          ? "opacity-45 border-dashed border-border bg-muted/20 cursor-not-allowed"
                          : "border-border/60 hover:bg-card/75"
                      } ${isGuest ? "border-dashed" : ""}`}
                    >
                      {/* Checkmark overlay for selected state */}
                      {isSelected && (
                        <div className="absolute top-2.5 right-2.5 h-5 w-5 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-sm">
                          <Check className="h-3 w-3 stroke-[3]" />
                        </div>
                      )}

                      {/* Opponent Selected Indicator */}
                      {isSelectedInOtherTeam && (
                        <div className="absolute top-2.5 right-2.5 bg-destructive/15 border border-destructive/25 text-destructive text-[8px] font-black uppercase px-2 py-0.5 rounded-full flex items-center gap-0.5 shadow-sm">
                          <ShieldAlert className="h-2 w-2" /> Selected in Team {rosterTab === "a" ? "B" : "A"}
                        </div>
                      )}

                      <div className="flex gap-3.5 items-start">
                        {/* Avatar */}
                        <div className={`h-11 w-11 rounded-full flex items-center justify-center font-bold text-sm shrink-0 border transition-all ${
                          isSelected ? "bg-primary/20 border-primary text-primary" : "bg-muted border-border/80 text-muted-foreground"
                        }`}>
                          {p.name.slice(0, 2).toUpperCase()}
                        </div>

                        {/* Player Basic details */}
                        <div className="space-y-0.5">
                          <div className="font-extrabold text-sm text-foreground flex items-center gap-1">
                            {p.name}
                            {p.jersey_number && (
                              <span className="text-[10px] font-bold text-muted-foreground font-mono">
                                #{p.jersey_number}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                            {p.role || "Player"}
                          </div>

                          {/* Computed rating stars */}
                          <div className="flex items-center gap-1.5 pt-1">
                            <div className="flex">
                              {[1, 2, 3, 4, 5].map(star => (
                                <Star
                                  key={star}
                                  className={`h-3 w-3 ${
                                    star <= Math.round(rating) ? "fill-primary text-primary" : "text-muted-foreground/30"
                                  }`}
                                />
                              ))}
                            </div>
                            <span className="text-[10px] text-muted-foreground font-bold">{rating}</span>
                          </div>
                        </div>
                      </div>

                      {/* Career Quick Stats */}
                      <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-border/40 text-center">
                        <div className="flex flex-col">
                          <span className="text-[9px] font-bold text-muted-foreground uppercase">Matches</span>
                          <span className="text-xs font-black text-foreground">{p.stats?.matches || 0}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9px] font-bold text-muted-foreground uppercase">Runs</span>
                          <span className="text-xs font-black text-foreground">{p.stats?.runs || 0}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9px] font-bold text-muted-foreground uppercase">Wickets</span>
                          <span className="text-xs font-black text-foreground">{p.stats?.wickets || 0}</span>
                        </div>
                      </div>

                      {/* Selected Badge Roles */}
                      {isSelected && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {roleVal === "Captain" && (
                            <span className="text-[9px] font-black uppercase bg-primary/20 text-primary px-2 py-0.5 rounded-full border border-primary/20 flex items-center gap-0.5 shadow-sm">
                              <Crown className="h-2.5 w-2.5" /> Captain (C)
                            </span>
                          )}
                          {roleVal === "Vice Captain" && (
                            <span className="text-[9px] font-black uppercase bg-accent/20 text-accent px-2 py-0.5 rounded-full border border-accent/20 flex items-center gap-0.5 shadow-sm">
                              ⭐ VC
                            </span>
                          )}
                          {roleVal === "Wicket Keeper" && (
                            <span className="text-[9px] font-black uppercase bg-primary/20 text-primary px-2 py-0.5 rounded-full border border-primary/20 flex items-center gap-0.5 shadow-sm">
                              🧤 Keeper (WK)
                            </span>
                          )}

                          {/* Trigger Role selection button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRoleMenuPlayerId(p.id);
                              setRoleMenuTeam(rosterTab);
                            }}
                            className="text-[9px] font-bold text-primary hover:underline ml-auto"
                          >
                            Assign Role
                          </button>
                        </div>
                      )}

                      {/* Guest Badging */}
                      {isGuest && (
                        <span className="absolute top-2.5 left-2.5 bg-muted/60 text-muted-foreground border border-border/60 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                          Guest
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Roster validation & Navigation controls */}
              <div className="flex gap-4 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="h-12 w-28 font-bold gap-1.5"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
                <Button
                  type="button"
                  onClick={handleProceedToReview}
                  className="h-12 flex-1 font-bold gap-1.5"
                >
                  Continue to Review <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: TEAM REVIEW SCREEN */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Roster A Review */}
                <div className="p-5 bg-card/45 border border-border/80 rounded-3xl space-y-4 shadow-md backdrop-blur-md">
                  <div className="flex justify-between items-baseline border-b border-border/40 pb-2 mb-2">
                    <span className="font-extrabold text-sm text-primary uppercase tracking-wider">
                      🛡️ {teamAName} Selected Squad
                    </span>
                    <span className="text-xs text-muted-foreground font-bold font-mono">
                      {selectedPlayersA.length} Players
                    </span>
                  </div>

                  <div className="divide-y divide-border/40 max-h-[400px] overflow-y-auto pr-1">
                    {selectedPlayersA.map(pId => {
                      // Find registered player or guest
                      const p = allPlayers.find(pl => pl.id === pId) || 
                                guestPlayersA.find(g => g.id === pId);
                      if (!p) return null;
                      const roleVal = rolesA[pId] || "";

                      return (
                        <div key={pId} className="py-2.5 flex justify-between items-center text-xs">
                          <div className="flex items-center gap-2.5">
                            <div className="h-7 w-7 rounded-full bg-primary/10 border border-primary/20 text-primary flex items-center justify-center font-bold text-[10px]">
                              {p.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-extrabold text-foreground">{p.name}</div>
                              <div className="text-[10px] text-muted-foreground font-medium">
                                {p.role || "All-rounder"}
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            {roleVal === "Captain" && (
                              <span className="text-[9px] font-black uppercase bg-primary/20 text-primary px-2 py-0.5 rounded-full border border-primary/20 flex items-center gap-0.5">
                                <Crown className="h-2.5 w-2.5" /> Captain
                              </span>
                            )}
                            {roleVal === "Vice Captain" && (
                              <span className="text-[9px] font-black uppercase bg-accent/20 text-accent px-2 py-0.5 rounded-full border border-accent/20 flex items-center gap-0.5">
                                ⭐ VC
                              </span>
                            )}
                            {roleVal === "Wicket Keeper" && (
                              <span className="text-[9px] font-black uppercase bg-primary/20 text-primary px-2 py-0.5 rounded-full border border-primary/20 flex items-center gap-0.5">
                                🧤 Keeper
                              </span>
                            )}
                            
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 rounded-full hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                              onClick={() => setSelectedPlayersA(prev => prev.filter(id => id !== pId))}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Roster B Review */}
                <div className="p-5 bg-card/45 border border-border/80 rounded-3xl space-y-4 shadow-md backdrop-blur-md">
                  <div className="flex justify-between items-baseline border-b border-border/40 pb-2 mb-2">
                    <span className="font-extrabold text-sm text-primary uppercase tracking-wider">
                      🛡️ {teamBName} Selected Squad
                    </span>
                    <span className="text-xs text-muted-foreground font-bold font-mono">
                      {selectedPlayersB.length} Players
                    </span>
                  </div>

                  <div className="divide-y divide-border/40 max-h-[400px] overflow-y-auto pr-1">
                    {selectedPlayersB.map(pId => {
                      const p = allPlayers.find(pl => pl.id === pId) || 
                                guestPlayersB.find(g => g.id === pId);
                      if (!p) return null;
                      const roleVal = rolesB[pId] || "";

                      return (
                        <div key={pId} className="py-2.5 flex justify-between items-center text-xs">
                          <div className="flex items-center gap-2.5">
                            <div className="h-7 w-7 rounded-full bg-primary/10 border border-primary/20 text-primary flex items-center justify-center font-bold text-[10px]">
                              {p.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-extrabold text-foreground">{p.name}</div>
                              <div className="text-[10px] text-muted-foreground font-medium">
                                {p.role || "All-rounder"}
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            {roleVal === "Captain" && (
                              <span className="text-[9px] font-black uppercase bg-primary/20 text-primary px-2 py-0.5 rounded-full border border-primary/20 flex items-center gap-0.5">
                                <Crown className="h-2.5 w-2.5" /> Captain
                              </span>
                            )}
                            {roleVal === "Vice Captain" && (
                              <span className="text-[9px] font-black uppercase bg-accent/20 text-accent px-2 py-0.5 rounded-full border border-accent/20 flex items-center gap-0.5">
                                ⭐ VC
                              </span>
                            )}
                            {roleVal === "Wicket Keeper" && (
                              <span className="text-[9px] font-black uppercase bg-primary/20 text-primary px-2 py-0.5 rounded-full border border-primary/20 flex items-center gap-0.5">
                                🧤 Keeper
                              </span>
                            )}
                            
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 rounded-full hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                              onClick={() => setSelectedPlayersB(prev => prev.filter(id => id !== pId))}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(2)}
                  className="h-12 w-28 font-bold gap-1.5"
                  disabled={isStartingMatch}
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
                <Button
                  type="button"
                  onClick={handleStartMatch}
                  className="h-12 flex-1 font-bold gap-1.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg shadow-orange-500/20"
                  disabled={isStartingMatch}
                >
                  {isStartingMatch ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-primary-foreground" /> Initializing Match...
                    </>
                  ) : (
                    <>
                      ⚡ Start Match & Begin Scoring
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Guest Player Modal */}
      <Dialog open={isGuestModalOpen} onOpenChange={setIsGuestModalOpen}>
        <DialogContent className="max-w-md bg-card border-border text-foreground rounded-2xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Add Guest Player</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddGuestSubmit} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="guest-name">Full Name</Label>
              <Input
                id="guest-name"
                value={newGuestName}
                onChange={(e) => setNewGuestName(e.target.value)}
                placeholder="e.g. Robin Singh"
                required
                className="bg-background border-border"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guest-nickname">Nickname</Label>
              <Input
                id="guest-nickname"
                value={newGuestNickname}
                onChange={(e) => setNewGuestNickname(e.target.value)}
                placeholder="e.g. Rob"
                className="bg-background border-border"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guest-jersey">Jersey Number</Label>
              <Input
                id="guest-jersey"
                value={newGuestJersey}
                onChange={(e) => setNewGuestJersey(e.target.value)}
                placeholder="e.g. 7"
                maxLength={3}
                className="bg-background border-border"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Primary Playing Role</Label>
              <Select value={newGuestRole} onValueChange={setNewGuestRole}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="Batter">Batter</SelectItem>
                  <SelectItem value="Bowler">Bowler</SelectItem>
                  <SelectItem value="All-rounder">All-rounder</SelectItem>
                  <SelectItem value="Wicket keeper">Wicket keeper</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="pt-4 flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setIsGuestModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Add to Squad</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Role Selection Dialog */}
      <Dialog open={roleMenuPlayerId !== null} onOpenChange={() => setRoleMenuPlayerId(null)}>
        <DialogContent className="max-w-xs bg-card border-border text-foreground rounded-2xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-center">Assign Role</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-3">
            {[
              { label: "👑 Captain", value: "Captain" as const },
              { label: "⭐ Vice Captain", value: "Vice Captain" as const },
              { label: "🧤 Wicket Keeper", value: "Wicket Keeper" as const },
              { label: "❌ Clear Role", value: "" as const },
            ].map(item => (
              <Button
                key={item.label}
                type="button"
                variant="outline"
                className="h-10 text-xs font-bold text-left justify-start border-border hover:bg-muted"
                onClick={() => handleSetRole(item.value)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Team Modal */}
      <Dialog open={isImportModalOpen} onOpenChange={setIsImportModalOpen}>
        <DialogContent className="max-w-md bg-card border-border text-foreground rounded-2xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Import Team Roster</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label>Select Team to Import From</Label>
              <Select value={importSourceTeamId} onValueChange={setImportSourceTeamId}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {teams
                    .filter(t => t.id !== selectedTeamAId && t.id !== selectedTeamBId)
                    .map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                This will clone the players from the selected team's squad list and add them directly to the active lineup.
              </p>
            </div>
            <DialogFooter className="pt-4 flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setIsImportModalOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleImportSubmit}>
                Import Squad
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Starting Match Loader Overlay */}
      {isStartingMatch && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-md z-[9999] flex flex-col items-center justify-center p-4">
          <div className="bg-card border border-border/80 p-8 rounded-3xl shadow-2xl flex flex-col items-center justify-center text-center space-y-4 max-w-sm w-full">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <h3 className="font-extrabold text-base text-foreground tracking-tight">Setting Up Your Match...</h3>
            <p className="text-xs text-muted-foreground font-semibold leading-relaxed animate-pulse">
              {startStatusText}
            </p>
          </div>
        </div>
      )}
    </AppShell>
  );
}