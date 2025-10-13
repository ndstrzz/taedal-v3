import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../state/AuthContext";
import { supabase } from "../lib/supabase";
import { ensureProfileRow } from "../lib/profile";
import FollowListModal from "../components/FollowListModal";
import LikesGrid from "../components/LikesGrid";
import CollectionsGrid from "../components/CollectionsGrid";
import { useToast } from "../components/Toaster";

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

// URL helpers
function toWebUrl(s?: string | null) {
  if (!s) return null; const t=s.trim(); if(!t) return null;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}
function toInstagramUrl(s?: string | null) {
  if (!s) return null; const t=s.trim().replace(/^@/,""); if(!t) return null;
  return /^https?:\/\//i.test(t) ? t : `https://instagram.com/${encodeURIComponent(t)}`;
}
function toTwitterUrl(s?: string | null) {
  if (!s) return null; const t=s.trim().replace(/^@/,""); if(!t) return null;
  return /^https?:\/\//i.test(t) ? t : `https://twitter.com/${encodeURIComponent(t)}`;
}

// Inline icons
const GlobeIcon = (p: React.SVGProps<SVGSVGElement>) => (<svg viewBox="0 0 24 24" width="16" height="16" {...p}><path fill="currentColor" d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2Zm7.93 9h-3.09a15.7 15.7 0 0 0-1.15-5.01A8.03 8.03 0 0 1 19.93 11ZM12 4c.9 0 2.3 2.04 2.92 6H9.08C9.7 6.04 11.1 4 12 4ZM8.31 6a15.7 15.7 0 0 0-1.16 5H4.07A8.03 8.03 0 0 1 8.31 6ZM4.07 13h3.08c.12 1.77.5 3.5 1.16 5a8.03 8.03 0 0 1-4.24-5Zm4.99 0h6c-.62 3.96-2.02 6-3 6s-2.38-2.04-3-6Zm6.63 5c.66-1.5 1.04-3.23 1.16-5h3.08a8.03 8.03 0 0 1-4.24 5Z"/></svg>);
const IgIcon    = (p: React.SVGProps<SVGSVGElement>) => (<svg viewBox="0 0 24 24" width="16" height="16" {...p}><path fill="currentColor" d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7Zm5 3a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0 2.5A3.5 3.5 0 1 0 12 17a3.5 3.5 0 0 0 0-7.5ZM18 6.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"/></svg>);
const XIcon     = (p: React.SVGProps<SVGSVGElement>) => (<svg viewBox="0 0 24 24" width="16" height="16" {...p}><path fill="currentColor" d="M3 3h4.6l4.7 6.5L17.9 3H21l-7.3 9.2L21.4 21H16.8l-5-6.9L8.1 21H3l7.7-9.8L3 3Z"/></svg>);
const ShareIcon = (p: React.SVGProps<SVGSVGElement>) => (<svg viewBox="0 0 24 24" width="16" height="16" {...p}><path fill="currentColor" d="M14 3l7 7-1.41 1.41L15 6.83V17a5 5 0 0 1-5 5H5v-2h5a3 3 0 0 0 3-3V6.83l-4.59 4.58L7 10l7-7Z"/></svg>);

// --- Helpers that replace any use of `creator` ---

/** Return a Set of artwork_ids minted by this user from the provided ids */
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

/** Fetch artworks owned by user (paged on server) */
async function fetchOwnedPage(userId: string, from: number, to: number) {
  return await supabase
    .from("artworks")
    .select("id,title,cover_url,image_cid,created_at,owner", { count: "exact" })
    .eq("owner", userId)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .range(from, to);
}

/** Fetch a page of the user's minted artwork_ids by paging the activity table */
async function fetchMintedIdsPage(userId: string, from: number, to: number) {
  return await supabase
    .from("profile_uploads")
    .select("artwork_id,created_at", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(from, to);
}

export default function MyProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useSearchParams();
  const tab = (search.get("tab") || "artworks") as "artworks" | "purchased" | "likes" | "collections" | "activity";

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [counts, setCounts] = useState<Counts>({ posts: 0, followers: 0, following: 0 });

  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [cursor, setCursor] = useState(0); // server cursor (activity for uploads, artworks for owned)
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [showModal, setShowModal] = useState<null | "followers" | "following">(null);

  useEffect(() => {
    (async () => {
      if (!user) return;
      await ensureProfileRow(user.id);
      setLoadingProfile(true);
      const { data } = await supabase
        .from("profiles")
        .select("id,username,display_name,bio,avatar_url,cover_url,website,instagram,twitter")
        .eq("id", user.id)
        .maybeSingle();
      setProfile((data as Profile) || null);
      setLoadingProfile(false);
    })();
  }, [user]);

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

  async function loadMore() {
    if (!profile || loadingMore || !hasMore) return;
    setLoadingMore(true);

    try {
      if (tab === "artworks") {
        // Page by activity (minted by me)
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

        // preserve activity order
        const map = new Map(rows?.map((r: any) => [r.id, r]));
        const ordered: Artwork[] = ids.map((id) => map.get(id)).filter(Boolean) as Artwork[];

        setArtworks((prev) => [...prev, ...ordered]);
        setCursor(to + 1);
        const total = typeof count === "number" ? count : from + ordered.length;
        setHasMore(from + ids.length < total);
      } else if (tab === "purchased") {
        // Page by owned artworks and filter out ones I minted
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

          if (rows.length < PAGE_SIZE) {
            // likely near end; loop one more time will confirm
          }
          if (collected.length >= PAGE_SIZE) break;
        }

        setArtworks((prev) => [...prev, ...collected]);
        setCursor(from);
        setHasMore(!reachedEnd && collected.length > 0);
      }
    } catch (e: any) {
      const msg = e?.message || e?.details || e?.hint || "Unknown error";
      if (artworks.length === 0) {
        toast({ variant: "error", title: "Couldn’t load artworks", description: msg });
      }
    } finally {
      setLoadingMore(false);
    }
  }

  // reset list + cursor when profile or tab changes
  useEffect(() => {
    setArtworks([]); setCursor(0); setHasMore(true);
    if (profile && (tab === "artworks" || tab === "purchased")) loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, tab]);

  const displayName = useMemo(
    () => profile?.display_name || (profile?.username ? `@${profile.username}` : "You"),
    [profile]
  );

  const setTabParam = (t: typeof tab) =>
    setSearch((s) => { const n = new URLSearchParams(s); n.set("tab", t); return n; }, { replace: true });

  const webUrl = toWebUrl(profile?.website);
  const igUrl  = toInstagramUrl(profile?.instagram);
  const twUrl  = toTwitterUrl(profile?.twitter);
  const hasSocial = !!(webUrl || igUrl || twUrl);

  async function handleShare() {
    if (!profile) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = profile.username ? `${origin}/u/${profile.username}` : `${origin}/me`;
    const title = `${displayName} on taedal`;
    try {
      if (navigator.share) await navigator.share({ title, text: title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copied", description: "Profile URL copied to clipboard." });
      }
    } catch {}
  }

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
            {profile.bio && <p className="mt-2 max-w-2xl text-neutral-300">{profile.bio}</p>}

            {hasSocial && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {webUrl && (
                  <a href={webUrl} target="_blank" rel="me noopener noreferrer"
                     className="inline-flex items-center gap-2 rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-900">
                    <GlobeIcon /> Website
                  </a>
                )}
                {igUrl && (
                  <a href={igUrl} target="_blank" rel="me noopener noreferrer"
                     className="inline-flex items-center gap-2 rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-900">
                    <IgIcon /> Instagram
                  </a>
                )}
                {twUrl && (
                  <a href={twUrl} target="_blank" rel="me noopener noreferrer"
                     className="inline-flex items-center gap-2 rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-900">
                    <XIcon /> X (Twitter)
                  </a>
                )}
              </div>
            )}
          </div>

          <div className="mb-2 hidden md:flex items-center gap-2">
            <Link
              to="/settings?from=me"
              className="rounded-xl border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-900 focus:outline-none focus:ring focus:ring-border"
            >
              Edit profile
            </Link>
            <button
              onClick={handleShare}
              className="rounded-xl border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-900 inline-flex items-center gap-2"
              aria-label="Share profile"
            >
              <ShareIcon /> Share
            </button>
          </div>
        </div>

        {/* Stats + Tabs */}
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div className="flex gap-6 text-sm">
            <div><span className="font-semibold">{counts.posts}</span> posts</div>
            <button className="text-left hover:underline rounded focus:outline-none focus:ring focus:ring-border" onClick={() => setShowModal("followers")}>
              <span className="font-semibold">{counts.followers}</span> followers
            </button>
            <button className="text-left hover:underline rounded focus:outline-none focus:ring focus:ring-border" onClick={() => setShowModal("following")}>
              <span className="font-semibold">{counts.following}</span> following
            </button>
          </div>

          <div className="flex gap-2">
            {(["artworks","purchased","likes","collections","activity"] as const).map((t) => (
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

      {/* Main */}
      <div className="mx-auto max-w-6xl px-4 py-8">
        {(tab === "artworks" || tab === "purchased") && (
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

            {!loadingMore && artworks.length === 0 && (
              <div className="text-sm text-neutral-400">
                {tab === "artworks" ? "No artworks uploaded yet." : "No purchases yet."}
              </div>
            )}
          </>
        )}

        {tab === "likes" && <LikesGrid profileId={profile.id} />}

        {tab === "collections" && <CollectionsGrid ownerId={profile.id} isOwner={true} />}

        {tab === "activity" && <div className="text-neutral-400">Activity feed coming soon.</div>}
      </div>
    </div>
  );
}
