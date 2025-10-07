import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useToast } from "../components/Toaster";
import { useAuth } from "../state/AuthContext";
// add import
import FollowButton from "../components/FollowButton";


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

export default function PublicProfile() {
  const { handle = "" } = useParams();
  const username = handle.replace(/^@/, "");
  const { toast } = useToast();
  const { user } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const [counts, setCounts] = useState<Counts>({ posts: 0, followers: 0, following: 0 });

  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [isFollowing, setIsFollowing] = useState<boolean>(false);
  const [followBusy, setFollowBusy] = useState(false);

  // Load profile by @username
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
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
    return () => {
      cancelled = true;
    };
  }, [username]);

  // Counts from the view
  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data } = await supabase
        .from("profile_counts")
        .select("posts,followers,following")
        .eq("user_id", profile.id)
        .maybeSingle();
      setCounts({
        posts: data?.posts ?? 0,
        followers: data?.followers ?? 0,
        following: data?.following ?? 0,
      });
    })();
  }, [profile]);

  // Initial follow state
  useEffect(() => {
    if (!user || !profile || user.id === profile.id) {
      setIsFollowing(false);
      return;
    }
    (async () => {
      const { count } = await supabase
        .from("follows")
        .select("follower_id", { count: "exact", head: true })
        .eq("follower_id", user.id)
        .eq("target_id", profile.id);
      setIsFollowing((count ?? 0) > 0);
    })();
  }, [user, profile]);

  // Toggle follow/unfollow
  async function toggleFollow() {
    if (!user || !profile || user.id === profile.id || followBusy) return;
    setFollowBusy(true);

    const prevFollowing = isFollowing;
    // optimistic bump
    setIsFollowing(!prevFollowing);
    setCounts((c) => ({ ...c, followers: c.followers + (prevFollowing ? -1 : 1) }));

    try {
      if (prevFollowing) {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", user.id)
          .eq("target_id", profile.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("follows")
          .insert({ follower_id: user.id, target_id: profile.id });
        if (error) throw error;
      }

      // sanity refresh from the view
      const { data } = await supabase
        .from("profile_counts")
        .select("posts,followers,following")
        .eq("user_id", profile.id)
        .maybeSingle();
      setCounts({
        posts: data?.posts ?? 0,
        followers: data?.followers ?? 0,
        following: data?.following ?? 0,
      });
    } catch (e: any) {
      // undo optimistic on error
      setIsFollowing(prevFollowing);
      setCounts((c) => ({ ...c, followers: c.followers + (prevFollowing ? 1 : -1) }));
      toast({
        variant: "error",
        title: "Follow action failed",
        description: e?.message || String(e),
      });
    } finally {
      setFollowBusy(false);
    }
  }

  // Artworks pagination
  async function loadMore() {
    if (!profile || loadingMore) return;
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

    setLoadingMore(false);
    if (error) {
      toast({ variant: "error", title: "Couldn’t load artworks", description: error.message });
      return;
    }
    const rows = (data || []) as Artwork[];
    setArtworks((prev) => [...prev, ...rows]);
    setPage((p) => p + 1);
    const total = typeof count === "number" ? count : 0;
    setHasMore(from + rows.length < total);
  }

  // Reset grid on profile change & grab first page
  useEffect(() => {
    setArtworks([]);
    setPage(0);
    setHasMore(true);
    if (profile) loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const displayName = useMemo(
    () => profile?.display_name || (profile?.username ? `@${profile.username}` : "Artist"),
    [profile]
  );

  if (loading) {
    return <div className="p-8 text-neutral-400">Loading profile…</div>;
  }

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

  const showFollow = !!user && user.id !== profile.id;

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
            {profile.bio && <p className="mt-2 max-w-3xl text-neutral-300">{profile.bio}</p>}
          </div>

          {showFollow && (
  <FollowButton
    targetId={profile.id}
    onToggled={async () => {
      // refresh counts from the view after each toggle
      const { data } = await supabase
        .from("profile_counts")
        .select("posts,followers,following")
        .eq("user_id", profile.id)
        .maybeSingle();
      setCounts({
        posts: data?.posts ?? 0,
        followers: data?.followers ?? 0,
        following: data?.following ?? 0,
      });
    }}
    className="mb-2"
  />
)}

        </div>

        {/* Stats */}
        <div className="mt-6 flex gap-6 text-sm">
          <div>
            <span className="font-semibold">{counts.posts}</span> posts
          </div>
          <div>
            <span className="font-semibold">{counts.followers}</span> followers
          </div>
          <div>
            <span className="font-semibold">{counts.following}</span> following
          </div>
        </div>
      </div>

      {/* Artworks grid */}
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h2 className="mb-4 text-lg font-semibold">Artworks</h2>

        {artworks.length === 0 && !hasMore && (
          <div className="text-neutral-400">No published artworks yet.</div>
        )}

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
      </div>
    </div>
  );
}
