import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listAssets } from "@/api/client";
import type { Asset, AssetQuery } from "@/lib/types";

interface State {
  items: Asset[];
  total: number;
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
}

/** Owns debounced query loading, cancellation, cursor pages, and offline state. */
export function useAssets(query: AssetQuery) {
  const [state, setState] = useState<State>({
    items: [],
    total: 0,
    nextCursor: null,
    loading: true,
    error: null,
  });

  const [online, setOnline] = useState(() => navigator.onLine);
  const abortRef = useRef<AbortController | null>(null);
  const cache = useRef(new Map<string, ReturnType<typeof listAssets>>());
  const queryKey = useMemo(() => JSON.stringify({ ...query, cursor: undefined }), [query]);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const load = useCallback(
    async (cursor?: string, append = false) => {
      if (!online) {
        setState((current) => ({ ...current, loading: false, error: "You are offline. Reconnect to load assets." }));
        return;
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const requestQuery = { ...query, cursor };
      const key = JSON.stringify(requestQuery);
      setState((current) => ({ ...current, loading: true, error: null }));
      try {
        let promise = cache.current.get(key);
        if (!promise) {
          promise = listAssets(requestQuery, controller.signal);
          cache.current.set(key, promise);
          promise.catch(() => cache.current.delete(key));
        }
        const page = await promise;
        if (controller.signal.aborted) return;
        setState((current) => ({ items: append ? [...current.items, ...page.items] : page.items, total: page.total, nextCursor: page.nextCursor, loading: false, error: null }));
      } catch (err) {
        if (controller.signal.aborted) return;
        setState((current) => ({ ...current, loading: false, error: err instanceof Error ? err.message : "Unable to load assets." }));
      }
    },
    [online, query],
  );

  useEffect(() => {
    setState((current) => ({ ...current, items: [], total: 0, nextCursor: null, loading: true, error: null }));
    const timer = window.setTimeout(() => void load(), 280);
    return () => {
      window.clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [load, queryKey]);

  const loadMore = useCallback(() => {
    if (state.nextCursor && !state.loading) void load(state.nextCursor, true);
  }, [load, state.loading, state.nextCursor]);

  const retry = useCallback(() => void load(), [load]);

  return { ...state, loadMore, retry, hasMore: Boolean(state.nextCursor), online };
}
