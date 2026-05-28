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
import { toast } from "sonner";

export const Route = createFileRoute("/matches/new")({ component: NewMatch });

function NewMatch() {
  const { role } = useAuth();
  const nav = useNavigate();
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    team_a_id: "", team_b_id: "", overs: 6, wide_run: 1, noball_run: 1,
    match_type: "T6", ground: "", match_date: new Date().toISOString().slice(0, 16),
  });

  useEffect(() => {
    teamService.getTeams().then((data) => setTeams(data));
  }, []);

  if (role && role !== "admin") {
    return <AppShell><div className="text-muted-foreground">Admins only.</div></AppShell>;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.team_a_id === form.team_b_id) return toast.error("Pick two different teams");
    try {
      const data = await matchService.createMatch(form);
      toast.success("Match created");
      nav({ to: "/matches/$id", params: { id: data.id } });
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    }
  };

  return (
    <AppShell title="New match">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Team A">
          <Select value={form.team_a_id} onValueChange={(v) => setForm({ ...form, team_a_id: v })}>
            <SelectTrigger><SelectValue placeholder="Select team" /></SelectTrigger>
            <SelectContent>{teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Team B">
          <Select value={form.team_b_id} onValueChange={(v) => setForm({ ...form, team_b_id: v })}>
            <SelectTrigger><SelectValue placeholder="Select team" /></SelectTrigger>
            <SelectContent>{teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Overs">
          <Input type="number" min={1} max={50} value={form.overs}
            onChange={(e) => setForm({ ...form, overs: parseInt(e.target.value || "1") })} />
        </Field>
        <Field label="Wide run rule">
          <Select value={String(form.wide_run)} onValueChange={(v) => setForm({ ...form, wide_run: parseInt(v) })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">0 run</SelectItem>
              <SelectItem value="1">1 run</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="No-ball run rule">
          <Select value={String(form.noball_run)} onValueChange={(v) => setForm({ ...form, noball_run: parseInt(v) })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">0 run</SelectItem>
              <SelectItem value="1">1 run</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Match type">
          <Input value={form.match_type} onChange={(e) => setForm({ ...form, match_type: e.target.value })} placeholder="T6, T10, T20" />
        </Field>
        <Field label="Ground">
          <Input value={form.ground} onChange={(e) => setForm({ ...form, ground: e.target.value })} />
        </Field>
        <Field label="Date & time">
          <Input type="datetime-local" value={form.match_date} onChange={(e) => setForm({ ...form, match_date: e.target.value })} />
        </Field>
        <Button type="submit" className="w-full">Create match</Button>
      </form>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label>{label}</Label>{children}</div>;
}