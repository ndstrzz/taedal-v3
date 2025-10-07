import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../state/AuthContext";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import useDebounce from "../hooks/useDebounce";

type MiniProfile = { username: string | null; avatar_url: string | null };
type SearchRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export default function NavBar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  // mini avatar (signed-in user)
  const [mini, setMini] = useState<MiniProfile | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return setMini(null);
      const { data } = await supabase
        .from("profiles")
        .select("username,avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (!cancelled) setMini((data as MiniProfile) || { username: null, avatar_url: null });
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const profileHref = user ? "/me" : "/login";

  // ---------- Search state ----------
  const [q, setQ] = useState("");
  const dq = useDebounce(q.trim(), 250);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [statusMsg, setStatusMsg] = useState("Idle");

  const boxRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const blurCloseTimer = useRef<number | null>(null);

  const listboxId = "nav-search-listbox";
  const inputId = "nav-search-input";

  // fetch results
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!dq) {
        setRows([]);
        setStatusMsg("Type to search");
        return;
      }
      setLoading(true);
      setStatusMsg("Searching…");

      const esc = dq.replace(/%/g, "\\%").replace(/_/g, "\\_");
      const { data, error } = await supabase
        .from("public_profiles")
        .select("id,username,display_name,avatar_url")
        .or(`username.ilike.${esc}%,display_name.ilike.%${esc}%`)
        .order("username", { ascending: true, nullsFirst: true })
        .limit(8);

      if (!cancelled) {
        setLoading(false);
        const list = error ? [] : ((data as SearchRow[]) || []);
        setRows(list);
        setActive(0);
        setStatusMsg(list.length ? `${list.length} result${list.length > 1 ? "s" : ""}` : "No matches");
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [dq]);

  // open/close behavior
  useEffect(() => setOpen(Boolean(q)), [q]);

  // click outside to dismiss
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  // ensure active option is scrolled into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function gotoProfile(u?: string | null) {
    if (!u) return;
    setOpen(false);
    setQ("");
    navigate(`/u/${encodeURIComponent(u)}`); // /u/ route
  }

  function clearSearch() {
    setQ("");
    setRows([]);
    setActive(0);
    setOpen(false);
    setStatusMsg("Cleared");
    inputRef.current?.focus();
  }

  // keyboard handling for combobox
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === "ArrowDown" && rows.length > 0) {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }
    const lastIndex = Math.max(rows.length - 1, 0);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, lastIndex));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(lastIndex);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = rows[active];
      if (pick?.username) gotoProfile(pick.username);
    } else if (e.key === "Escape") {
      setOpen(false);
      (e.target as HTMLInputElement).blur();
    }
  }

  // prevent close when clicking an item (blur fires before click)
  function onInputBlur() {
    blurCloseTimer.current = window.setTimeout(() => {
      setOpen(false);
    }, 120);
  }
  function cancelBlurClose() {
    if (blurCloseTimer.current) {
      window.clearTimeout(blurCloseTimer.current);
      blurCloseTimer.current = null;
    }
  }

  const hasResults = rows.length > 0;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-neutral-800 bg-black/70 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <Link to="/" className="flex items-center gap-2">
          <img src="/brand/taedal-logo.svg" className="h-6 w-6" alt="" />
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

        {/* Search */}
        <div ref={boxRef} className="relative mx-3 hidden w-full max-w-sm md:block">
          <div className="relative">
            <input
              id={inputId}
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => q && setOpen(true)}
              onKeyDown={onKeyDown}
              onBlur={onInputBlur}
              placeholder="Search users…"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 pr-8 text-sm outline-none focus:border-neutral-500"
              aria-label="Search users"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={listboxId}
              aria-activedescendant={open && hasResults ? `nav-opt-${active}` : undefined}
            />
            {!!q && (
              <button
                type="button"
                onMouseDown={cancelBlurClose}
                onClick={clearSearch}
                className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-md text-neutral-400 hover:bg-neutral-800"
                aria-label="Clear search"
                title="Clear"
              >
                ×
              </button>
            )}
          </div>

          {/* ARIA live region for status updates */}
          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {statusMsg}
          </div>

          {open && (
            <div
              className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 shadow-lg"
              onMouseDown={cancelBlurClose}
              onMouseUp={() => inputRef.current?.focus()}
            >
              {!loading && !hasResults && dq && (
                <div className="px-3 py-2 text-sm text-neutral-400">No matches</div>
              )}
              {loading && <div className="px-3 py-2 text-sm text-neutral-400">Searching…</div>}
              {hasResults && (
                <ul
                  id={listboxId}
                  role="listbox"
                  aria-labelledby={inputId}
                  className="max-h-80 overflow-auto py-1"
                  ref={listRef}
                >
                  {rows.map((r, i) => {
                    const isActive = i === active;
                    return (
                      <li
                        id={`nav-opt-${i}`}
                        data-index={i}
                        role="option"
                        aria-selected={isActive}
                        key={r.id}
                        className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-neutral-900 ${
                          isActive ? "bg-neutral-900" : ""
                        }`}
                        onMouseEnter={() => setActive(i)}
                        onMouseDown={(e) => e.preventDefault()} // avoid blurring input before click
                        onClick={() => gotoProfile(r.username || undefined)}
                      >
                        <img
                          src={r.avatar_url || "/brand/taedal-logo.svg"}
                          className="h-6 w-6 rounded-full object-cover"
                          alt=""
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
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Right side */}
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
                  alt=""
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
