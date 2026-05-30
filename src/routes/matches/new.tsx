import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { teamService } from "@/lib/services/teamService";
import { matchService } from "@/lib/services/matchService";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/matches/new")({ component: NewMatch });

function NewMatch() {
  const nav = useNavigate();
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    team_a_id: "", team_b_id: "", overs: 6, wide_run: 1, noball_run: 1,
    match_type: "T6", ground: "", match_date: new Date().toISOString().slice(0, 16),
    last_man_batting: false,
    batting_first_id: "",
    status: "live", // Automatically start live
  });

  // Inline team creation state
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [targetDropdown, setTargetDropdown] = useState<"a" | "b">("a");
  const [creatingTeam, setCreatingTeam] = useState(false);

  const loadTeams = async () => {
    try {
      const data = await teamService.getTeams();
      setTeams(data);
    } catch (err: any) {
      toast.error("Failed to load teams");
    }
  };

  useEffect(() => {
    loadTeams();
  }, []);

  const openCreateTeamModal = (dropdown: "a" | "b") => {
    setTargetDropdown(dropdown);
    setNewTeamName("");
    setIsTeamModalOpen(true);
  };

  const handleCreateTeamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return toast.error("Team name is required");
    setCreatingTeam(true);
    try {
      const newTeam = await teamService.createTeam(newTeamName);
      toast.success(`Team "${newTeam.name}" created!`);
      
      // Reload team list
      const updatedTeams = await teamService.getTeams();
      setTeams(updatedTeams);

      // Automatically select the new team
      if (targetDropdown === "a") {
        setForm(prev => ({ ...prev, team_a_id: newTeam.id }));
      } else {
        setForm(prev => ({ ...prev, team_b_id: newTeam.id }));
      }
      setIsTeamModalOpen(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to create team");
    } finally {
      setCreatingTeam(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.team_a_id || !form.team_b_id) return toast.error("Please select both teams");
    if (form.team_a_id === form.team_b_id) return toast.error("Pick two different teams");
    
    // Ensure batting first is set to Team A
    const finalForm = {
      ...form,
      batting_first_id: form.team_a_id,
    };

    try {
      const data = await matchService.createMatch(finalForm);
      toast.success("Match created");
      nav({ to: "/matches/$id", params: { id: data.id } });
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    }
  };

  return (
    <AppShell title="New match">
      <form onSubmit={submit} className="space-y-4">
        
        {/* Team A Picker + Inline Add Team Option */}
        <Field label="Team A">
          <div className="flex gap-2">
            <div className="flex-1">
              <Select value={form.team_a_id} onValueChange={(v) => setForm({ ...form, team_a_id: v })}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Select Team A" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="outline" size="icon" onClick={() => openCreateTeamModal("a")} title="Create Team A">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </Field>

        {/* Team B Picker + Inline Add Team Option */}
        <Field label="Team B">
          <div className="flex gap-2">
            <div className="flex-1">
              <Select value={form.team_b_id} onValueChange={(v) => setForm({ ...form, team_b_id: v })}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Select Team B" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="outline" size="icon" onClick={() => openCreateTeamModal("b")} title="Create Team B">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </Field>



        <Field label="Overs">
          <Input type="number" min={1} max={50} value={form.overs}
            className="bg-background border-border"
            onChange={(e) => setForm({ ...form, overs: parseInt(e.target.value || "1") })} />
        </Field>
        
        <Field label="Wide run rule">
          <Select value={String(form.wide_run)} onValueChange={(v) => setForm({ ...form, wide_run: parseInt(v) })}>
            <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="0">0 run</SelectItem>
              <SelectItem value="1">1 run</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        
        <Field label="No-ball run rule">
          <Select value={String(form.noball_run)} onValueChange={(v) => setForm({ ...form, noball_run: parseInt(v) })}>
            <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="0">0 run</SelectItem>
              <SelectItem value="1">1 run</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        
        <Field label="Last man batting rule">
          <Select value={String(form.last_man_batting)} onValueChange={(v) => setForm({ ...form, last_man_batting: v === "true" })}>
            <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="false">Disabled (Normal)</SelectItem>
              <SelectItem value="true">Enabled (Last man can bat alone)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        
        <Field label="Match type">
          <Input value={form.match_type} className="bg-background border-border" onChange={(e) => setForm({ ...form, match_type: e.target.value })} placeholder="T6, T10, T20" />
        </Field>
        
        <Field label="Ground">
          <Input value={form.ground} className="bg-background border-border" onChange={(e) => setForm({ ...form, ground: e.target.value })} />
        </Field>
        
        <Field label="Date & time">
          <Input type="datetime-local" className="bg-background border-border" value={form.match_date} onChange={(e) => setForm({ ...form, match_date: e.target.value })} />
        </Field>
        
        <Button type="submit" className="w-full mt-6">Create match</Button>
      </form>

      {/* Team Creation Dialog Modal */}
      <Dialog open={isTeamModalOpen} onOpenChange={setIsTeamModalOpen}>
        <DialogContent className="max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Create New Team</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateTeamSubmit} className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="modal-team-name">Team Name</Label>
              <Input
                id="modal-team-name"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="Enter team name"
                required
                className="bg-background border-border"
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsTeamModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creatingTeam}>
                {creatingTeam ? "Creating..." : "Create Team"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs font-semibold text-muted-foreground">{label}</Label>{children}</div>;
}