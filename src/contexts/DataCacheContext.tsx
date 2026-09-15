import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface DataCacheContextType {
  get<T>(key: string): T | undefined;
  set<T>(key: string, data: T): void;
  invalidate(key: string): void;
  invalidatePrefix(prefix: string): void;
  clear(): void;
}

const DataCacheContext = createContext<DataCacheContextType | null>(null);

const CACHE_TTL_MS = 30_000;

export const DataCacheProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const cacheRef = useRef<Map<string, CacheEntry<unknown>>>(new Map());

  const get = useCallback(<T,>(key: string): T | undefined => {
    const entry = cacheRef.current.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      cacheRef.current.delete(key);
      return undefined;
    }
    return entry.data as T;
  }, []);

  const set = useCallback(<T,>(key: string, data: T) => {
    cacheRef.current.set(key, { data, timestamp: Date.now() });
  }, []);

  const invalidate = useCallback((key: string) => {
    cacheRef.current.delete(key);
  }, []);

  const invalidatePrefix = useCallback((prefix: string) => {
    for (const key of cacheRef.current.keys()) {
      if (key.startsWith(prefix)) cacheRef.current.delete(key);
    }
  }, []);

  const clear = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  return (
    <DataCacheContext.Provider value={{ get, set, invalidate, invalidatePrefix, clear }}>
      {children}
    </DataCacheContext.Provider>
  );
};

export function useDataCache() {
  const ctx = useContext(DataCacheContext);
  if (!ctx) throw new Error('useDataCache must be used within DataCacheProvider');
  return ctx;
}

export function useCachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  deps: unknown[] = []
): { data: T | null; loading: boolean; refresh: () => Promise<void> } {
  const cache = useDataCache();
  const [data, setData] = useState<T | null>(() => cache.get<T>(key) ?? null);
  const [loading, setLoading] = useState(() => !cache.get<T>(key));

  const fetchData = useCallback(async () => {
    const cached = cache.get<T>(key);
    if (cached) {
      setData(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await fetcher();
      cache.set(key, result);
      setData(result);
    } catch (e) {
      console.error(`useCachedFetch error [${key}]:`, e);
    }
    setLoading(false);
  }, [key, cache, ...deps]);

  const refresh = useCallback(async () => {
    cache.invalidate(key);
    await fetchData();
  }, [key, cache, fetchData]);

  React.useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, refresh };
}
