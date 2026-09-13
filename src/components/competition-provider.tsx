"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CompetitionFeed } from "@/lib/competitions";
type FeedContext = {
  feed: CompetitionFeed | null;
  error: string;
  refresh: () => Promise<void>;
};
const Context = createContext<FeedContext | null>(null);
export function CompetitionProvider({ children }: { children: ReactNode }) {
  const [feed, setFeed] = useState<CompetitionFeed | null>(null),
    [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch("/api/competitions", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(
          "Competition updates are unavailable. The last snapshot may be out of date.",
        );
      const next = (await response.json()) as CompetitionFeed;
      if (!controller.signal.aborted) {
        setFeed(next);
        setError("");
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error ? e.message : "Unable to load competitions.",
        );
    }
  }, []);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30000);
    const visibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      request.current?.abort();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [refresh]);
  return (
    <Context.Provider value={{ feed, error, refresh }}>
      {children}
    </Context.Provider>
  );
}
export function useCompetitions() {
  const value = useContext(Context);
  if (!value) throw new Error("CompetitionProvider required");
  return value;
}
