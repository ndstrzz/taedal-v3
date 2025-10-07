import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useToast } from "../components/Toaster";
import { useAuth } from "../state/AuthContext";
import FollowButton from "../components/FollowButton";
import FollowListModal from "../components/FollowListModal";
import LikesGrid from "../components/LikesGrid";
import { updateSEO } from "../lib/seo";

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
  const params = useParams();
  const username = ((params.username as string) || (params.handle as string) || "").replace(/^@/, "");

  const { toast } = useToast();
  const { user } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Counts>({ posts: 0, followers: 0, following: 0 });

  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [showModal, setShowModal] = useState<null | "followers" | "following">(null);

  // Load profile by username (hardened)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setProfile(null);

      if (!username) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("id,username,display_name,bio,avatar_url,cover_url")
        .eq("username", username)
        .maybeSingle();

      if (cancelled) return;
      setLoading(false);

      if (error) {
        toast({ variant: "error", title: "Couldn’t load profile", description: error.message });
        return;
      }
      if (!data) {
        setProfile(null);
        return;
      }
      setProfile(data as Profile);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  // Counts
  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data, error } = await supabase
        .from("profile_counts")
        .select("posts,followers,following")
        .eq("user_id", profile.id)
        .maybeSingle();
      if (!error) {
        setCounts({
          posts: data?.posts ?? 0,
          followers: data?.followers ?? 0,
          following: data?.following ?? 0,
        });
      }
    })();
  }, [profile]);

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

  // Reset on profile change
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

  // SEO — update once profile is known
  useEffect(() => {
    if (!profile) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    updateSEO({
      title: `${displayName} | taedal`,
      description: profile.bio || `${displayName} on taedal`,
      image: profile.cover_url || profile.avatar_url || `${origin}/brand/og-default.jpg`,
      url: `${origin}/u/${encodeURIComponent(profile.username || "")}`,
      type: "profile",
    });
  }, [profile, displayName]);

  if (loading) {
    // Skeleton header
    return (
      <div>
        <div className="h-48 w-full bg-neutral-900" />
        <div className="mx-auto -mt-12 max-w-6xl px-4">
          <div className="flex items-end gap-4">
            <div className="h-24 w-24 rounded-full border-4 border-neutral-950 bg-neutral-800" />
            <div className="flex-1 pb-2">
              <div className="mb-2 h-6 w-48 animate-pulse rounded bg-neutral-800" />
              <div className="h-4 w-32 animate-pulse rounded bg-neutral-800" />
              <div className="mt-3 h-4 w-2/3 animate-pulse rounded bg-neutral-800" />
            </div>
            <div className="mb-2 h-9 w-28 animate-pulse rounded bg-neutral-800" />
          </div>
          <div className="mt-6 h-5 w-64 animate-pulse rounded bg-neutral-800" />
        </div>
      </div>
    );
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
  const cover = profile.cover_url;

  return (
    <div>
      {/* Cover (fallback tint if none) */}
      <div className={`h-48 w-full ${cover ? "" : "bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neutral-900 via-neutral-900 to-neutral-950"}`}>
        {cover && (
          <img src={cover} alt="" className="h-48 w-full object-cover" loading="lazy" />
        )}
      </div>

      {/* Header */}
      <div className="mx-auto -mt-12 max-w-6xl px-4">
        <div className="flex items-end gap-4">
          <img
            src={profile.avatar_url || "/brand/taedal-logo.svg"}
            alt={displayName}
            className="h-24 w-24 rounded-full border-4 border-neutral-950 object-cover bg-neutral-900"
          />
          <div className="flex-1 pb-2">
            <h1 className="text-2xl font-semibold">{displayName}</h1>
            {profile.username && <div className="text-sm text-neutral-400">@{profile.username}</div>}
            {profile.bio && (
              <p className="mt-2 max-w-3xl text-neutral-300 line-clamp-3">{profile.bio}</p>
            )}
          </div>

          {showFollow && (
            <FollowButton
              targetId={profile.id}
              onToggled={async () => {
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
          <button className="text-left hover:underline focus:outline-none focus:ring focus:ring-border rounded" onClick={() => setShowModal("followers")}>
            <span className="font-semibold">{counts.followers}</span> followers
          </button>
          <button className="text-left hover:underline focus:outline-none focus:ring focus:ring-border rounded" onClick={() => setShowModal("following")}>
            <span className="font-semibold">{counts.following}</span> following
          </button>
        </div>
      </div>

      {/* Followers/Following modal */}
      {profile && showModal && (
        <FollowListModal
          open
          userId={profile.id}
          ownerUsername={profile.username || null}
          mode={showModal}
          onClose={() => setShowModal(null)}
        />
      )}

      {/* Artworks grid */}
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h2 className="mb-4 text-lg font-semibold">Artworks</h2>

        {artworks.length === 0 && !hasMore && (
          <div className="rounded-xl border border-neutral-800 p-6 text-neutral-300">
            <div className="mb-2">No published artworks yet.</div>
            {user?.id === profile.id && (
              <Link to="/create" className="underline">Upload your first artwork</Link>
            )}
          </div>
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
              className="rounded-xl border border-neutral-700 px-4 py-2 text-sm disabled:opacity-60 hover:bg-neutral-900"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        )}

        {/* Likes (bonus surface with your existing LikesGrid) */}
        <div className="mt-12">
          <h3 className="mb-3 text-lg font-semibold">Likes</h3>
          <LikesGrid profileId={profile.id} />
        </div>
      </div>
    </div>
  );
}
