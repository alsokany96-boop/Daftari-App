import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { storage } from "@/src/utils/storage";

const TOKEN_KEY = "daftari_auth_token";
const USER_KEY = "daftari_user";

export type SessionUser = {
  id: string;
  username: string;
  shop_name?: string | null;
};

type SessionContextValue = {
  token: string | null;
  user: SessionUser | null;
  isLoading: boolean;
  signIn: (token: string, user: SessionUser) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUserState] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const storedToken = await storage.secureGet<string>(TOKEN_KEY, "");
        const storedUser = await storage.getItem<string>(USER_KEY, "");
        if (storedToken) setTokenState(storedToken);
        if (storedUser) {
          try {
            setUserState(JSON.parse(storedUser));
          } catch {
            /* ignore */
          }
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const signIn = useCallback(async (newToken: string, newUser: SessionUser) => {
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
    <SessionContext.Provider value={{ token, user, isLoading, signIn, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
