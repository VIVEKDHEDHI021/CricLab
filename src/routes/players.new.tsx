import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { playerService } from "@/lib/services/playerService";
import { teamService, type Team } from "@/lib/services/teamService";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { UserPlus, ArrowLeft, Image as ImageIcon } from "lucide-react";

export const Route = createFileRoute("/players/new")({
  component: AddPlayerPage,
});

function AddPlayerPage() {
  const { role, user: currentUser } = useAuth();
  const isAdmin = role === "admin";
  const navigate = useNavigate();

  const [teams, setTeams] = useState<Team[]>([]);
  const [saving, setSaving] = useState(false);

  // Form states
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("");
  const [profilePhoto, setProfilePhoto] = useState("");
  const [bio, setBio] = useState("");
  const [primaryRole, setPrimaryRole] = useState("Batsman");
  const [battingStyle, setBattingStyle] = useState("Right-hand bat");
  const [bowlingStyle, setBowlingStyle] = useState("Right-arm bowl");
  const [bowlingType, setBowlingType] = useState("Fast");
  const [jerseyNumber, setJerseyNumber] = useState("");
  const [preferredTeamId, setPreferredTeamId] = useState("");

  useEffect(() => {
    // Redirect if not admin
    if (currentUser && !isAdmin) {
      toast.error("Access denied. Admin only.");
      navigate({ to: "/players" });
    }

    const loadTeams = async () => {
      try {
        const t = await teamService.getTeams();
        setTeams(t);
      } catch (err: any) {
        toast.error("Failed to load teams");
      }
    };
    loadTeams();
  }, [currentUser, isAdmin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      return toast.error("Full name is required");
    }

    setSaving(true);
    try {
      await playerService.createPlayer({
        full_name: fullName,
        name: fullName,
        mobile: mobile || undefined,
        email: email || undefined,
        dob: dob || undefined,
        city: city || undefined,
        state: state || undefined,
        country: country || undefined,
        profile_photo: profilePhoto || undefined,
        bio: bio || undefined,
        primary_role: primaryRole,
        role: primaryRole,
        batting_style: battingStyle,
        bowling_style: bowlingStyle,
        bowling_type: bowlingType,
        jersey_number: jerseyNumber || undefined,
        preferred_team_id: preferredTeamId || null,
        created_by: currentUser?.id,
      });

      toast.success("Player created successfully!");
      navigate({ to: "/players" });
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to create player");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell title="Create Player">
      <div className="max-w-2xl mx-auto space-y-4 pb-10">
        <div className="flex items-center gap-2 mb-2">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/players" })} className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Create Player Profile</h1>
            <p className="text-xs text-muted-foreground">Add a new cricketer profile to CricLab</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Profile Photo Mock/Input */}
          <Card className="p-4 border-border bg-card/40 flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center overflow-hidden border border-border">
              {profilePhoto ? (
                <img src={profilePhoto} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <div className="w-full space-y-1">
              <Label className="text-xs">Profile Photo URL</Label>
              <Input
                value={profilePhoto}
                onChange={(e) => setProfilePhoto(e.target.value)}
                placeholder="https://example.com/photo.jpg"
                className="bg-background/80 border-border text-sm"
              />
            </div>
          </Card>

          {/* Personal Information */}
          <Card className="p-4 border-border bg-card/40 space-y-3">
            <h2 className="text-sm font-bold text-primary uppercase tracking-wider">Personal Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Full Name *</Label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Sachin Tendulkar"
                  className="bg-background/80 border-border"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mobile Number</Label>
                <Input
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="bg-background/80 border-border"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email Address</Label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. sachin@criclab.com"
                  className="bg-background/80 border-border"
                  type="email"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Date of Birth</Label>
                <Input
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  placeholder="e.g. 1973-04-24"
                  className="bg-background/80 border-border"
                  type="date"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">City</Label>
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Mumbai"
                  className="bg-background/80 border-border"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">State</Label>
                <Input
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="Maharashtra"
                  className="bg-background/80 border-border"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Country</Label>
                <Input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="India"
                  className="bg-background/80 border-border"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Player Bio</Label>
              <Input
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="A brief background or achievements info..."
                className="bg-background/80 border-border"
              />
            </div>
          </Card>

          {/* Cricket Details */}
          <Card className="p-4 border-border bg-card/40 space-y-3">
            <h2 className="text-sm font-bold text-primary uppercase tracking-wider">Cricket Attributes</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Primary Role</Label>
                <Select value={primaryRole} onValueChange={setPrimaryRole}>
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue placeholder="Select Role" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="Batsman">Batsman</SelectItem>
                    <SelectItem value="Bowler">Bowler</SelectItem>
                    <SelectItem value="All Rounder">All Rounder</SelectItem>
                    <SelectItem value="Wicket Keeper">Wicket Keeper</SelectItem>
                    <SelectItem value="Wicket Keeper Batter">Wicket Keeper Batter</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Jersey Number</Label>
                <Input
                  value={jerseyNumber}
                  onChange={(e) => setJerseyNumber(e.target.value)}
                  placeholder="e.g. 10"
                  className="bg-background/80 border-border"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Batting Style</Label>
                <Select value={battingStyle} onValueChange={setBattingStyle}>
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue placeholder="Select Batting Style" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="Right-hand bat">Right-hand bat</SelectItem>
                    <SelectItem value="Left-hand bat">Left-hand bat</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Bowling Style</Label>
                <Select value={bowlingStyle} onValueChange={setBowlingStyle}>
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue placeholder="Select Bowling Style" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="Right-arm bowl">Right-arm bowl</SelectItem>
                    <SelectItem value="Left-arm bowl">Left-arm bowl</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Bowling Type</Label>
                <Select value={bowlingType} onValueChange={setBowlingType}>
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue placeholder="Select Bowling Type" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="Fast">Fast</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="Spin">Spin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Preferred Team</Label>
                <Select value={preferredTeamId} onValueChange={setPreferredTeamId}>
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue placeholder="No Preferred Team" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="none_team_placeholder">No Preferred Team</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          <Button type="submit" disabled={saving} className="w-full py-6 text-sm font-semibold rounded-2xl flex items-center justify-center gap-2">
            <UserPlus className="h-5 w-5" />
            {saving ? "Saving cricketer..." : "Create Cricketer Profile"}
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
