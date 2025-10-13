import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useToast } from "../components/Toaster";
import { useAuth } from "../state/AuthContext";
import FollowButton from "../components/FollowButton";
import FollowListModal from "../components/FollowListModal";
import LikesGrid from "../components/LikesGrid";
import CollectionsGrid from "../components/CollectionsGrid";
import SuggestionsRail from "../components/SuggestionsRail";
import { updateSEO } from "../lib/seo";

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
  creator?: string | null;
  owner?: string | null;
};

type Counts = { posts: number; followers: number; following: number };
type Badge = { kind: string; label: string };

const PAGE_SIZE = 12;
const ipfs = (cid?: string | null) => (cid ? `https://ipfs.io/ipfs/${cid}` : "");

// icons
const GlobeIcon = (p: React.SVGProps<SVGSVGElement>) => (<svg viewBox="0 0 24 24" width="16" height="16" {...p}><path fill="currentColor" d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2Zm7.93 9h-3.09a15.7 15.7 0 0 0-1.15-5.01A8.03 8.03 0 0 1 19.93 11ZM12 4c.9 0 2.3 2.04 2.92 6H9.08C9.7 6.04 11.1 4 12 4ZM8.31 6a15.7 15.7 0 0 0-1.16 5H4.07A8.03 8.03 0 0 1 8.31 6ZM4.07 13h3.08c.12 1.77.5 3.5 1.16 5a8.03 8.03 0 0 1-4.24-5Zm4.99 0h6c-.62 3.96-2.02 6-3 6s-2.38-2.04-3-6Zm6.63 5c.66-1.5 1.04-3.23 1.16-5h3.08a8.03 8.03 0 0 1-4.24 5Z"/></svg>);
const IgIcon = (p: React.SVGProps<SVGSVGElement>) => (<svg viewBox="0 0 24 24" width="16" height="16" {...p}><path fill="currentColor" d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7Zm5 3a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0 2.5A3.5 3.5 0 1 0 12 17a3.5 3.5 0 0 0 0-7.5ZM18 6.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"/></svg>);
const XIcon = (p: React.SVGProps<SVGSVGElement>) => (<svg viewBox="0 0 24 24" width="16" height="16" {...p}><path fill="currentColor" d="M3 3h4.6l4.7 6.5L17.9 3H21l-7.3 9.2L21.4 21H16.8l-5-6.9L8.1 21H3l7.7-9.8L3 3Z"/></svg>);
const ShareIcon = (p: React.SVGProps<SVGSVGElement>) => (<svg viewBox="0 0 24 24" width="16" height="16" {...p}><path fill="currentColor" d="M14 3l7 7-1.41 1.41L15 6.83V17a5 5 0 0 1-5 5H5v-2h5a3 3 0 0 0 3-3V6.83l-4.59 4.58L7 10l7-7Z"/></svg>);

// url builders
function toWebUrl(s?: string | null) { if (!s) return null; const t=s.trim(); if(!t) return null; if(/^https?:\/\//i.test(t)) return t; return `https://${t}`; }
function toInstagramUrl(s?: string | null) { if (!s) return null; const t=s.trim().replace(/^@/,""); if(!t) return null; if(/^https?:\/\//i.test(t)) return t; return `https://instagram.com/${encodeURIComponent(t)}`; }
function toTwitterUrl(s?: string | null) { if (!s) return null; const t=s.trim().replace(/^@/,""); if(!t) return null; if(/^https?:\/\//i.test(t)) return t; return `https://twitter.com/${encodeURIComponent(t)}`; }

export default function PublicProfile() {
  const params = useParams();
  const username = ((params.username as string) || (params.handle as string) || "").replace(/^@/, "");
  const [search, setSearch] = useSearchParams();
  const tab = (search.get("tab") || "artworks") as "artworks" | "purchased" | "likes" | "collections" | "activity";

  const { toast } = useToast();
  const { user } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Counts>({ posts: 0, followers: 0, following: 0 });
  const [badges, setBadges] = useState<{ kind: string; label: string }[]>([]);

  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [showModal, setShowModal] = useState<null | "followers" | "following">(null);

  // load profile
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setProfile(null);
      if (!username) { setLoading(false); return; }

      const { data, error } = await supabase
        .from("profiles")
        .select("id,username,display_name,bio,avatar_url,cover_url,website,instagram,twitter")
        .eq("username", username)
        .maybeSingle();

      if (cancelled) return;
      setLoading(false);
      if (error) { toast({ variant: "error", title: "Couldn’t load profile", description: error.message }); return; }
      setProfile((data || null) as Profile | null);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  // counts + badges
  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data: c } = await supabase
        .from("profile_counts")
        .select("posts,followers,following")
        .eq("user_id", profile.id)
        .maybeSingle();
      setCounts({ posts: c?.posts ?? 0, followers: c?.followers ?? 0, following: c?.following ?? 0 });

      const { data: b1 } = await supabase
        .from("profile_badges_rows")
        .select("kind,label")
        .eq("user_id", profile.id);
      if (Array.isArray(b1) && b1.length) {
        setBadges((b1 as any[]).slice(0, 4) as any);
      } else {
        const { data: b2 } = await supabase
          .from("profile_badges")
          .select("verified,staff,top_seller")
          .eq("user_id", profile.id)
          .maybeSingle();
        const list: any[] = [];
        if (b2?.verified) list.push({ kind: "verified", label: "Verified" });
        if (b2?.staff) list.push({ kind: "staff", label: "Staff" });
        if (b2?.top_seller) list.push({ kind: "top_seller", label: "Top seller" });
        setBadges(list);
      }
    })();
  }, [profile]);

  async function loadMore() {
    if (!profile || loadingMore) return;
    setLoadingMore(true);

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("artworks")
      .select("id,title,cover_url,image_cid,created_at,creator,owner", { count: "exact" })
      .eq("status", "published");

    if (tab === "artworks") {
      query = query.eq("creator", profile.id);
    } else if (tab === "purchased") {
      query = query.eq("owner", profile.id).neq("creator", profile.id);
    } else {
      setLoadingMore(false);
      return;
    }

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    setLoadingMore(false);
    if (error) { toast({ variant: "error", title: "Couldn’t load artworks", description: error.message }); return; }
    const rows = (data || []) as Artwork[];
    setArtworks((prev) => [...prev, ...rows]);
    setPage((p) => p + 1);
    const total = typeof count === "number" ? count : 0;
    setHasMore(from + rows.length < total);
  }

  useEffect(() => {
    setArtworks([]); setPage(0); setHasMore(true);
    if (profile && (tab === "artworks" || tab === "purchased")) loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, tab]);

  const displayName = useMemo(
    () => profile?.display_name || (profile?.username ? `@${profile.username}` : "Artist"),
    [profile]
  );

  const webUrl = useMemo(() => toWebUrl(profile?.website), [profile?.website]);
  const igUrl = useMemo(() => toInstagramUrl(profile?.instagram), [profile?.instagram]);
  const twUrl = useMemo(() => toTwitterUrl(profile?.twitter), [profile?.twitter]);
  const hasSocial = !!(webUrl || igUrl || twUrl);

  useEffect(() => {
    if (!profile) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/u/${encodeURIComponent(profile.username || "")}`;
    updateSEO({
      title: `${displayName} | taedal`,
      description: profile.bio || `${displayName} on taedal`,
      image: profile.cover_url || profile.avatar_url || `${origin}/brand/og-default.jpg`,
      url,
      type: "profile",
      canonical: url,
    });
  }, [profile, displayName]);

  async function handleShare() {
    if (!profile) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = profile.username ? `${origin}/u/${profile.username}` : origin;
    const title = `${displayName} on taedal`;
    try {
      if (navigator.share) await navigator.share({ title, text: title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copied", description: "Profile URL copied to clipboard." });
      }
    } catch {}
  }

  if (loading) {
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
          <Link to="/settings" className="rounded-xl border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-900">
            Go to settings to set your username
          </Link>
        )}
      </div>
    );
  }

  const showFollow = !!user && user.id !== profile.id;
  const cover = profile.cover_url;
  const setTabParam = (t: typeof tab) =>
    setSearch((s) => { const n = new URLSearchParams(s); n.set("tab", t); return n; }, { replace: true });

  return (
    <div>
      {/* Cover */}
      <div className={`h-48 w-full ${cover ? "" : "bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neutral-900 via-neutral-900 to-neutral-950"}`}>
        {cover && <img src={cover} alt="" className="h-48 w-full object-cover" loading="lazy" />}
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
            <h1 className="text-2xl font-semibold">{displayName}</h1>
            {profile.username && <div className="text-sm text-neutral-400">@{profile.username}</div>}

            {badges.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {badges.map((b) => (
                  <span key={b.kind} className="rounded-full border border-neutral-700 px-2 py-0.5 text-xs text-neutral-200">
                    {b.label}
                  </span>
                ))}
              </div>
            )}

            {profile.bio && <p className="mt-2 max-w-3xl text-neutral-300">{profile.bio}</p>}

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

          <div className="mb-2 flex items-center gap-2">
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
              />
            )}
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
            <button className="text-left hover:underline focus:outline-none focus:ring focus:ring-border rounded" onClick={() => setShowModal("followers")}>
              <span className="font-semibold">{counts.followers}</span> followers
            </button>
            <button className="text-left hover:underline focus:outline-none focus:ring focus:ring-border rounded" onClick={() => setShowModal("following")}>
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

      {/* Main + suggestions */}
      <div className="mx-auto max-w-6xl gap-8 px-4 py-8 md:grid md:grid-cols-[1fr_280px]">
        <div>
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
          {tab === "collections" && <CollectionsGrid ownerId={profile.id} isOwner={false} />}
          {tab === "activity" && <div className="text-neutral-400">Activity feed coming soon.</div>}
        </div>

        <SuggestionsRail ownerId={profile.id} />
      </div>
    </div>
  );
}
