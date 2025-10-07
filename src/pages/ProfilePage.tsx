import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../state/AuthContext";
import EditProfileModal from "../components/EditProfileModal";

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

const PAGE_SIZE = 16;
const ipfs = (cid?: string | null) => (cid ? `https://ipfs.io/ipfs/${cid}` : "");

export default function ProfilePage() {
  const { handle = "" } = useParams();
  const username = handle.replace(/^@/, "");
  const { user } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [stats, setStats] = useState<{ posts: number; followers: number; following: number }>({
    posts: 0,
    followers: 0,
    following: 0,
  });

  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [editOpen, setEditOpen] = useState(false);

  // Fetch profile by username
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("username", username)
        .maybeSingle();

      if (cancelled) return;
      if (error || !data) {
        setErr(error?.message || "Not found.");
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

  // Load counts (posts, followers, following)
  useEffect(() => {
    if (!profile) return;
    let off = false;
    (async () => {
      const [posts, followers, following] = await Promise.all([
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

      if (off) return;
      setStats({
        posts: posts.count ?? 0,
        followers: followers.count ?? 0,
        following: following.count ?? 0,
      });
    })();
    return () => {
      off = true;
    };
  }, [profile?.id]);

  // Reset grid when profile changes
  useEffect(() => {
    setArtworks([]);
    setPage(0);
    setHasMore(true);
  }, [profile?.id]);

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

    if (error) {
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

  useEffect(() => {
    if (profile) loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const isMe = user && profile && user.id === profile.id;
  const displayName = useMemo(
    () => profile?.display_name || (profile?.username ? `@${profile.username}` : "Artist"),
    [profile]
  );

  if (loading) return <div className="p-8 text-neutral-400">Loading…</div>;
  if (err) return <div className="p-8 text-red-400">{err}</div>;
  if (!profile) return <div className="p-8 text-neutral-400">Not found.</div>;

  return (
    <div>
      {/* Header */}
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex items-start gap-6">
          <img
            src={profile.avatar_url || "/brand/taedal-logo.svg"}
            alt={displayName}
            className="h-28 w-28 rounded-full object-cover ring-4 ring-neutral-950"
          />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold">{displayName}</h1>
              {isMe && (
                <button
                  onClick={() => setEditOpen(true)}
                  className="rounded-xl border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-900"
                >
                  Edit profile
                </button>
              )}
            </div>
            {profile.username && (
              <div className="text-sm text-neutral-400">@{profile.username}</div>
            )}

            {profile.bio && <p className="mt-3 max-w-2xl text-neutral-300">{profile.bio}</p>}

            <div className="mt-4 flex flex-wrap gap-6 text-sm">
              <span>
                <span className="font-semibold">{stats.posts}</span> posts
              </span>
              <span>
                <span className="font-semibold">{stats.followers}</span> followers
              </span>
              <span>
                <span className="font-semibold">{stats.following}</span> following
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="mx-auto max-w-6xl px-4 pb-10">
        {artworks.length === 0 && !hasMore ? (
          <div className="text-neutral-400">No published artworks yet.</div>
        ) : (
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
                        <div className="grid h-full w-full place-items-center text-neutral-500">
                          No image
                        </div>
                      )}
                    </div>
                    <div className="mt-1 truncate text-sm text-neutral-300">
                      {a.title || "Untitled"}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

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

      {/* Edit modal */}
      {isMe && profile && (
        <EditProfileModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          profile={profile}
          onSaved={(patch) => setProfile((p) => (p ? { ...p, ...patch } : p))}
        />
      )}
    </div>
  );
}
