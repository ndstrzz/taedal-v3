import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Art = {
  id: string;
  title: string | null;
  cover_url: string | null;
  image_cid: string | null;
};

type Row = {
  created_at: string;
  // Supabase can return object or array depending on FK metadata
  artworks: Art | Art[] | null;
};

const PAGE = 12;
const ipfs = (cid?: string | null) => (cid ? `https://ipfs.io/ipfs/${cid}` : "");
const pickFirst = (a: Row["artworks"]): Art | null => (Array.isArray(a) ? a[0] ?? null : a);

export default function LikesGrid({ profileId }: { profileId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // guard against double-loads while a reset is in flight
  const resettingRef = useRef(false);

  async function loadMore() {
    if (busy || !hasMore) return;
    setBusy(true);
    const from = page * PAGE;
    const to = from + PAGE - 1;

    const { data, count, error } = await supabase
      .from("likes")
      .select(
        "created_at, artworks:artwork_id ( id, title, cover_url, image_cid )",
        { count: "exact" }
      )
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      setBusy(false);
      setInitialLoading(false);
      return;
    }

    const normalized: Row[] = (data as any[] | null || [])
      .map((r) => ({ ...r, artworks: pickFirst((r as Row).artworks) }))
      .filter((r) => r.artworks) as Row[];

    setRows((prev) => [...prev, ...normalized]);
    setPage((p) => p + 1);
    const total = typeof count === "number" ? count : from + normalized.length;
    setHasMore(from + normalized.length < total);
    setBusy(false);
    setInitialLoading(false);
  }

  // Soft reset + reload first page
  async function resetAndReload() {
    if (resettingRef.current) return;
    resettingRef.current = true;
    setRows([]);
    setPage(0);
    setHasMore(true);
    setInitialLoading(true);
    await loadMore();
    resettingRef.current = false;
  }

  // initial load & reload when profile changes
  useEffect(() => {
    resetAndReload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  // ---------------- Realtime subscription ----------------
  useEffect(() => {
    // channel name scoped to profileId
    const channel = supabase
      .channel(`likes-live-${profileId}`)
      .on(
        "postgres_changes",
        {
          event: "*", // "INSERT" | "DELETE" | "UPDATE"
          schema: "public",
          table: "likes",
          filter: `profile_id=eq.${profileId}`,
        },
        async (payload) => {
          // For INSERT/DELETE/UPDATE, we simply reset and fetch first page to keep counts and order correct.
          // (Keeps code simple; you can optimize later with local diffing.)
          await resetAndReload();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [profileId]);
  // -------------------------------------------------------

  const showEmpty = rows.length === 0 && !hasMore && !initialLoading;

  return (
    <>
      {/* Grid */}
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {/* Initial skeletons */}
        {initialLoading &&
          Array.from({ length: 8 }).map((_, i) => (
            <li key={`sk-${i}`}>
              <div className="aspect-square w-full overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900">
                <div className="h-full w-full animate-pulse bg-neutral-800" />
              </div>
              <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-neutral-800" />
            </li>
          ))}

        {/* Real rows */}
        {rows.map((r) => {
          const a = pickFirst(r.artworks)!;
          const img = a.cover_url || ipfs(a.image_cid);
          return (
            <li key={a.id} className="group">
              <Link to={`/a/${a.id}`}>
                <div className="aspect-square w-full overflow-hidden rounded-2xl bg-neutral-900">
                  {img ? (
                    <img
                      src={img}
                      alt={a.title ?? ""}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-sm text-neutral-500">
                      No image
                    </div>
                  )}
                </div>
                <div className="mt-2 truncate text-sm text-neutral-200">
                  {a.title || "Untitled"}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Load more / loading skeleton row */}
      <div className="mt-6">
        {busy && !initialLoading && (
          <div className="mx-auto h-8 w-32 animate-pulse rounded bg-neutral-800" />
        )}
        {!busy && hasMore && !initialLoading && (
          <button
            onClick={loadMore}
            className="rounded-xl border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-900"
          >
            Load more
          </button>
        )}
      </div>

      {showEmpty && <div className="text-neutral-400">No likes yet.</div>}
    </>
  );
}
