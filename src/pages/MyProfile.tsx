import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../state/AuthContext";
import { supabase } from "../lib/supabase";

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
};

type Artwork = {
  id: string;
  title: string | null;
  cover_url: string | null;
  image_cid: string | null;
  created_at: string;
};

type Counts = { posts: number; followers: number; following: number };

const PAGE_SIZE = 12;
const ipfs = (cid?: string | null) => (cid ? `https://ipfs.io/ipfs/${cid}` : "");

export default function MyProfile() {
  const { user } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [counts, setCounts] = useState<Counts>({ posts: 0, followers: 0, following: 0 });
  const [loadingCounts, setLoadingCounts] = useState(false);

  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // Load profile
  useEffect(() => {
    (async () => {
      if (!user) return;
      setLoadingProfile(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("id,username,display_name,bio,avatar_url,cover_url")
        .eq("id", user.id)
        .maybeSingle();
      if (!alive.current) return;
      setLoadingProfile(false);
      if (error || !data) return;
      setProfile(data as Profile);
    })();
  }, [user]);

  // Load counts from the view
  useEffect(() => {
    if (!profile) return;
    (async () => {
      setLoadingCounts(true);
      const { data, error } = await supabase
        .from("profile_counts")
        .select("posts,followers,following")
        .eq("user_id", profile.id)
        .maybeSingle();
      if (!alive.current) return;
      setLoadingCounts(false);
      if (error) return;
      setCounts({
        posts: data?.posts ?? 0,
        followers: data?.followers ?? 0,
        following: data?.following ?? 0,
      });
    })();
  }, [profile]);

  // Grid loader
  async function loadMore() {
    if (!profile || loadingMore || !hasMore) return;
    setLoadingMore(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error, count } = await supabase
      .from("artworks")
      .select("id,title,cover_url,image_cid,created_at", { count: "exact" })
      .eq("owner", profile.id)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (!alive.current) return;
    setLoadingMore(false);
    if (error) return;

    const rows = (data || []) as Artwork[];
    setArtworks((prev) => [...prev, ...rows]);
    setPage((p) => p + 1);
    const total = typeof count === "number" ? count : 0;
    setHasMore(from + rows.length < total);
  }

  // Reset grid on profile change
  useEffect(() => {
    setArtworks([]);
    setPage(0);
    setHasMore(true);
    if (profile) loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const displayName = useMemo(
    () => profile?.display_name || (profile?.username ? `@${profile.username}` : "You"),
    [profile]
  );

  if (!user) {
    return (
      <div className="p-8">
        <p className="mb-4 text-neutral-300">Please log in to view your profile.</p>
        <Link to="/login" className="underline">Go to log in</Link>
      </div>
    );
  }

  if (loadingProfile) return <div className="p-8 text-neutral-400">Loading profile…</div>;

  if (!profile) {
    return (
      <div className="p-8">
        <p className="mb-4 text-neutral-300">You don’t have a profile yet. Set it up now.</p>
        <Link to="/settings" className="rounded-xl border border-neutral-700 px-4 py-2 text-sm">
          Edit profile
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Cover */}
      <div className="h-48 w-full bg-neutral-900">
        {profile.cover_url && (
          <img src={profile.cover_url} alt="" className="h-48 w-full object-cover" />
        )}
      </div>

      {/* Header */}
      <div className="mx-auto max-w-6xl px-4 -mt-12">
        <div className="flex items-end gap-4">
          <img
            src={profile.avatar_url || "/brand/taedal-logo.svg"}
            alt={displayName}
            className="h-24 w-24 rounded-full border-4 border-neutral-950 object-cover"
          />
          <div className="flex-1 pb-2">
            <div className="text-2xl font-semibold">{displayName}</div>
            {profile.username && (
              <div className="text-sm text-neutral-400">@{profile.username}</div>
            )}
            {profile.bio && <p className="mt-2 max-w-2xl text-neutral-300">{profile.bio}</p>}
          </div>

          <Link
            to="/settings"
            className="mb-2 rounded-xl border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-900"
          >
            Edit profile
          </Link>
        </div>

        {/* Stats */}
        <div className="mt-6 flex gap-6 text-sm">
          <div><span className="font-semibold">{counts.posts}</span> posts</div>
          <div><span className="font-semibold">{counts.followers}</span> followers</div>
          <div><span className="font-semibold">{counts.following}</span> following</div>
          {loadingCounts && <div className="text-neutral-500">updating…</div>}
        </div>
      </div>

      {/* Artworks */}
      <div className="mx-auto max-w-6xl px-4 py-8">
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {artworks.map((a) => {
            const img = a.cover_url || ipfs(a.image_cid);
            return (
              <li key={a.id} className="group">
                <Link to={`/a/${a.id}`}>
                  <div className="aspect-square w-full overflow-hidden rounded-2xl bg-neutral-900">
                    {img ? (
                      <img
                        src={img}
                        alt={a.title ?? ""}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-sm text-neutral-500">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="mt-2 truncate text-sm text-neutral-200">
                    {a.title || "Untitled"}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>

        {hasMore && (
          <div className="mt-6">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="rounded-xl border border-neutral-700 px-4 py-2 text-sm disabled:opacity-60"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        )}

        {!hasMore && artworks.length === 0 && (
          <div className="text-neutral-400">No published artworks yet.</div>
        )}
      </div>
    </div>
  );
}
