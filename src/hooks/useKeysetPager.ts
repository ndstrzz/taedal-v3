// src/hooks/useKeysetPager.ts
import { useCallback, useRef, useState } from "react";

type Cursor = { created_at: string; id: string } | null;

export function useKeysetPager<T>() {
  const [rows, setRows] = useState<T[]>([]);
  const [busy, setBusy] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const cursorRef = useRef<Cursor>(null);

  const reset = useCallback(() => {
    setRows([]);
    setBusy(false);
    setHasMore(true);
    setInitialLoading(true);
    cursorRef.current = null;
  }, []);

  const append = useCallback((batch: T[], nextCursor: Cursor, more: boolean) => {
    setRows((prev) => [...prev, ...batch]);
    cursorRef.current = nextCursor;
    setHasMore(more);
    setBusy(false);
    setInitialLoading(false);
  }, []);

  return {
    rows,
    setRows,
    busy,
    setBusy,
    hasMore,
    setHasMore,
    initialLoading,
    setInitialLoading,
    cursor: cursorRef.current,
    setCursor: (c: Cursor) => (cursorRef.current = c),
    reset,
    append,
  };
}
