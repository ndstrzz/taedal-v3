import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
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
  website?: string | null;
  instagram?: string | null;
  twitter?: string | null;
};

type Artwork = {
  id: string;
  title: string | null;
  cover_url: string | null;
  image_cid: string | null;
  created_at: string;
  owner?: string | null;
};

type Counts = { posts: number; followers: number; following: number };

const PAGE_SIZE = 12;
const ipfs = (cid?: string | null) => (cid ? `https://ipfs.io/ipfs/${cid}` : "");

/* ---------- helpers (NO `creator` column used) ---------- */

/** For a list of artwork IDs, returns which of them were minted by userId. */
async function getMintedByUserSet(artworkIds: string[], userId: string) {
  if (!artworkIds.length) return new Set<string>();
  const { data, error } = await supabase
    .from("activity")
    .select("artwork_id")
    .eq("kind", "mint")
    .eq("actor", userId)
    .in("artwork_id", artworkIds);

  if (error) return new Set<string>();
  return new Set<string>((data || []).map((r: any) => r.artwork_id));
}

/** Page through artworks currently owned by userId. */
async function fetchOwnedPage(userId: string, from: number, to: number) {
  return await supabase
    .from("artworks")
    .select("id,title,cover_url,image_cid,created_at,owner", { count: "exact" })
    .eq("owner", userId)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .range(from, to);
}

/** Page through activity (mint events) for userId, newest first. */
async function fetchMintedIdsPage(userId: string, from: number, to: number) {
  return await supabase
    .from("activity")
    .select("artwork_id,created_at", { count: "exact" })
    .eq("kind", "mint")
    .eq("actor", userId)
    .order("created_at", { ascending: false })
    .range(from, to);
}

/* -------------------------------------------------------- */

export default function ProfilePage() {
  const { handle = "" } = useParams();
  const username = handle.replace(/^@/, "");
  const [search, setSearch] = useSearchParams();
  const tab = (search.get("tab") || "artworks") as "artworks" | "purchased";

  const { user } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [counts, setCounts] = useState<Counts>({ posts: 0, followers: 0, following: 0 });

  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [cursor, setCursor] = useState(0); // activity cursor for uploads, artworks cursor for owned
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
        .select("id,username,display_name,bio,avatar_url,cover_url,website,instagram,twitter")
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
    return () => { cancelled = true; };
  }, [username]);

  // Load counts (posts, followers, following) from profile_counts
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
  }, [profile?.id]);

  // Reset grid when profile or tab changes
  useEffect(() => {
    setArtworks([]); setCursor(0); setHasMore(true);
  }, [profile?.id, tab]);

  async function loadMore() {
    if (!profile || loadingMore || !hasMore) return;
    setLoadingMore(true);

    try {
      if (tab === "artworks") {
        // uploads = minted by this user
        const from = cursor;
        const to = from + PAGE_SIZE - 1;
        const { data: acts, error, count } = await fetchMintedIdsPage(profile.id, from, to);
        if (error) throw error;

        const ids = (acts || []).map((a: any) => a.artwork_id);
        if (ids.length === 0) {
          setHasMore(false);
          setLoadingMore(false);
          return;
        }

        const { data: rows, error: e2 } = await supabase
          .from("artworks")
          .select("id,title,cover_url,image_cid,created_at,owner")
          .in("id", ids)
          .eq("status", "published");
        if (e2) throw e2;

        // Keep activity order
        const map = new Map(rows?.map((r: any) => [r.id, r]));
        const ordered: Artwork[] = ids.map((id) => map.get(id)).filter(Boolean) as Artwork[];

        setArtworks((prev) => [...prev, ...ordered]);
        setCursor(to + 1);
        const total = typeof count === "number" ? count : from + ordered.length;
        setHasMore(from + ids.length < total);
      } else {
        // purchased = owned minus uploaded-by-me
        let from = cursor;
        let to = from + PAGE_SIZE - 1;
        let collected: Artwork[] = [];
        let reachedEnd = false;

        while (collected.length < PAGE_SIZE) {
          const { data, error } = await fetchOwnedPage(profile.id, from, to);
          if (error) throw error;

          const rows = (data || []) as Artwork[];
          if (rows.length === 0) { reachedEnd = true; break; }

          const ids = rows.map((r) => r.id);
          const mintedByMe = await getMintedByUserSet(ids, profile.id);
          const purchased = rows.filter((r) => !mintedByMe.has(r.id));

          collected = collected.concat(purchased);

          from = to + 1;
          to = from + PAGE_SIZE - 1;

          if (collected.length >= PAGE_SIZE) break;
        }

        setArtworks((prev) => [...prev, ...collected]);
        setCursor(from);
        setHasMore(!reachedEnd && collected.length > 0);
      }
    } catch (e: any) {
      setErr(e?.message || e?.details || e?.hint || "Unknown error");
    } finally {
      setLoadingMore(false);
    }
  }

  // Kick off first page
  useEffect(() => {
    if (profile) loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, tab]);

  const isMe = user && profile && user.id === profile.id;
  const displayName = useMemo(
    () => profile?.display_name || (profile?.username ? `@${profile.username}` : "Artist"),
    [profile]
  );

  const setTabParam = (t: typeof tab) =>
    setSearch((s) => { const n = new URLSearchParams(s); n.set("tab", t); return n; }, { replace: true });

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
              <span><span className="font-semibold">{counts.posts}</span> posts</span>
              <span><span className="font-semibold">{counts.followers}</span> followers</span>
              <span><span className="font-semibold">{counts.following}</span> following</span>
            </div>

            {/* Tabs */}
            <div className="mt-4 flex gap-2">
              {(["artworks", "purchased"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTabParam(t)}
                  className={`rounded-full border px-3 py-1.5 text-sm capitalize ${
                    tab === t ? "border-neutral-500" : "border-neutral-700 hover:bg-neutral-900"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="mx-auto max-w-6xl px-4 pb-10">
        {artworks.length === 0 && !loadingMore ? (
          <div className="text-neutral-400">
            {tab === "artworks" ? "No artworks uploaded yet." : "No purchases yet."}
          </div>
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
                        <div className="grid h-full w-full place-items-center text-neutral-500">No image</div>
                      )}
                    </div>
                    <div className="mt-1 truncate text-sm text-neutral-300">{a.title || "Untitled"}</div>
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
