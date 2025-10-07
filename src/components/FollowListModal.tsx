import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../state/AuthContext";
import FollowButton from "./FollowButton";

/** ---------- small inline helpers (no new files) ---------- */
function encodeCursor(obj: Record<string, any>): string {
  return btoa(JSON.stringify(obj));
}
function decodeCursor<T = any>(cur?: string | null): T | null {
  if (!cur) return null;
  try { return JSON.parse(atob(cur)); } catch { return null; }
}
async function fetchBlockedIds(viewerId?: string | null): Promise<Set<string>> {
  if (!viewerId) return new Set();
  const { data } = await supabase.from("blocks").select("blocked").eq("blocker", viewerId);
  return new Set((data || []).map((r: any) => r.blocked as string));
}
/** -------------------------------------------------------- */

type Props = {
  open: boolean;
  userId: string;                 // whose list we’re viewing
  ownerUsername?: string | null;  // for empty-state CTA
  mode: "followers" | "following";
  onClose: () => void;
};

type Row = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at?: string | null; // from follows for keyset
};

const PAGE = 24;

export default function FollowListModal({
  open,
  userId,
  ownerUsername,
  mode,
  onClose,
}: Props) {
  const { user } = useAuth();
  const viewerId = user?.id || null;
  const navigate = useNavigate();

  // data
  const [rows, setRows] = useState<Row[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  // header mutuals (followers ∩ following of OWNER)
  const [mutualsCount, setMutualsCount] = useState<number | null>(null);

  // viewer-relative edges for badges
  const [youFollowIds, setYouFollowIds] = useState<Set<string>>(new Set());
  const [followsYouIds, setFollowsYouIds] = useState<Set<string>>(new Set());

  // viewer blocks
  const [blocked, setBlocked] = useState<Set<string>>(new Set());

  // filters
  type Filter = "all" | "mutuals" | "following" | "followers";
  const [filter, setFilter] = useState<Filter>("all");

  // scrolling
  const listRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  /** ---------- resets when opened / inputs change ---------- */
  useEffect(() => {
    if (!open) return;
    setRows([]);
    setCursor(null);
    setHasMore(true);
    setLoading(false);
    setYouFollowIds(new Set());
    setFollowsYouIds(new Set());
    setFilter("all");
    setMutualsCount(null);
  }, [open, userId, mode]);

  /** viewer blocked ids */
  useEffect(() => {
    let alive = true;
    (async () => {
      const b = await fetchBlockedIds(viewerId);
      if (alive) setBlocked(b);
    })();
    return () => { alive = false; };
  }, [viewerId]);

  /** mutuals header count (owner’s followers ∩ following) */
  useEffect(() => {
    if (!open) return;
    (async () => {
      const [{ data: f1 }, { data: f2 }] = await Promise.all([
        supabase.from("follows").select("follower_id").eq("target_id", userId),
        supabase.from("follows").select("target_id").eq("follower_id", userId),
      ]);
      const followers = new Set((f1 || []).map((r: any) => r.follower_id as string));
      const following = new Set((f2 || []).map((r: any) => r.target_id as string));
      let cnt = 0;
      followers.forEach((id) => { if (following.has(id)) cnt++; });
      setMutualsCount(cnt);
    })();
  }, [open, userId]);

  /** keyset page loader */
  const loadMore = useCallback(async () => {
    if (!open || loading || !hasMore) return;
    setLoading(true);

    try {
      const idCol = mode === "followers" ? "follower_id" : "target_id";
      const whereCol = mode === "followers" ? "target_id" : "follower_id";

      const cur = decodeCursor<{ created_at: string; id: string }>(cursor);

      // Build keyset query over (created_at desc, id desc).
      // Supabase doesn’t support tuple comparisons directly; emulate:
      let q = supabase
        .from("follows")
        .select(`${idCol}, created_at`)
        .eq(whereCol, userId)
        .order("created_at", { ascending: false })
        .order(idCol, { ascending: false })
        .limit(PAGE + 1);

      if (cur?.created_at && cur?.id) {
        // created_at < cur.created_at OR (created_at = cur.created_at AND id < cur.id)
        q = q.or(
          `created_at.lt.${cur.created_at},and(created_at.eq.${cur.created_at},${idCol}.lt.${cur.id})`
        );
      }

      const { data: fids, error } = await q;
      if (error) throw error;

      const items = (fids || []).slice(0, PAGE) as any[];
      setHasMore((fids || []).length > PAGE);
      if (items.length === 0) { setLoading(false); return; }

      const ids = items.map((r) => r[idCol] as string).filter((id) => !blocked.has(id));
      if (ids.length === 0) { setLoading(false); return; }

      const { data: users } = await supabase
        .from("profiles")
        .select("id,username,display_name,avatar_url")
        .in("id", ids);

      const createdMap = new Map(ids.map((id, i) => [id, items[i].created_at]));
      const batch: Row[] = (users || []).map((u: any) => ({
        ...u,
        created_at: createdMap.get(u.id) || null,
      }));

      // decorate viewer-relative edges for badges
      if (viewerId && batch.length) {
        const [{ data: youF }, { data: theyF }] = await Promise.all([
          supabase.from("follows").select("target_id").eq("follower_id", viewerId).in("target_id", ids),
          supabase.from("follows").select("follower_id").eq("target_id", viewerId).in("follower_id", ids),
        ]);
        setYouFollowIds((prev) => {
          const n = new Set(prev);
          (youF || []).forEach((r: any) => n.add(r.target_id));
          return n;
        });
        setFollowsYouIds((prev) => {
          const n = new Set(prev);
          (theyF || []).forEach((r: any) => n.add(r.follower_id));
          return n;
        });
      }

      setRows((r) => [...r, ...batch]);

      const last = items[items.length - 1];
      setCursor(encodeCursor({ created_at: last.created_at, id: last[idCol] as string }));
    } finally {
      setLoading(false);
    }
  }, [open, loading, hasMore, cursor, mode, userId, viewerId, blocked]);

  /** initial load + infinite scroll */
  useEffect(() => { if (open) void loadMore(); }, [open, loadMore]);

  useEffect(() => {
    if (!open) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const obs = new IntersectionObserver(
      (ents) => { if (ents[0].isIntersecting && hasMore && !loading) void loadMore(); },
      { root: listRef.current, rootMargin: "200px" }
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [open, hasMore, loading, loadMore]);

  /** viewer-relative badges + filter counts */
  const items = useMemo(() => {
    return rows.map((u) => {
      const youFollow = viewerId ? youFollowIds.has(u.id) : false;     // viewer -> user
      const followsYou = viewerId ? followsYouIds.has(u.id) : false;   // user -> viewer
      const mutual = youFollow && followsYou;
      const followBack = followsYou && !youFollow;
      return { ...u, youFollow, followsYou, mutual, followBack };
    });
  }, [rows, viewerId, youFollowIds, followsYouIds]);

  const counts = useMemo(() => {
    let mutuals = 0, following = 0, followers = 0;
    for (const u of items) {
      if (u.mutual)    mutuals++;
      if (u.youFollow) following++;
      if (u.followsYou) followers++;
    }
    return { mutuals, following, followers };
  }, [items]);

  const filteredItems = useMemo(() => {
    switch (filter) {
      case "mutuals":   return items.filter((u) => u.mutual);
      case "following": return items.filter((u) => u.youFollow);
      case "followers": return items.filter((u) => u.followsYou);
      default:          return items;
    }
  }, [items, filter]);

  if (!open) return null;

  const title = mode === "followers" ? "Followers" : "Following";
  const emptyCTA =
    mode === "followers"
      ? `Be the first to follow${ownerUsername ? ` @${ownerUsername}` : ""}.`
      : `${ownerUsername ? `@${ownerUsername} hasn’t followed anyone yet.` : "No following yet."}`;

  const SkeletonRow = () => (
    <li className="flex items-center gap-3 px-3 py-2">
      <div className="h-8 w-8 animate-pulse rounded-full bg-neutral-800" />
      <div className="min-w-0 flex-1">
        <div className="mb-1 h-3 w-32 animate-pulse rounded bg-neutral-800" />
        <div className="h-2 w-20 animate-pulse rounded bg-neutral-800" />
      </div>
      <div className="h-7 w-20 animate-pulse rounded bg-neutral-800" />
    </li>
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="text-lg font-semibold">{title}</div>
            {mutualsCount !== null && (
              <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-xs text-neutral-300">
                Mutuals: {mutualsCount}
              </span>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-900">
            Close
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 px-3 pt-2">
          {(["all","mutuals","following","followers"] as const).map((f) => (
            <button
              key={f}
              className={`rounded-full border px-2 py-1 text-xs ${
                filter === f ? "border-neutral-500 text-neutral-100" : "border-neutral-700 text-neutral-300 hover:bg-neutral-900"
              }`}
              onClick={() => setFilter(f)}
              title={
                f === "mutuals" ? "People you follow who also follow you" :
                f === "following" ? "People you follow" :
                f === "followers" ? "People who follow you" : undefined
              }
            >
              {f[0].toUpperCase() + f.slice(1)}
              {f !== "all" && (
                <span className="ml-1 text-neutral-400">
                  ({f === "mutuals" ? counts.mutuals : f === "following" ? counts.following : counts.followers})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* List */}
        <div ref={listRef} className="max-h-[60vh] overflow-auto p-2">
          {filteredItems.length === 0 && !loading && (
            <div className="px-3 py-6 text-sm text-neutral-400">{emptyCTA}</div>
          )}

          <ul className="divide-y divide-neutral-800">
            {loading && rows.length === 0 && Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={`sk-${i}`} />)}

            {filteredItems.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-3 py-2">
                <button
                  onClick={() => {
                    if (u.username) {
                      onClose();
                      navigate(`/u/${encodeURIComponent(u.username)}`);
                    }
                  }}
                  className="flex items-center gap-3"
                  aria-label={u.username ? `Open @${u.username}` : "Open user"}
                >
                  <img
                    src={u.avatar_url || "/brand/taedal-logo.svg"}
                    className="h-8 w-8 rounded-full object-cover"
                    alt=""
                    loading="lazy"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm">
                      {u.display_name || (u.username ? `@${u.username}` : "User")}
                    </div>
                    {u.username && <div className="truncate text-xs text-neutral-400">@{u.username}</div>}
                  </div>
                </button>

                <div className="ml-auto flex items-center gap-2">
                  {u.mutual && <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-xs text-neutral-200">Mutual</span>}
                  {!u.mutual && u.followsYou && <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-xs text-neutral-200">Follows you</span>}
                  {u.followBack && viewerId && viewerId !== u.id && (
                    <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-xs text-neutral-200">Follow back</span>
                  )}

                  {viewerId && viewerId !== u.id && (
                    <FollowButton
                      targetId={u.id}
                      onToggled={async () => {
                        // refresh just this user’s edges
                        const id = u.id;
                        const [{ data: yf }, { data: fy }] = await Promise.all([
                          supabase.from("follows").select("target_id").eq("follower_id", viewerId).eq("target_id", id),
                          supabase.from("follows").select("follower_id").eq("target_id", viewerId).eq("follower_id", id),
                        ]);
                        setYouFollowIds((prev) => { const n = new Set(prev); yf && yf.length ? n.add(id) : n.delete(id); return n; });
                        setFollowsYouIds((prev) => { const n = new Set(prev); fy && fy.length ? n.add(id) : n.delete(id); return n; });
                      }}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>

          <div ref={sentinelRef} />
          {loading && rows.length > 0 && <div className="px-3 py-3 text-center text-sm text-neutral-400">Loading…</div>}
          {!hasMore && filteredItems.length > 0 && <div className="px-3 py-3 text-center text-xs text-neutral-500">No more users</div>}
        </div>
      </div>
    </div>
  );
}
