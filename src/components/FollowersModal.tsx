import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Link } from "react-router-dom";

type Row = {
  profile_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type Props = {
  open: boolean;
  mode: "followers" | "following";
  userId: string;           // profile.id of the page owner
  onClose: () => void;
};

const PAGE = 12;

export default function FollowersModal({ open, mode, userId, onClose }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRows([]);
    setPage(0);
    setHasMore(true);
  }, [open, mode, userId]);

  useEffect(() => {
    if (!open) return;
    loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function loadMore() {
    if (busy || !hasMore) return;
    setBusy(true);

    const from = page * PAGE;
    const to = from + PAGE - 1;

    const view = mode === "followers" ? "followers_list" : "following_list";
    const { data, error, count } = await supabase
      .from(view)
      .select("profile_id,username,display_name,avatar_url", { count: "exact" })
      .eq("user_id", userId)
      .order("username", { ascending: true, nullsFirst: true })
      .range(from, to);

    setBusy(false);
    if (error) return;

    const rowsIn = (data || []) as Row[];
    setRows((prev) => [...prev, ...rowsIn]);
    setPage((p) => p + 1);
    const total = typeof count === "number" ? count : from + rowsIn.length;
    setHasMore(from + rowsIn.length < total);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-black p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-semibold">
            {mode === "followers" ? "Followers" : "Following"}
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-900"
          >
            Close
          </button>
        </div>

        {rows.length === 0 && !hasMore && (
          <div className="px-2 py-6 text-sm text-neutral-400">No users yet.</div>
        )}

        <ul className="max-h-[55vh] overflow-auto">
          {rows.map((r) => (
            <li key={r.profile_id} className="group">
              <Link
                to={r.username ? `/u/${r.username}` : "#"}
                className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-neutral-900"
                onClick={onClose}
              >
                <img
                  src={r.avatar_url || "/brand/taedal-logo.svg"}
                  className="h-8 w-8 rounded-full object-cover"
                />
                <div className="min-w-0">
                  <div className="truncate">
                    {r.display_name || (r.username ? `@${r.username}` : "User")}
                  </div>
                  {r.username && (
                    <div className="truncate text-xs text-neutral-400">
                      @{r.username}
                    </div>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-3">
          <button
            disabled={!hasMore || busy}
            onClick={loadMore}
            className="w-full rounded-xl border border-neutral-700 px-3 py-2 text-sm disabled:opacity-60"
          >
            {busy ? "Loading…" : hasMore ? "Load more" : "No more"}
          </button>
        </div>
      </div>
    </div>
  );
}
