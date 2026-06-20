import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { authService, type AuthUser } from "@/lib/services/authService";
import { getToken, clearToken } from "@/lib/api";
import { sqliteService } from "@/lib/services/sqliteService";
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

  const setGuestUser = () => {
    setUser({
      id: "guest",
      name: "Guest Viewer",
      username: "guest",
      mobile: "0000000000",
      role: "user",
      is_profile_setup_completed: true,
      must_change_password: false,
    });
    setRole("user");
    setProfileName("Guest Viewer");
    setMobile("0000000000");
    setIsProfileSetupCompleted(true);
    setMustChangePassword(false);
  };

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
      setGuestUser();
      await clearToken();
    }
  };

  useEffect(() => {
    const initApp = async () => {
      try {
        await sqliteService.initialize();
        const token = await getToken();
        if (token) {
          await loadUser();
        } else {
          setGuestUser();
        }
      } catch (err: any) {
        console.error("Initialization failed", err);
        setGuestUser();
      } finally {
        setLoading(false);
      }
    };
    initApp();
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

    await clearToken();
    setGuestUser();
  };

  return (
    <AuthCtx.Provider value={{ user, role, loading, profileName, mobile, isProfileSetupCompleted, mustChangePassword, refreshRole, signOut, setIsProfileSetupCompleted, setAuthUser }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);