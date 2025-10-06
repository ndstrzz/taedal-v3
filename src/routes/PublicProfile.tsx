import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useToast } from "../components/Toaster";

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

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

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
        setErr(error?.message || "User not found");
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

  // Load a page of published artworks for this profile
  async function loadMore() {
    if (!profile) return;
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

  // Reset grid when profile changes
  useEffect(() => {
    setArtworks([]);
    setPage(0);
    setHasMore(true);
  }, [profile?.id]);

  useEffect(() => {
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
  if (err) {
    return <div className="p-8 text-red-400">{err}</div>;
  }
  if (!profile) {
    return <div className="p-8 text-neutral-400">Profile not found.</div>;
  }

  return (
    <div>
      {/* Cover */}
      <div className="h-48 w-full bg-neutral-900">
        {profile.cover_url && (
          <img
            src={profile.cover_url}
            alt=""
            className="h-48 w-full object-cover"
            loading="lazy"
          />
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
          <div className="pb-2">
            <h1 className="text-2xl font-semibold">{displayName}</h1>
            {profile.username && (
              <div className="text-sm text-neutral-400">@{profile.username}</div>
            )}
          </div>
        </div>
        {profile.bio && <p className="mt-4 max-w-3xl text-neutral-300">{profile.bio}</p>}
      </div>

      {/* Artworks grid */}
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h2 className="mb-4 text-lg font-semibold">Artworks</h2>

        {artworks.length === 0 && !hasMore && (
          <div className="text-neutral-400">No published artworks yet.</div>
        )}

        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
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
                      <div className="h-full w-full grid place-items-center text-neutral-500 text-sm">
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
