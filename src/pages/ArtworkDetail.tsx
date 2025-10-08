// src/pages/ArtworkDetail.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ipfsToHttp } from "../lib/ipfs-url";
import { DEFAULT_COVER_URL } from "../lib/config";
import BuyNowModal from "../components/BuyNowModal";
import MakeOfferModal from "../components/MakeOfferModal";

type Attribute = { trait_type: string; value: string | number };
type Metadata = {
  name?: string;
  description?: string;
  image?: string;
  animation_url?: string;
  attributes?: Attribute[];
};

type Artwork = {
  id: string;
  title: string | null;
  description: string | null;
  owner: string | null;
  cover_url: string | null;
  image_cid: string | null;
  animation_cid: string | null;
  metadata_url: string | null;
  token_id: string | null;
  tx_hash: string | null;
  media_kind: "image" | "video" | null;
  royalty_bps: number | null;
  sale_kind: "fixed" | "auction" | null;
  sale_price: string | null;
  sale_currency: "ETH" | "WETH" | null;
  created_at: string;
};

type Listing = {
  artwork_id: string;
  listing_id?: string;      // from v_active_listing
  id?: string;              // from listings table fallback
  lister: string | null;
  status: "active" | "cancelled" | "filled";
  price: string | null;     // numeric arrives as string from PG
  currency: string | null;
  created_at: string;
};

type TraitStat = {
  trait_type: string;
  value: string;
  count: number;
  total: number;
  freq: number; // 0..1
};

type Act = {
  id: string;
  kind: "mint" | "list" | "sale" | "bid" | "transfer" | "buy" | "cancel_list";
  tx_hash: string | null;
  price_eth: string | number | null;
  actor: string | null;
  created_at: string;
};

type BestOffer = {
  artwork_id: string;
  offer_id: string;
  offerer: string;
  price: string;      // numeric from PG arrives as string
  currency: string;
  created_at: string;
};

function Skeleton() {
  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="aspect-square animate-pulse rounded-2xl bg-neutral-900" />
        <div className="space-y-3">
          <div className="h-6 w-1/2 animate-pulse rounded bg-neutral-900" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-neutral-900" />
          <div className="h-10 w-40 animate-pulse rounded bg-neutral-900" />
          <div className="h-28 w-full animate-pulse rounded bg-neutral-900" />
        </div>
      </div>
    </div>
  );
}

