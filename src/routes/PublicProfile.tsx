import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useToast } from "../components/Toaster";
import { useAuth } from "../state/AuthContext";

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

const PAGE_SIZE = 12;
const ipfs = (cid?: string | null) => (cid ? `https://ipfs.io/ipfs/${cid}` : "");

export default function PublicProfile() {
  const { handle = "" } = useParams();
  const username = handle.replace(/^@/, "");
  const { toast } = useToast();
  const { user } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const [posts, setPosts] = useState(0);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);

  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  // Fetch profile by username
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("id,username,display_name,bio,avatar_url,cover_url")
        .eq("username", username)
        .maybeSingle();

      if (cancelled) return;
      if (error || !data) {
        setProfile(null);
        setLoading(false);
        return;
      }
      setProfile(data as Profile);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [username]);

  // counts
  useEffect(() => {
    if (!profile) return;
    (async () => {
      const [{ count: postsCount }, { count: followersCount }, { count: followingCount }] =
        await Promise.all([
          supabase
            .from("artworks")
            .select("id", { count: "exact", head: true })
            .eq("owner", profile.id)
            .eq("status", "published"),
          supabase
            .from("follows")
            .select("follower_id", { count: "exact", head: true })
            .eq("target_id", profile.id),
          supabase
            .from("follows")
            .select("target_id", { count: "exact", head: true })
            .eq("follower_id", profile.id),
        ]);
      if (!alive.current) return;
      setPosts(postsCount ?? 0);
      setFollowers(followersCount ?? 0);
      setFollowing(followingCount ?? 0);
    })();
  }, [profile]);

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
    if (error) {
      toast({ variant: "error", title: "Couldn’t load artworks", description: error.message });
      setLoadingMore(false);
      return;
    }
    const rows = (data || []) as Artwork[];
    setArtworks((prev) => [...prev, ...rows]);
    setPage((p) => p + 1);
    const total = typeof count === "number" ? count : 0;
    setHasMore(from + rows.length < total);
    setLoadingMore(false);
  }

  // reset grid when profile changes
  useEffect(() => {
    setArtworks([]);
    setPage(0);
    setHasMore(true);
  }, [profile?.id]);

  // first page
  useEffect(() => {
    if (profile) loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const displayName = useMemo(
    () => profile?.display_name || (profile?.username ? `@${profile.username}` : "Artist"),
    [profile]
  );

  if (loading) return <div className="p-8 text-neutral-400">Loading profile…</div>;

  if (!profile) {
    return (
      <div className="p-8">
        <div className="mb-2 text-neutral-400">Profile “@{username}” not found.</div>
        {user && (
          <Link
            to="/settings"
            className="rounded-xl border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-900"
          >
            Go to settings to set your username
          </Link>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Cover */}
      <div className="h-48 w-full bg-neutral-900">
        {profile.cover_url && (
          <img src={profile.cover_url} alt="" className="h-48 w-full object-cover" loading="lazy" />
        )}
      </div>

      {/* Header */}
      <div className="mx-auto -mt-12 max-w-6xl px-4">
        <div className="flex items-end gap-4">
          <img
            src={profile.avatar_url || "/brand/taedal-logo.svg"}
            alt={displayName}
            className="h-24 w-24 rounded-full border-4 border-neutral-950 object-cover"
          />
          <div className="flex-1 pb-2">
            <h1 className="text-2xl font-semibold">{displayName}</h1>
            {profile.username && <div className="text-sm text-neutral-400">@{profile.username}</div>}
            {profile.bio && <p className="mt-2 max-w-2xl text-neutral-300">{profile.bio}</p>}
          </div>
        </div>

        {/* Stats */}
        <div className="mt-6 flex gap-6 text-sm">
          <div><span className="font-semibold">{posts}</span> posts</div>
          <div><span className="font-semibold">{followers}</span> followers</div>
          <div><span className="font-semibold">{following}</span> following</div>
        </div>
      </div>

      {/* Artworks grid */}
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
