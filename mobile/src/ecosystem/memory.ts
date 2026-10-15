import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "../state/sessionStore";

export type MemoryPages = {
  dream: { enabled: boolean; schedule: string };
  pages: {
    user: { text: string; truncated: boolean };
    memory: { text: string; truncated: boolean };
    soul: { text: string; truncated: boolean };
  };
  latest: null | { time: string; subject: string; diff: string; truncated: boolean };
};

export function useMemory() {
  const { session } = useSession();
  const [pages, setPages] = useState<MemoryPages | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const gen = useRef(0);

  const refresh = useCallback(async () => {
    if (!session) return;
    const my = ++gen.current;
    setLoading(true);
    try {
      const p = await session.get<MemoryPages>("/api/ext/memory/pages");
      if (gen.current !== my) return;
      setPages(p);
      setError(false);
    } catch {
      if (gen.current !== my) return;
      setError(true);
      setPages(null);
    } finally {
      if (gen.current === my) setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { pages, loading, error, refresh };
}