export default function ArtworkDetail() {
  const { id } = useParams<{ id: string }>();

  const [art, setArt] = useState<Artwork | null>(null);
  const [meta, setMeta] = useState<Metadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [tab, setTab] = useState<"details" | "activity">("details");
  const [acts, setActs] = useState<Act[]>([]);
  const [traitStats, setTraitStats] = useState<TraitStat[]>([]);
  const [listing, setListing] = useState<Listing | null>(null);
  const [bestOffer, setBestOffer] = useState<BestOffer | null>(null);

  const [showBuy, setShowBuy] = useState(false);
  const [showOffer, setShowOffer] = useState(false);

  // 1) Load artwork
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("artworks")
          .select("*")
          .eq("id", id)
          .single();
        if (error) throw error;
        if (mounted) setArt(data as unknown as Artwork);
      } catch (e: any) {
        setErr(e?.message || "Failed to load artwork");
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  // 2) Load metadata JSON
  useEffect(() => {
    let aborted = false;
    (async () => {
      if (!art?.metadata_url) return setMeta(null);
      try {
        const url = ipfsToHttp(art.metadata_url);
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error(`Metadata HTTP ${r.status}`);
        const j = (await r.json()) as Metadata;
        if (!aborted) setMeta(j || null);
      } catch {
        if (!aborted) setMeta(null);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [art?.metadata_url]);

  // 3) Activity for this artwork
  async function fetchActivity(artworkId: string) {
    const { data } = await supabase
      .from("activity")
      .select("*")
      .eq("artwork_id", artworkId)
      .order("created_at", { ascending: false });
    if (data) setActs(data as Act[]);
  }
  useEffect(() => {
    if (art?.id) fetchActivity(art.id);
  }, [art?.id]);

  // 4) Rarity stats — prefer view "trait_stats", fall back to MV "trait_stats_mv"
  useEffect(() => {
    (async () => {
      let { data, error } = await supabase.from("trait_stats").select("*");
      if (error) {
        const alt = await supabase.from("trait_stats_mv").select("*");
        data = alt.data || null;
      }
      if (data) setTraitStats(data as TraitStat[]);
    })();
  }, []);

  // 5) Active listing — prefer helper view, fall back to listings table
  async function fetchListing(artworkId: string) {
    const viaView = await supabase
      .from("v_active_listing")
      .select("*")
      .eq("artwork_id", artworkId)
      .maybeSingle();
    if (viaView.data) {
      setListing(viaView.data as unknown as Listing);
      return;
    }
    const fallback = await supabase
      .from("listings")
      .select("*")
      .eq("artwork_id", artworkId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fallback.data) setListing(fallback.data as unknown as Listing);
    else setListing(null);
  }
  useEffect(() => {
    if (id) fetchListing(id);
  }, [id]);

  // 5b) Best offer (optional helper view v_best_offer)
  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error } = await supabase
        .from("v_best_offer")
        .select("*")
        .eq("artwork_id", id)
        .maybeSingle();
      if (!error && data) setBestOffer(data as unknown as BestOffer);
      else setBestOffer(null);
    })();
  }, [id]);

  // Refetch everything after a write (buy/offer)
  async function refetchAll() {
    if (!id) return;
    await Promise.all([fetchListing(id), fetchActivity(id)]);
  }

  // 6) Media + rarity map
  const media = useMemo(() => {
    if (!art) return { kind: "image" as const, poster: DEFAULT_COVER_URL, src: "" };
    const poster = art.cover_url || DEFAULT_COVER_URL;

    if (art.media_kind === "video" && art.animation_cid) {
      return { kind: "video" as const, poster, src: ipfsToHttp(`ipfs://${art.animation_cid}`) };
    }
    if (art.image_cid) {
      return { kind: "image" as const, poster, src: ipfsToHttp(`ipfs://${art.image_cid}`) };
    }

    const metaAnim = meta?.animation_url ? ipfsToHttp(meta.animation_url) : "";
    const metaImg = meta?.image ? ipfsToHttp(meta.image) : "";

    if (metaAnim) return { kind: "video" as const, poster, src: metaAnim };
    if (metaImg) return { kind: "image" as const, poster, src: metaImg };
    return { kind: "image" as const, poster, src: poster };
  }, [art, meta]);

  const rarityMap = useMemo(() => {
    const m = new Map<string, TraitStat>();
    for (const s of traitStats) m.set(`${s.trait_type}::${s.value}`, s);
    return m;
  }, [traitStats]);

  // Early returns
  if (loading) return <Skeleton />;
  if (err) return <div className="p-6 text-red-400">Error: {err}</div>;
  if (!art) return <div className="p-6 text-neutral-400">Artwork not found.</div>;

  const title = art.title || meta?.name || "Untitled";
  const desc = art.description || meta?.description || "";
  const royaltyPct = ((art.royalty_bps || 0) / 100).toFixed(2);

  // Prefer off-chain active listing price if present, else on-chain-ish sale_* fields
  const displayPrice =
    listing?.price
      ? `${listing.price} ${listing.currency || "ETH"}`
      : art.sale_kind === "fixed" && art.sale_price
      ? `${art.sale_price} ${art.sale_currency || "ETH"}`
      : null;

  const attributes: Attribute[] = Array.isArray(meta?.attributes) ? meta!.attributes! : [];
  const listingId = listing?.listing_id || listing?.id || null;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="grid gap-6 md:grid-cols-2">
        {/* Media */}
        <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950">
          {media.kind === "video" ? (
            <video
              src={media.src}
              poster={media.poster || undefined}
              className="h-full w-full"
              controls
              playsInline
            />
          ) : (
            <img
              src={media.src || media.poster}
              alt={title}
              className="h-full w-full object-contain"
            />
          )}
        </div>

        {/* Right rail */}
        <div>
          <div className="text-xl font-semibold text-neutral-100">{title}</div>
          <div className="mt-1 text-sm text-neutral-400">
            Owned by{" "}
            {art.owner ? (
              <Link to={`/u/${art.owner}`} className="text-neutral-200 hover:underline">
                {art.owner.slice(0, 6)}…{art.owner.slice(-4)}
              </Link>
            ) : (
              "unknown"
            )}
          </div>

          <div className="mt-4 rounded-2xl border border-neutral-800 p-4">
            <div className="text-sm text-neutral-400">Price</div>
            <div className="mt-1 text-2xl font-semibold">{displayPrice ?? "—"}</div>

            {bestOffer ? (
              <div className="mt-2 text-sm text-neutral-400">
                Best offer:{" "}
                <span className="text-neutral-200">
                  {bestOffer.price} {bestOffer.currency}
                </span>
              </div>
            ) : null}

            <div className="mt-3 flex gap-2">
              <button
                className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
                disabled={!displayPrice || !listingId}
                onClick={() => setShowBuy(true)}
              >
                Buy now
              </button>
              <button
                className="rounded-xl border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-900"
                onClick={() => setShowOffer(true)}
              >
                Make offer
              </button>
            </div>
            <div className="mt-3 text-xs text-neutral-500">
              Royalty: {royaltyPct}% • Token ID: {art.token_id ?? "—"}
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-6 flex gap-2">
            {(["details", "activity"] as const).map((t) => (
              <button
                key={t}
                className={`rounded-full border px-3 py-1 text-sm capitalize ${
                  tab === t ? "border-neutral-500" : "border-neutral-800 hover:bg-neutral-900"
                }`}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === "details" && (
            <div className="mt-4">
              {desc && (
                <>
                  <div className="mb-1 text-sm font-medium text-neutral-200">About</div>
                  <div className="whitespace-pre-wrap text-sm text-neutral-300">{desc}</div>
                </>
              )}

              {/* Chain details */}
              <div className="mt-6">
                <div className="mb-1 text-sm font-medium text-neutral-200">Blockchain details</div>
                <div className="grid grid-cols-2 gap-2 text-xs text-neutral-400">
                  <div className="rounded-lg border border-neutral-800 p-2">
                    <div className="text-neutral-500">Metadata URI</div>
                    <a
                      className="truncate text-neutral-300 hover:underline"
                      href={ipfsToHttp(art.metadata_url || "")}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {art.metadata_url || "—"}
                    </a>
                  </div>
                  <div className="rounded-lg border border-neutral-800 p-2">
                    <div className="text-neutral-500">Tx hash</div>
                    <div className="truncate text-neutral-300">{art.tx_hash || "—"}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "activity" && (
            <div className="mt-4 space-y-2">
              {acts.length === 0 ? (
                <div className="text-sm text-neutral-400">No activity yet.</div>
              ) : (
                acts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-xl border border-neutral-800 p-3 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-xs capitalize">
                        {a.kind}
                      </span>
                      <span className="text-neutral-300">
                        {a.actor ? `${a.actor.slice(0, 6)}…${a.actor.slice(-4)}` : "Someone"}
                      </span>
                    </div>
                    <div className="text-right">
                      {a.price_eth ? <div className="text-neutral-200">{a.price_eth} ETH</div> : null}
                      <div className="text-xs text-neutral-500">
                        {new Date(a.created_at).toLocaleString()}
                        {a.tx_hash ? ` • ${a.tx_hash.slice(0, 8)}…` : ""}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Traits with rarity pills */}
      <div className="mt-8">
        <div className="mb-2 text-lg font-semibold">Traits</div>
        {attributes.length ? (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {attributes.map((t, i) => {
              const key = `${t.trait_type}::${String(t.value)}`;
              const s = rarityMap.get(key);
              const pct = s ? Math.round((s.freq || 0) * 1000) / 10 : null; // e.g., 12.3%
              return (
                <li key={i} className="rounded-xl border border-neutral-800 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-neutral-500">{t.trait_type}</div>
                      <div className="text-sm text-neutral-200">{String(t.value)}</div>
                    </div>
                    <div className="text-right">
                      {pct !== null ? (
                        <>
                          <div className="text-xs text-neutral-400">{pct}%</div>
                          <div className="text-[11px] text-neutral-500">
                            {s?.count ?? 0} of {s?.total ?? 0}
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-neutral-500">—</div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="text-sm text-neutral-400">No traits.</div>
        )}
      </div>

      {/* Modals */}
      {showBuy && listing && listingId && (
        <BuyNowModal
          artworkId={art.id}
          listingId={listingId}
          defaultPrice={String(listing.price ?? "")}
          defaultCurrency={listing.currency || "ETH"}
          onClose={() => setShowBuy(false)}
          onDone={refetchAll}
        />
      )}
      {showOffer && (
        <MakeOfferModal
          artworkId={art.id}
          onClose={() => setShowOffer(false)}
          onDone={refetchAll}
        />
      )}
    </div>
  );
}
