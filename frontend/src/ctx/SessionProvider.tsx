import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { storage } from "@/src/utils/storage";
import { api, UserPublic, PublicConfig, Store, PartyType } from "@/src/utils/api";

const TOKEN_KEY = "daftari_auth_token";
const USER_KEY = "daftari_user";
const STORE_KEY = "daftari_active_store";

type SessionContextValue = {
  token: string | null;
  user: UserPublic | null;
  config: PublicConfig | null;
  stores: Store[];
  activeStoreId: string | null;
  partyType: PartyType;
  isLoading: boolean;
  signIn: (token: string, user: UserPublic) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshConfig: () => Promise<void>;
  refreshStores: () => Promise<void>;
  setActiveStoreId: (id: string) => Promise<void>;
  setPartyType: (t: PartyType) => void;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUserState] = useState<UserPublic | null>(null);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [activeStoreId, setActiveStoreIdState] = useState<string | null>(null);
  const [partyType, setPartyType] = useState<PartyType>("customer");
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const fresh = await api.me();
      setUserState(fresh);
      await storage.setItem(USER_KEY, JSON.stringify(fresh));
    } catch {
      /* ignore */
    }
  }, []);

  const refreshConfig = useCallback(async () => {
    try {
      const cfg = await api.config();
      setConfig(cfg);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshStores = useCallback(async () => {
    try {
      const list = await api.listStores();
      setStores(list);
      // Ensure activeStoreId is valid
      const cached = await storage.getItem<string>(STORE_KEY, "");
      const validCached = cached && list.some((s) => s.id === cached);
      if (validCached) {
        setActiveStoreIdState(cached);
      } else if (list.length > 0) {
        setActiveStoreIdState(list[0].id);
        await storage.setItem(STORE_KEY, list[0].id);
      } else {
        setActiveStoreIdState(null);
      }
    } catch {
      /* ignore */
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
        try {
          const cfg = await api.config();
          setConfig(cfg);
        } catch {
          /* ignore */
        }
        if (storedToken) {
          try {
            const fresh = await api.me();
            setUserState(fresh);
            await storage.setItem(USER_KEY, JSON.stringify(fresh));
            if (fresh.is_active && fresh.role !== "super_admin") {
              await refreshStores();
            }
          } catch {
            /* ignore */
          }
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, [refreshStores]);

  const signIn = useCallback(
    async (newToken: string, newUser: UserPublic) => {
      await storage.secureSet(TOKEN_KEY, newToken);
      await storage.setItem(USER_KEY, JSON.stringify(newUser));
      setTokenState(newToken);
      setUserState(newUser);
      if (newUser.is_active && newUser.role !== "super_admin") {
        await refreshStores();
      }
    },
    [refreshStores]
  );

  const signOut = useCallback(async () => {
    await storage.secureRemove(TOKEN_KEY);
    await storage.removeItem(USER_KEY);
    await storage.removeItem(STORE_KEY);
    setTokenState(null);
    setUserState(null);
    setStores([]);
    setActiveStoreIdState(null);
    setPartyType("customer");
  }, []);

  const setActiveStoreId = useCallback(async (id: string) => {
    setActiveStoreIdState(id);
    await storage.setItem(STORE_KEY, id);
  }, []);

  return (
    <SessionContext.Provider
      value={{
        token,
        user,
        config,
        stores,
        activeStoreId,
        partyType,
        isLoading,
        signIn,
        signOut,
        refreshUser,
        refreshConfig,
        refreshStores,
        setActiveStoreId,
        setPartyType,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
