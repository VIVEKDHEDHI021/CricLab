import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { authService, type AuthUser } from "@/lib/services/authService";
import { getToken, clearToken } from "@/lib/api";

export type Role = "admin" | "user" | "scorer" | null;

type Ctx = {
  user: AuthUser | null;
  role: Role;
  loading: boolean;
  profileName: string | null;
  mobile: string | null;
  refreshRole: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<Ctx>({
  user: null, role: null, loading: true,
  profileName: null, mobile: null,
  refreshRole: async () => {}, signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [mobile, setMobile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = async () => {
    try {
      const me = await authService.getMe();
      setUser(me);
      setRole(me.role);
      setProfileName(me.name);
      setMobile(me.mobile);
    } catch {
      setUser(null);
      setRole(null);
      setProfileName(null);
      setMobile(null);
      clearToken();
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
    <AuthCtx.Provider value={{ user, role, loading, profileName, mobile, refreshRole, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);