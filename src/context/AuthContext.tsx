import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { api } from "../lib/api";

export interface Branch {
  id: string;
  name: string;
  code: string;
}

export interface Account {
  id: string;
  name: string;
  brand_name: string | null;
  logo_url: string | null;
  brand_hex_color: string;
  onboarding_status: "pending" | "in_progress" | "done";
  quest_dismissed: boolean;
}

export interface User {
  id: string;
  accountId: string;
  name: string;
  email: string;
}

interface AuthContextValue {
  user: User | null;
  account: Account | null;
  branches: Branch[];
  activeBranchId: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, accountName: string) => Promise<void>;
  logout: () => Promise<void>;
  switchBranch: (branchId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get("/auth/me");
      setUser(res.data.user);
      setAccount(res.data.account);
      setBranches(res.data.branches);
      const active = localStorage.getItem("activeBranchId") || res.data.activeBranchId;
      setActiveBranchId(active);
      if (active) localStorage.setItem("activeBranchId", active);
    } catch {
      setUser(null);
      setAccount(null);
      setBranches([]);
      setActiveBranchId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      await api.post("/auth/login", { email, password });
      await refresh();
    },
    [refresh]
  );

  const signup = useCallback(
    async (email: string, password: string, name: string, accountName: string) => {
      await api.post("/auth/signup", { email, password, name, accountName });
      await refresh();
    },
    [refresh]
  );

  const logout = useCallback(async () => {
    await api.post("/auth/logout");
    localStorage.removeItem("activeBranchId");
    setUser(null);
    setAccount(null);
    setBranches([]);
    setActiveBranchId(null);
  }, []);

  const switchBranch = useCallback(async (branchId: string) => {
    await api.post("/branches/switch", { branchId });
    localStorage.setItem("activeBranchId", branchId);
    setActiveBranchId(branchId);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, account, branches, activeBranchId, loading, login, signup, logout, switchBranch, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
