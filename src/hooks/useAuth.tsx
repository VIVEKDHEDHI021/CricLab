import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { authService, type AuthUser } from "@/lib/services/authService";
import { getToken, clearToken } from "@/lib/api";

export type Role = "admin" | "user" | null;

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
    const startTime = Date.now();
    const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

    const init = async () => {
      if (token) {
        await loadUser();
      }
      const elapsed = Date.now() - startTime;
      const remaining = 2000 - elapsed; // 2 seconds minimum display
      if (remaining > 0) {
        await delay(remaining);
      }
      setLoading(false);
    };

    init();
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