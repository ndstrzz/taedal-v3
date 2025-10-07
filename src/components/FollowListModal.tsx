import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Link } from "react-router-dom";

type Props = {
  open: boolean;
  userId: string;
  mode: "followers" | "following";
  onClose: () => void;
};

type Row = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

const PAGE = 20;

export default function FollowListModal({ open, userId, mode, onClose }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    if (!open) return;
    setRows([]);
    setPage(0);
    setHasMore(true);
  }, [open, userId, mode]);

  useEffect(() => {
    if (!open) return;
    loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function loadMore() {
    if (loading || !hasMore) return;
    setLoading(true);

    try {
      // 1) Try via views (followers_list/following_list) — our preferred path
      const viewName = mode === "followers" ? "followers_list" : "following_list";
      const from = page * PAGE;
      const to = from + PAGE - 1;

      let ok = false;
      try {
        const { data, error, count } = await supabase
          .from(viewName)
          .select("id,username,display_name,avatar_url", { count: "exact" })
          .eq("user_id", userId)
          .range(from, to);

        if (!error && data) {
          const batch = data as Row[];
          setRows((r) => [...r, ...batch]);
          setPage((p) => p + 1);
          const total = typeof count === "number" ? count : from + batch.length;
          setHasMore(from + batch.length < total);
          ok = true;
        }
      } catch {
        /* fall through to fallback */
      }

      if (!ok) {
        // 2) Fallback: two-step query against core tables (works regardless of views)
        //   followers  -> users who follow `userId`
        //   following  -> users whom `userId` follows
        const idColumn = mode === "followers" ? "follower_id" : "target_id";
        const whereColumn = mode === "followers" ? "target_id" : "follower_id";

        const { data: idRows } = await supabase
          .from("follows")
          .select(idColumn)
          .eq(whereColumn, userId);

        const ids = (idRows || []).map((r: any) => r[idColumn]) as string[];

        if (ids.length === 0) {
          setHasMore(false);
          setLoading(false);
          return;
        }

        // simple pagination on the ids array
        const slice = ids.slice(page * PAGE, page * PAGE + PAGE);
        const { data: users } = await supabase
          .from("profiles")
          .select("id,username,display_name,avatar_url")
          .in("id", slice);

        const batch = (users || []) as Row[];
        setRows((r) => [...r, ...batch]);
        setPage((p) => p + 1);
        setHasMore(page * PAGE + batch.length < ids.length);
      }
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950">
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div className="text-lg font-semibold">
            {mode === "followers" ? "Followers" : "Following"}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-900"
          >
            Close
          </button>
        </div>

        <div className="max-h-[60vh] overflow-auto p-2">
          {rows.length === 0 && !loading && (
            <div className="px-3 py-4 text-sm text-neutral-400">No users yet.</div>
          )}

          <ul className="divide-y divide-neutral-800">
            {rows.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-3 py-2">
                <img
                  src={u.avatar_url || "/brand/taedal-logo.svg"}
                  className="h-8 w-8 rounded-full object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">
                    {u.display_name || (u.username ? `@${u.username}` : "User")}
                  </div>
                  {u.username && (
                    <div className="truncate text-xs text-neutral-400">@{u.username}</div>
                  )}
                </div>
                {u.username && (
                  <Link
                    to={`/u/${encodeURIComponent(u.username)}`}
                    className="rounded-lg border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-900"
                    onClick={onClose}
                  >
                    View
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-neutral-800 p-3">
          <button
            onClick={loadMore}
            disabled={loading || !hasMore}
            className="w-full rounded-xl border border-neutral-700 px-4 py-2 text-sm disabled:opacity-60"
          >
            {loading ? "Loading…" : hasMore ? "Load more" : "No more"}
          </button>
        </div>
      </div>
    </div>
  );
}
