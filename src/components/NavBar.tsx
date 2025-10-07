// src/components/NavBar.tsx
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../state/AuthContext";
import { supabase } from "../lib/supabase";

type MiniProfile = {
  username: string | null;
  avatar_url: string | null;
};

export default function NavBar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [mini, setMini] = useState<MiniProfile | null>(null);

  // Fetch mini profile for current user
  useEffect(() => {
    let cancelled = false;

    async function fetchMini() {
      if (!user) {
        setMini(null);
        return;
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("username, avatar_url")
        .eq("id", user.id)
        .maybeSingle();

      if (!cancelled) {
        if (error) {
          // keep last known mini if fetch fails
          console.warn("[NavBar] profiles fetch error:", error.message);
        }
        setMini((data as MiniProfile) || { username: null, avatar_url: null });
      }
    }

    fetchMini();

    // Realtime subscription to reflect avatar/username changes instantly
    let channel: ReturnType<typeof supabase.channel> | null = null;
    if (user) {
      channel = supabase
        .channel(`navbar_profile_${user.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
          (payload) => {
            const row = (payload.new as any) || (payload.old as any) || {};
            // Use new values when available, else keep current
            setMini((prev) => ({
              username: row.username ?? prev?.username ?? null,
              avatar_url: row.avatar_url ?? prev?.avatar_url ?? null,
            }));
          }
        )
        .subscribe((status) => {
          // optional: debug
          // console.log("[NavBar] realtime status:", status);
        });
    }

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [user]);

  const profileHref = mini?.username ? `/@${mini.username}` : "/me";

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
                onClick={() => signOut().then(() => navigate("/", { replace: true }))}
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
