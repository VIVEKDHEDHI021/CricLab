import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { authService, type AuthUser } from "@/lib/services/authService";
import { getToken, clearToken } from "@/lib/api";
import { toast } from "sonner";

export type Role = "admin" | "user" | "scorer" | null;

type Ctx = {
  user: AuthUser | null;
  role: Role;
  loading: boolean;
  profileName: string | null;
  mobile: string | null;
  isProfileSetupCompleted: boolean;
  mustChangePassword: boolean;
  refreshRole: () => Promise<void>;
  signOut: () => Promise<void>;
  setIsProfileSetupCompleted: (val: boolean) => void;
  setAuthUser: (user: AuthUser) => void;
};

const AuthCtx = createContext<Ctx>({
  user: null, role: null, loading: true,
  profileName: null, mobile: null,
  isProfileSetupCompleted: false,
  mustChangePassword: false,
  refreshRole: async () => {}, signOut: async () => {},
  setIsProfileSetupCompleted: () => {},
  setAuthUser: () => {},
});

const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [mobile, setMobile] = useState<string | null>(null);
  const [isProfileSetupCompleted, setIsProfileSetupCompleted] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [loading, setLoading] = useState(true);

  const setAuthUser = (me: AuthUser) => {
    setUser(me);
    setRole(me.role);
    setProfileName(me.name);
    setMobile(me.mobile);
    setMustChangePassword(!!me.must_change_password);
    setIsProfileSetupCompleted(!!me.is_profile_setup_completed);
  };

  const loadUser = async () => {
    try {
      const me = await withTimeout(authService.getMe(), 5000, "Session verification timed out.");
      setAuthUser(me);
    } catch (err: any) {
      setUser(null);
      setRole(null);
      setProfileName(null);
      setMobile(null);
      setIsProfileSetupCompleted(false);
      setMustChangePassword(false);
      clearToken();
      toast.error(err.message || "Session verification failed. Please sign in again.");
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
    setIsProfileSetupCompleted(false);
    setMustChangePassword(false);
  };

  return (
    <AuthCtx.Provider value={{ user, role, loading, profileName, mobile, isProfileSetupCompleted, mustChangePassword, refreshRole, signOut, setIsProfileSetupCompleted, setAuthUser }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);