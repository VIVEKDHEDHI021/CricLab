import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { authService, type AuthUser } from "@/lib/services/authService";
import { getToken, clearToken } from "@/lib/api";
import { playerService } from "@/lib/services/playerService";

export type Role = "admin" | "user" | "scorer" | null;

type Ctx = {
  user: AuthUser | null;
  role: Role;
  loading: boolean;
  profileName: string | null;
  mobile: string | null;
  isProfileSetupCompleted: boolean;
  refreshRole: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<Ctx>({
  user: null, role: null, loading: true,
  profileName: null, mobile: null,
  isProfileSetupCompleted: false,
  refreshRole: async () => {}, signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [mobile, setMobile] = useState<string | null>(null);
  const [isProfileSetupCompleted, setIsProfileSetupCompleted] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadUser = async () => {
    try {
      const me = await authService.getMe();
      setUser(me);
      setRole(me.role);
      setProfileName(me.name);
      setMobile(me.mobile);

      try {
        const players = await playerService.getPlayers();
        const found = players.find(p => p.mobile === me.mobile || p.user_id === me.id);
        if (found && found.role && found.batting_style) {
          setIsProfileSetupCompleted(true);
        } else {
          setIsProfileSetupCompleted(false);
        }
      } catch {
        setIsProfileSetupCompleted(false);
      }
    } catch (err: any) {
      setUser(null);
      setRole(null);
      setProfileName(null);
      setMobile(null);
      setIsProfileSetupCompleted(false);
      // Only clear token if the server explicitly responded with 401 Unauthorized
      if (err.response?.status === 401) {
        clearToken();
      }
    }
  };

  useEffect(() => {
    const token = getToken();
    if (token) {
      loadUser().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const refreshRole = async () => {
    await loadUser();
  };

  const signOut = async () => {
    try {
      await authService.logout();
    } catch {
      // ignore logout errors
    }
    if (typeof window !== "undefined" && (window as any).google?.accounts?.id) {
      try {
        (window as any).google.accounts.id.disableAutoSelect();
      } catch (err) {
        console.error("Failed to disable Google auto select:", err);
      }
    }
    clearToken();
    setUser(null);
    setRole(null);
    setProfileName(null);
    setMobile(null);
  };

  return (
    <AuthCtx.Provider value={{ user, role, loading, profileName, mobile, isProfileSetupCompleted, refreshRole, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);