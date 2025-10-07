// src/components/NavBar.tsx
import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../state/AuthContext";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type MiniProfile = {
  username: string | null;
  avatar_url: string | null;
};

export default function NavBar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mini, setMini] = useState<MiniProfile | null>(null);
  const [loadingMini, setLoadingMini] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!user) {
        setMini(null);
        return;
      }
      setLoadingMini(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("username,avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (!cancelled) {
        if (error) {
          // stay quiet in UI; just clear mini state
          setMini({ username: null, avatar_url: null });
        } else {
          setMini((data as MiniProfile) || { username: null, avatar_url: null });
        }
        setLoadingMini(false);
      }
    })();

    // If you want this to refresh when the user edits their profile elsewhere,
    // we can also re-fetch when the route changes:
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, location.key]);

  // Use /me smart redirect — it will send users to /@username or /settings.
  const profileHref = "/me";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-neutral-800 bg-black/70 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <img src="/brand/taedal-logo.svg" className="h-6 w-6" alt="taedal" />
          <span className="font-semibold">taedal</span>
        </Link>

        {/* Primary nav */}
        <nav className="ml-6 hidden gap-4 md:flex">
          <NavLink
            to="/community"
            className={({ isActive }) =>
              `text-sm ${isActive ? "text-white" : "text-neutral-300 hover:text-white"}`
            }
          >
            Community
          </NavLink>
          <NavLink
            to="/portfolio"
            className={({ isActive }) =>
              `text-sm ${isActive ? "text-white" : "text-neutral-300 hover:text-white"}`
            }
          >
            Portfolio
          </NavLink>
          <NavLink
            to="/create"
            className={({ isActive }) =>
              `rounded-lg border border-neutral-700 px-2 py-1 text-sm ${
                isActive ? "bg-neutral-900" : "hover:bg-neutral-900"
              }`
            }
          >
            Create
          </NavLink>
        </nav>

        {/* Right side controls */}
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <Link
                to={profileHref}
                className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-neutral-900"
                title="Profile"
              >
                <img
                  src={
                    loadingMini
                      ? "/brand/taedal-logo.svg"
                      : mini?.avatar_url || "/brand/taedal-logo.svg"
                  }
                  alt="avatar"
                  className="h-6 w-6 rounded-full object-cover"
                />
                <span className="hidden sm:inline">Profile</span>
              </Link>

              <button
                onClick={() =>
                  signOut().then(() => navigate("/", { replace: true }))
                }
                className="rounded-lg px-2 py-1 text-sm text-neutral-300 hover:bg-neutral-900"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="rounded-lg px-2 py-1 text-sm hover:bg-neutral-900"
              >
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
