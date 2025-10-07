import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

type UserRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

function useDebounce<T>(val: T, ms = 250) {
  const [out, setOut] = useState(val);
  useEffect(() => {
    const t = setTimeout(() => setOut(val), ms);
    return () => clearTimeout(t);
  }, [val, ms]);
  return out;
}

export default function SearchUsers() {
  const [q, setQ] = useState("");
  const dq = useDebounce(q.trim(), 200);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<UserRow[]>([]);
  const nav = useNavigate();
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Query — use the public view if you created it; falls back to profiles
  // Prefer starts-with on username; also fuzzy on display_name
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!dq) {
        setRows([]);
        return;
      }
      setLoading(true);
      // normalize: allow typing "@name"
      const needle = dq.replace(/^@/, "");
      try {
        // If you have a public view named "public_profiles", use that table name below.
        // Otherwise, "profiles" is fine as long as RLS allows SELECT.
        const { data, error } = await supabase
          .from("public_profiles") // ← swap to "profiles" if you don’t have the view
          .select("id,username,display_name,avatar_url")
          .or(
            [
              `username.ilike.${needle}%`,        // username starts with
              `display_name.ilike.%${needle}%`,   // display name contains
            ].join(",")
          )
          .order("username", { ascending: true })
          .limit(8);

        if (cancelled) return;
        if (error) {
          setRows([]);
        } else {
          setRows((data as UserRow[]) || []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dq]);

  const showNoMatch = useMemo(
    () => dq.length > 0 && !loading && rows.length === 0,
    [dq, loading, rows.length]
  );

  function go(u: UserRow) {
    if (!u?.username) return;
    setOpen(false);
    setQ("");
    nav(`/@${u.username}`);
  }

  return (
    <div ref={wrapRef} className="relative w-full max-w-md">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search users…"
        className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        aria-label="Search users"
      />

      {open && (loading || rows.length > 0 || showNoMatch) && (
        <div className="absolute left-0 right-0 mt-1 rounded-lg border border-neutral-800 bg-black shadow-lg">
          {loading && (
            <div className="px-3 py-2 text-sm text-neutral-400">Searching…</div>
          )}

          {!loading && rows.length > 0 && (
            <ul className="max-h-72 overflow-auto py-1">
              {rows.map((u) => (
                <li
                  key={u.id}
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-neutral-900"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => go(u)}
                >
                  <img
                    src={u.avatar_url || "/brand/taedal-logo.svg"}
                    className="h-6 w-6 rounded-full object-cover"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm">
                      {u.display_name || (u.username ? `@${u.username}` : "User")}
                    </div>
                    {u.username && (
                      <div className="truncate text-xs text-neutral-400">@{u.username}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {!loading && showNoMatch && (
            <div className="px-3 py-2 text-sm text-neutral-400">No matches</div>
          )}
        </div>
      )}
    </div>
  );
}
