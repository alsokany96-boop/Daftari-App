import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { storage } from "@/src/utils/storage";
import { api, UserPublic, PublicConfig } from "@/src/utils/api";

const TOKEN_KEY = "daftari_auth_token";
const USER_KEY = "daftari_user";

type SessionContextValue = {
  token: string | null;
  user: UserPublic | null;
  config: PublicConfig | null;
  isLoading: boolean;
  signIn: (token: string, user: UserPublic) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUserState] = useState<UserPublic | null>(null);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const fresh = await api.me();
      setUserState(fresh);
      await storage.setItem(USER_KEY, JSON.stringify(fresh));
    } catch {
      // ignore transient failures
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([
          storage.secureGet<string>(TOKEN_KEY, ""),
          storage.getItem<string>(USER_KEY, ""),
        ]);
        if (storedToken) setTokenState(storedToken);
        if (storedUser) {
          try {
            setUserState(JSON.parse(storedUser));
          } catch {
            /* ignore */
          }
        }
        // Load public config in background
        try {
          const cfg = await api.config();
          setConfig(cfg);
        } catch {
          /* ignore */
        }
        // Refresh user info if we have a token
        if (storedToken) {
          try {
            const fresh = await api.me();
            setUserState(fresh);
            await storage.setItem(USER_KEY, JSON.stringify(fresh));
          } catch {
            /* ignore */
          }
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const signIn = useCallback(async (newToken: string, newUser: UserPublic) => {
    await storage.secureSet(TOKEN_KEY, newToken);
    await storage.setItem(USER_KEY, JSON.stringify(newUser));
    setTokenState(newToken);
    setUserState(newUser);
  }, []);

  const signOut = useCallback(async () => {
    await storage.secureRemove(TOKEN_KEY);
    await storage.removeItem(USER_KEY);
    setTokenState(null);
    setUserState(null);
  }, []);

  return (
    <SessionContext.Provider value={{ token, user, config, isLoading, signIn, signOut, refreshUser }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
