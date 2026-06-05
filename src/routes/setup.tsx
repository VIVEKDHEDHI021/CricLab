import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { playerService, type Player } from "@/lib/services/playerService";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Trophy, ArrowRight, Loader2 } from "lucide-react";

export const Route = createFileRoute("/setup")({
  component: PlayerSetupPage,
});

function PlayerSetupPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [playerId, setPlayerId] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);

  // Setup form states
  const [role, setRole] = useState("All-rounder");
  const [battingStyle, setBattingStyle] = useState("Right-hand bat");
  const [bowlingStyle, setBowlingStyle] = useState("Right-arm fast");
  const [jerseyNumber, setJerseyNumber] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/" });
      return;
    }

    const checkAndFetchProfile = async () => {
      if (!user) return;
      try {
        const players = await playerService.getPlayers();
        const found = players.find(p => p.mobile === user.mobile || p.user_id === user.id);
        if (found) {
          setPlayerId(found.id);
          // Pre-populate if they already have some details
          if (found.role) setRole(found.role);
          if (found.batting_style) setBattingStyle(found.batting_style);
          if (found.bowling_style) setBowlingStyle(found.bowling_style);
          if (found.jersey_number) setJerseyNumber(found.jersey_number);
          
          if (found.role && found.batting_style) {
            navigate({ to: "/dashboard" });
            return;
          }
        } else {
          // If no player profile exists, create one auto-linked to this user
          const newPlayer = await playerService.createPlayer({
            name: user.name || "Player",
            team_id: "", // no team yet
            mobile: user.mobile,
          });
          setPlayerId(newPlayer.id);
        }
      } catch (err) {
        // ignore errors
      } finally {
        setFetching(false);
      }
    };

    checkAndFetchProfile();
  }, [user, loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerId) return toast.error("Profile association error. Please try again.");

    setSaving(true);
    try {
      await playerService.updatePlayerProfile(playerId, {
        role,
        batting_style: battingStyle,
        bowling_style: bowlingStyle,
        jersey_number: jerseyNumber || undefined,
      });
      toast.success("Profile setup completed successfully!");
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to complete setup");
    } finally {
      setSaving(false);
    }
  };

  if (loading || fetching) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">Preparing your setup...</p>
      </div>
    );
  }

  const roleOptions = [
    { value: "Batter", label: "Batter", desc: "Specialist run scorer", icon: "🏏" },
    { value: "Bowler", label: "Bowler", desc: "Specialist wicket taker", icon: "🥎" },
    { value: "All-rounder", label: "All-rounder", desc: "Master of bat & ball", icon: "⚡" },
    { value: "Wicket keeper", label: "Wicket keeper", desc: "Gloveman behind stumps", icon: "🧤" },
    { value: "Captain", label: "Captain", desc: "Team leader & strategist", icon: "👑" },
  ];

  const battingOptions = [
    { value: "Right-hand bat", label: "Right-Hand", desc: "Righty stance" },
    { value: "Left-hand bat", label: "Left-Hand", desc: "Lefty stance" },
  ];

  const bowlingOptions = [
    { value: "Right-arm fast", label: "Right-Arm Fast" },
    { value: "Right-arm spin", label: "Right-Arm Spin" },
    { value: "Left-arm fast", label: "Left-Arm Fast" },
    { value: "Left-arm spin", label: "Left-Arm Spin" },
    { value: "None", label: "Don't Bowl" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between py-8 px-4">
      {/* Header */}
      <div className="text-center space-y-2 max-w-md mx-auto w-full">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto text-primary mb-2 border border-primary/20">
          <Trophy className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Set Up Your Player Profile</h1>
        <p className="text-xs text-muted-foreground">
          Tell us about your game style to configure stats calculations and leaderboard rankings.
        </p>
      </div>

      {/* Form Content */}
      <form onSubmit={handleSubmit} className="max-w-md mx-auto w-full space-y-6 my-8">
        
        {/* Role Selection */}
        <div className="space-y-3">
          <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">1. What is your role?</Label>
          <div className="grid grid-cols-2 gap-3">
            {roleOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRole(opt.value)}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  role === opt.value
                    ? "bg-primary/10 border-primary text-foreground shadow-md shadow-primary/5"
                    : "bg-card/40 border-border hover:bg-card/70 text-muted-foreground"
                }`}
              >
                <div className="text-xl mb-1.5">{opt.icon}</div>
                <div className="font-bold text-sm text-foreground">{opt.label}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Batting Selection */}
        <div className="space-y-3">
          <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">2. How do you bat?</Label>
          <div className="grid grid-cols-2 gap-3">
            {battingOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setBattingStyle(opt.value)}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  battingStyle === opt.value
                    ? "bg-primary/10 border-primary text-foreground shadow-md shadow-primary/5"
                    : "bg-card/40 border-border hover:bg-card/70 text-muted-foreground"
                }`}
              >
                <div className="font-bold text-sm text-foreground">{opt.label}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Bowling Selection */}
        <div className="space-y-3">
          <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">3. What is your bowling style?</Label>
          <div className="grid grid-cols-2 gap-2.5">
            {bowlingOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setBowlingStyle(opt.value)}
                className={`p-2.5 rounded-lg border text-center text-xs transition-all ${
                  bowlingStyle === opt.value
                    ? "bg-primary/10 border-primary text-foreground font-semibold"
                    : "bg-card/40 border-border hover:bg-card/70 text-muted-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Jersey Number */}
        <div className="space-y-2">
          <Label htmlFor="jersey" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            4. Lucky Jersey Number (Optional)
          </Label>
          <Input
            id="jersey"
            value={jerseyNumber}
            onChange={(e) => setJerseyNumber(e.target.value)}
            placeholder="e.g. 7, 18, 45"
            maxLength={3}
            className="bg-card border-border h-11 text-center font-bold text-lg tracking-wider"
          />
        </div>

        {/* Action Button */}
        <Button type="submit" className="w-full h-11 font-bold gap-2 text-sm shadow-lg shadow-primary/10" disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Saving settings...
            </>
          ) : (
            <>
              Let's Play <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </form>

      {/* Footer link to skip onboarding */}
      <div className="text-center max-w-md mx-auto w-full">
        <button
          type="button"
          onClick={() => navigate({ to: "/dashboard" })}
          className="text-xs text-muted-foreground/80 hover:text-foreground hover:underline transition-colors"
        >
          Skip setup for now
        </button>
      </div>
    </div>
  );
}
