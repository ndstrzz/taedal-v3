import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../state/AuthContext";
import FollowButton from "./FollowButton";

type Props = {
  open: boolean;
  userId: string;                 // profile owner whose list we’re viewing
  ownerUsername?: string | null;  // for empty-state CTA (optional)
  mode: "followers" | "following";
  onClose: () => void;
};

type Row = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
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

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // cross-info (for badges)
  const [youFollowIds, setYouFollowIds] = useState<Set<string>>(new Set());
  const [followsYouIds, setFollowsYouIds] = useState<Set<string>>(new Set());

  // mutuals for the OWNER (header count)
  const [mutualsCount, setMutualsCount] = useState<number | null>(null);

  // infinite scroll sentinel
  const listRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // reset when opened or inputs change
  useEffect(() => {
    if (!open) return;
    setRows([]);
    setPage(0);
    setHasMore(true);
    setMutualsCount(null);
    setYouFollowIds(new Set());
    setFollowsYouIds(new Set());
  }, [open, userId, mode]);

  // initial load
  useEffect(() => {
    if (!open) return;
    void loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // fetch owner mutuals count (followers ∩ following of the OWNER)
  useEffect(() => {
    if (!open) return;
    (async () => {
      // followers of owner
      const { data: f1 } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("target_id", userId);
      // following of owner
      const { data: f2 } = await supabase
        .from("follows")
        .select("target_id")
        .eq("follower_id", userId);

      const followersIds = new Set((f1 || []).map((r: any) => r.follower_id as string));
      const followingIds = new Set((f2 || []).map((r: any) => r.target_id as string));
      let cnt = 0;
      followersIds.forEach((id) => {
        if (followingIds.has(id)) cnt++;
      });
      setMutualsCount(cnt);
    })();
  }, [open, userId]);

  // helper to fetch a page (from view, then fallback)
  const fetchPage = useCallback(
    async (from: number, to: number) => {
      const viewName = mode === "followers" ? "followers_list" : "following_list";

      // try view first
      const { data, error, count } = await supabase
        .from(viewName)
        .select("id,username,display_name,avatar_url", { count: "exact" })
        .eq("user_id", userId)
        .range(from, to);

      if (!error && data) {
        return {
          batch: data as Row[],
          total: typeof count === "number" ? count : undefined,
        };
      }

      // fallback: core tables
      const idColumn = mode === "followers" ? "follower_id" : "target_id";
      const whereColumn = mode === "followers" ? "target_id" : "follower_id";

      const { data: idRows } = await supabase
        .from("follows")
        .select(idColumn)
        .eq(whereColumn, userId);

      const ids = (idRows || []).map((r: any) => r[idColumn]) as string[];
      const slice = ids.slice(from, to + 1);
      if (slice.length === 0) {
        return { batch: [] as Row[], total: ids.length };
      }
      const { data: users } = await supabase
        .from("profiles")
        .select("id,username,display_name,avatar_url")
        .in("id", slice);

      return {
        batch: ((users || []) as Row[]).sort((a, b) =>
          (a.username || "").localeCompare(b.username || "")
        ),
        total: ids.length,
      };
    },
    [mode, userId]
  );

  // load a page & enrich with follow badges
  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);

    const from = page * PAGE;
    const to = from + PAGE - 1;

    try {
      const { batch, total } = await fetchPage(from, to);

      // update rows/pagination
      setRows((r) => [...r, ...batch]);
      setPage((p) => p + 1);
      const effectiveTotal = total ?? from + batch.length;
      setHasMore(from + batch.length < effectiveTotal);

      // if we have a viewer, pull follow edges to decorate
      if (viewerId && batch.length > 0) {
        const ids = batch.map((b) => b.id);

        // youFollow: viewer -> ids
        const { data: youFollow } = await supabase
          .from("follows")
          .select("target_id")
          .eq("follower_id", viewerId)
          .in("target_id", ids);

        // followsYou: ids -> viewer
        const { data: theyFollow } = await supabase
          .from("follows")
          .select("follower_id")
          .eq("target_id", viewerId)
          .in("follower_id", ids);

        setYouFollowIds((prev) => {
          const next = new Set(prev);
          (youFollow || []).forEach((r: any) => next.add(r.target_id as string));
          return next;
        });
        setFollowsYouIds((prev) => {
          const next = new Set(prev);
          (theyFollow || []).forEach((r: any) => next.add(r.follower_id as string));
          return next;
        });
      }
    } finally {
      setLoading(false);
    }
  }, [fetchPage, hasMore, loading, page, viewerId]);

  // infinite scroll using IntersectionObserver
  useEffect(() => {
    if (!open) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (e.isIntersecting && hasMore && !loading) {
          void loadMore();
        }
      },
      { root: listRef.current, rootMargin: "200px" }
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [open, hasMore, loading, loadMore]);

  // composited row meta
  const items = useMemo(() => {
    return rows.map((u) => {
      const youFollow = viewerId ? youFollowIds.has(u.id) : false;
      const followsYou = viewerId ? followsYouIds.has(u.id) : false;
      const mutual = youFollow && followsYou;
      const followBack = followsYou && !youFollow; // badge target
      return { ...u, youFollow, followsYou, mutual, followBack };
    });
  }, [rows, viewerId, youFollowIds, followsYouIds]);

  if (!open) return null;

  const title =
    mode === "followers" ? "Followers" : "Following";

  const emptyCTA =
    mode === "followers"
      ? `Be the first to follow${ownerUsername ? ` @${ownerUsername}` : ""}.`
      : `${ownerUsername ? `@${ownerUsername} hasn’t followed anyone yet.` : "No following yet."}`;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
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
          <button
            onClick={onClose}
            className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-900"
          >
            Close
          </button>
        </div>

        {/* List */}
        <div ref={listRef} className="max-h-[60vh] overflow-auto p-2">
          {items.length === 0 && !loading && (
            <div className="px-3 py-6 text-sm text-neutral-400">{emptyCTA}</div>
          )}

          <ul className="divide-y divide-neutral-800">
            {items.map((u) => {
              return (
                <li key={u.id} className="flex items-center gap-3 px-3 py-2">
                  <button
                    onClick={() => {
                      if (u.username) {
                        onClose();
                        navigate(`/u/${encodeURIComponent(u.username)}`);
                      }
                    }}
                    className="flex items-center gap-3"
                  >
                    <img
                      src={u.avatar_url || "/brand/taedal-logo.svg"}
                      className="h-8 w-8 rounded-full object-cover"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm">
                        {u.display_name || (u.username ? `@${u.username}` : "User")}
                      </div>
                      {u.username && (
                        <div className="truncate text-xs text-neutral-400">@{u.username}</div>
                      )}
                    </div>
                  </button>

                  <div className="ml-auto flex items-center gap-2">
                    {/* Badges */}
                    {u.mutual && (
                      <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-xs text-neutral-200">
                        Mutual
                      </span>
                    )}
                    {!u.mutual && u.followsYou && (
                      <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-xs text-neutral-200">
                        Follows you
                      </span>
                    )}
                    {u.followBack && viewerId && viewerId !== u.id && (
                      <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-xs text-neutral-200">
                        Follow back
                      </span>
                    )}

                    {/* Inline follow button (only if signed in & not yourself) */}
                    {viewerId && viewerId !== u.id && (
                      <FollowButton
                        targetId={u.id}
                        onToggled={() => {
                          // Recompute badges for that user by refetching edges for just this id
                          (async () => {
                            const id = u.id;
                            const [{ data: yf }, { data: fy }] = await Promise.all([
                              supabase
                                .from("follows")
                                .select("target_id")
                                .eq("follower_id", viewerId)
                                .eq("target_id", id),
                              supabase
                                .from("follows")
                                .select("follower_id")
                                .eq("target_id", viewerId)
                                .eq("follower_id", id),
                            ]);
                            setYouFollowIds((prev) => {
                              const n = new Set(prev);
                              yf && yf.length ? n.add(id) : n.delete(id);
                              return n;
                            });
                            setFollowsYouIds((prev) => {
                              const n = new Set(prev);
                              fy && fy.length ? n.add(id) : n.delete(id);
                              return n;
                            });
                          })();
                        }}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* sentinel for infinite scroll */}
          <div ref={sentinelRef} />
          {loading && (
            <div className="px-3 py-3 text-center text-sm text-neutral-400">Loading…</div>
          )}
          {!hasMore && items.length > 0 && (
            <div className="px-3 py-3 text-center text-xs text-neutral-500">No more users</div>
          )}
        </div>
      </div>
    </div>
  );
}
