import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { friendService, type Friend } from "@/lib/services/friendService";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/friends")({ component: FriendsPage });

function FriendsPage() {
  const { user } = useAuth();
  const [mobile, setMobile] = useState("");
  const [list, setList] = useState<Friend[]>([]);

  const load = async () => {
    if (!user) return;
    try {
      const data = await friendService.getFriends();
      setList(data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    }
  };
  useEffect(() => { load(); }, [user]);

  const add = async () => {
    const m = mobile.replace(/\D/g, "");
    if (!m) return;
    try {
      await friendService.addFriend(m);
      setMobile("");
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to add friend");
    }
  };
  const del = async (id: string) => {
    try {
      await friendService.removeFriend(id);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message);
    }
  };

  return (
    <AppShell title="Friends">
      <div className="flex gap-2 mb-4">
        <Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="Friend's mobile" />
        <Button onClick={add}>Add</Button>
      </div>
      <div className="space-y-2">
        {list.map((f) => (
          <Card key={f.id} className="p-3 rounded-2xl flex items-center justify-between">
            <div>
              <div className="font-medium">{f.profile?.name ?? "—"}</div>
              <div className="text-xs text-muted-foreground">{f.profile?.mobile}</div>
            </div>
            <Button size="icon" variant="outline" onClick={() => del(f.id)}><Trash2 className="h-4 w-4" /></Button>
          </Card>
        ))}
        {list.length === 0 && <div className="text-muted-foreground">No friends yet.</div>}
      </div>
    </AppShell>
  );
}