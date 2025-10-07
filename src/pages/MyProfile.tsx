import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../state/AuthContext";
import { supabase } from "../lib/supabase";
import { ensureProfileRow } from "../lib/profile";
import FollowListModal from "../components/FollowListModal";
import LikesGrid from "../components/LikesGrid";
import CollectionsGrid from "../components/CollectionsGrid";
import EditProfileInline from "../components/EditProfileInline";
import SuggestionsRail from "../components/SuggestionsRail";

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
};

type Counts = { posts: number; followers: number; following: number };

const PAGE_SIZE = 12;
const ipfs = (cid?: string | null) => (cid ? `https://ipfs.io/ipfs/${cid}` : "");

export default function MyProfile() {
  const { user } = useAuth();
  const [search, setSearch] = useSearchParams();
  const tab = (search.get("tab") || "artworks") as
    | "artworks"
    | "likes"
    | "collections"
    | "activity"
    | "edit";

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [counts, setCounts] = useState<Counts>({ posts: 0, followers: 0, following: 0 });

  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [showModal, setShowModal] = useState<null | "followers" | "following">(null);

  // Load (and ensure) profile row
  useEffect(() => {
    (async () => {
      if (!user) return;
      await ensureProfileRow(user.id);
      setLoadingProfile(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("id,username,display_name,bio,avatar_url,cover_url,website,instagram,twitter")
        .eq("id", user.id)
        .maybeSingle();
      if (!error) setProfile((data as Profile) || null);
      setLoadingProfile(false);
    })();
  }, [user]);

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
    if (error) return;

    const rows = (data || []) as Artwork[];
    setArtworks((prev) => [...prev, ...rows]);
    setPage((p) => p + 1);
    const total = typeof count === "number" ? count : 0;
    setHasMore(from + rows.length < total);
  }

  // Reset on profile change
  useEffect(() => {
    setArtworks([]); setPage(0); setHasMore(true);
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

  if (loadingProfile) {
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
        <p className="mb-4 text-neutral-300">You don’t have a profile yet. Set it up now.</p>
        <Link to="/settings" className="rounded-xl border border-neutral-700 px-4 py-2 text-sm">
          Edit profile
        </Link>
      </div>
    );
  }

  const cover = profile.cover_url;
  const setTab = (t: typeof tab) =>
    setSearch((s) => { const n = new URLSearchParams(s); n.set("tab", t); return n; }, { replace: true });

  return (
    <div>
      {/* Cover */}
      <div className={`h-48 w-full ${cover ? "" : "bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neutral-900 via-neutral-900 to-neutral-950"}`}>
        {cover && <img src={cover} alt="" className="h-48 w-full object-cover" />}
      </div>

      <div className="mx-auto -mt-12 max-w-6xl px-4">
        {/* Header */}
        <div className="flex items-end gap-4">
          <img
            src={profile.avatar_url || "/brand/taedal-logo.svg"}
            alt={displayName}
            className="h-24 w-24 rounded-full border-4 border-neutral-950 object-cover bg-neutral-900"
          />
          <div className="flex-1 pb-2">
            <div className="text-2xl font-semibold">{displayName}</div>
            {profile.username && <div className="text-sm text-neutral-400">@{profile.username}</div>}
            {profile.bio && <p className="mt-2 max-w-2xl text-neutral-300 line-clamp-3">{profile.bio}</p>}
          </div>

          <div className="mb-2 hidden md:block">
            <button
              onClick={() => setTab("edit")}
              className="rounded-xl border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-900 focus:outline-none focus:ring focus:ring-border"
            >
              Edit profile
            </button>
          </div>
        </div>

        {/* Stats + Tabs */}
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div className="flex gap-6 text-sm">
            <div><span className="font-semibold">{counts.posts}</span> posts</div>
            <button
              className="text-left hover:underline rounded focus:outline-none focus:ring focus:ring-border"
              onClick={() => setShowModal("followers")}
            >
              <span className="font-semibold">{counts.followers}</span> followers
            </button>
            <button
              className="text-left hover:underline rounded focus:outline-none focus:ring focus:ring-border"
              onClick={() => setShowModal("following")}
            >
              <span className="font-semibold">{counts.following}</span> following
            </button>
          </div>

          <div className="flex gap-2">
            {(["artworks","likes","collections","activity","edit"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
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

      {/* Main content + suggestions */}
      <div className="mx-auto max-w-6xl gap-8 px-4 py-8 md:grid md:grid-cols-[1fr_280px]">
        <div>
          {tab === "artworks" && (
            <>
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
                            <div className="grid h-full w-full place-items-center text-sm text-neutral-500">No image</div>
                          )}
                        </div>
                        <div className="mt-2 truncate text-sm text-neutral-200">{a.title || "Untitled"}</div>
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
            </>
          )}

          {tab === "likes" && <LikesGrid profileId={profile.id} />}

          {tab === "collections" && <CollectionsGrid ownerId={profile.id} isOwner />}

          {tab === "activity" && <div className="text-neutral-400">Activity feed coming soon.</div>}

          {tab === "edit" && (
            <EditProfileInline
              userId={profile.id}
              initial={profile}
              onSaved={async () => {
                const { data } = await supabase
                  .from("profiles")
                  .select("id,username,display_name,bio,avatar_url,cover_url,website,instagram,twitter")
                  .eq("id", user!.id)
                  .maybeSingle();
                setProfile((data as Profile) || profile);
              }}
            />
          )}
        </div>

        {/* Suggestions rail (same logic as public profile) */}
        <SuggestionsRail ownerId={profile.id} />
      </div>
    </div>
  );
}
