import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Mode = "followers" | "following";

type Row = {
  id: string; // profile id
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

const PAGE = 24;

function useBodyLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [locked]);
}

export default function FollowListModal({
  open,
  onClose,
  userId,
  mode,
  title,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  mode: Mode;
  title?: string;
}) {
  useBodyLock(open);

  const heading = useMemo(
    () => title ?? (mode === "followers" ? "Followers" : "Following"),
    [mode, title]
  );

  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  // reset list whenever user/ mode / open changes
  useEffect(() => {
    if (!open) return;
    setRows([]);
    setPage(0);
    setHasMore(true);
  }, [open, userId, mode]);

  useEffect(() => {
    if (!open) return;
    void loadMore(); // first page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId, mode]);

  async function loadMore() {
    if (!hasMore || loading) return;
    setLoading(true);

    const from = page * PAGE;
    const to = from + PAGE - 1;

    if (mode === "followers") {
      // people who follow this user
      const { data, error, count } = await supabase
        .from("follows")
        .select(
          "follower_id, profile:profiles!follower_id(id,username,display_name,avatar_url)",
          { count: "exact" }
        )
        .eq("target_id", userId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (!error) {
        const mapped: Row[] = (data || []).map((r: any) => ({
          id: r?.profile?.id ?? r?.follower_id,
          username: r?.profile?.username ?? null,
          display_name: r?.profile?.display_name ?? null,
          avatar_url: r?.profile?.avatar_url ?? null,
        }));
        setRows((prev) => [...prev, ...mapped]);
        const total = typeof count === "number" ? count : 0;
        setHasMore(from + mapped.length < total);
        setPage((p) => p + 1);
      }
    } else {
      // people this user follows
      const { data, error, count } = await supabase
        .from("follows")
        .select(
          "target_id, profile:profiles!target_id(id,username,display_name,avatar_url)",
          { count: "exact" }
        )
        .eq("follower_id", userId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (!error) {
        const mapped: Row[] = (data || []).map((r: any) => ({
          id: r?.profile?.id ?? r?.target_id,
          username: r?.profile?.username ?? null,
          display_name: r?.profile?.display_name ?? null,
          avatar_url: r?.profile?.avatar_url ?? null,
        }));
        setRows((prev) => [...prev, ...mapped]);
        const total = typeof count === "number" ? count : 0;
        setHasMore(from + mapped.length < total);
        setPage((p) => p + 1);
      }
    }

    setLoading(false);
  }

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal>
      <div
        className="mx-auto mt-20 w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{heading}</h2>
          <button
            onClick={onClose}
            className="rounded-lg border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-900"
          >
            Close
          </button>
        </div>

        {rows.length === 0 && !loading && (
          <div className="px-2 py-8 text-sm text-neutral-400">No users yet.</div>
        )}

        <ul className="max-h-[60vh] overflow-auto">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-neutral-900">
              <img
                src={r.avatar_url || "/brand/taedal-logo.svg"}
                className="h-8 w-8 rounded-full object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{r.display_name || (r.username ? `@${r.username}` : "User")}</div>
                {r.username && <div className="truncate text-xs text-neutral-400">@{r.username}</div>}
              </div>
              {r.username && (
                <Link
                  to={`/@${encodeURIComponent(r.username)}`}
                  className="rounded-lg border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-900"
                  onClick={onClose}
                >
                  View
                </Link>
              )}
            </li>
          ))}

          {hasMore && (
            <li className="px-2 py-3">
              <button
                disabled={loading}
                onClick={loadMore}
                className="w-full rounded-lg border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-900 disabled:opacity-60"
              >
                {loading ? "Loading…" : "Load more"}
              </button>
            </li>
          )}
        </ul>
      </div>
    </div>,
    document.body
  );
}
