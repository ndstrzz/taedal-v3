import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../state/AuthContext";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import useDebounce from "../hooks/useDebounce";

type MiniProfile = {
  username: string | null;
  avatar_url: string | null;
};

type SearchRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export default function NavBar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  // ----- mini avatar in the nav
  const [mini, setMini] = useState<MiniProfile | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        setMini(null);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("username,avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (!cancelled) {
        setMini((data as MiniProfile) || { username: null, avatar_url: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Always go to /me for your own profile
  const profileHref = user ? "/me" : "/login";

  // ----- search state
  const [q, setQ] = useState("");
  const dq = useDebounce(q.trim(), 250);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  const boxRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // fetch results (from the VIEW)
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!dq) {
        setRows([]);
        return;
      }
      setLoading(true);

      // escape % and _ for ILIKE
      const esc = dq.replace(/%/g, "\\%").replace(/_/g, "\\_");

      const { data, error } = await supabase
        .from("public_profiles") // 👈 use the view
        .select("id,username,display_name,avatar_url")
        .or(
          `username.ilike.${esc}%` + // starts-with username
          `,display_name.ilike.%${esc}%` // contains display name
        )
        .order("username", { ascending: true, nullsFirst: true })
        .limit(8);

      if (!cancelled) {
        setLoading(false);
        setRows(error ? [] : ((data as SearchRow[]) || []));
        setActive(0);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [dq]);

  // open dropdown whenever there’s a query
  useEffect(() => {
    setOpen(Boolean(q));
  }, [q]);

  // close on click outside
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function gotoProfile(u?: string | null) {
    if (!u) return;
    setOpen(false);
    setQ("");
    navigate(`/@${u}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(rows.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = rows[active];
      if (pick?.username) gotoProfile(pick.username);
    } else if (e.key === "Escape") {
      setOpen(false);
      (e.target as HTMLInputElement).blur();
    }
  }

  const hasResults = rows.length > 0;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-neutral-800 bg-black/70 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <Link to="/" className="flex items-center gap-2">
          <img src="/brand/taedal-logo.svg" className="h-6 w-6" />
          <span className="font-semibold">taedal</span>
        </Link>

        <nav className="ml-6 hidden gap-4 md:flex">
          <NavLink to="/community" className="text-sm text-neutral-300 hover:text-white">
            Community
          </NavLink>
          <NavLink to="/portfolio" className="text-sm text-neutral-300 hover:text-white">
            Portfolio
          </NavLink>
          <NavLink
            to="/create"
            className="rounded-lg border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-900"
          >
            Create
          </NavLink>
        </nav>

        {/* --- Search --- */}
        <div ref={boxRef} className="relative mx-3 hidden w-full max-w-sm md:block">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => q && setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Search users…"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
            aria-label="Search users"
          />
          {open && (
            <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 shadow-lg">
              {!loading && !hasResults && dq && (
                <div className="px-3 py-2 text-sm text-neutral-400">No matches</div>
              )}
              {loading && (
                <div className="px-3 py-2 text-sm text-neutral-400">Searching…</div>
              )}
              {hasResults && (
                <ul className="max-h-80 overflow-auto py-1">
                  {rows.map((r, i) => (
                    <li
                      key={r.id}
                      className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-neutral-900 ${
                        i === active ? "bg-neutral-900" : ""
                      }`}
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => gotoProfile(r.username || undefined)}
                    >
                      <img
                        src={r.avatar_url || "/brand/taedal-logo.svg"}
                        className="h-6 w-6 rounded-full object-cover"
                      />
                      <div className="min-w-0">
                        <div className="truncate">
                          {r.display_name || (r.username ? `@${r.username}` : "User")}
                        </div>
                        {r.username && (
                          <div className="truncate text-xs text-neutral-400">@{r.username}</div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* --- Right side --- */}
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <Link
                to={profileHref}
                className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-neutral-900"
                title="Profile"
              >
                <img
                  src={mini?.avatar_url || "/brand/taedal-logo.svg"}
                  className="h-6 w-6 rounded-full object-cover"
                />
                <span className="hidden sm:inline">Profile</span>
              </Link>
              <button
                onClick={() => signOut()}
                className="rounded-lg px-2 py-1 text-sm text-neutral-300 hover:bg-neutral-900"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="rounded-lg px-2 py-1 text-sm hover:bg-neutral-900">
                Log in
              </Link>
              <Link
                to="/signup"
                className="rounded-lg border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-900"
              >
                Sign up
              </Link>
            </>
          )}
          <Link
            to="/connect"
            className="rounded-lg border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-900"
          >
            Connect Wallet
          </Link>
        </div>
      </div>
    </header>
  );
}
