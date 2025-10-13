// src/pages/ArtworkDetail.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ipfsToHttp, ipfsCandidates } from "../lib/ipfs-url";
import { DEFAULT_COVER_URL } from "../lib/config";
import { apiFetch } from "../lib/api";
import { useAuth } from "../state/AuthContext";
import MakeOfferModal from "../components/MakeOfferModal";
import CheckoutModal from "../components/CheckoutModal";

type Attribute = { trait_type: string; value: string | number };
type Metadata = { name?: string; description?: string; image?: string; animation_url?: string; attributes?: Attribute[]; };

type Artwork = {
  id: string; title: string | null; description: string | null; owner: string | null;
  creator?: string | null;
  cover_url: string | null; image_cid: string | null; animation_cid: string | null;
  metadata_url: string | null; token_id: string | null; tx_hash: string | null;
  media_kind: "image" | "video" | null; royalty_bps: number | null;
  sale_kind: "fixed" | "auction" | null; sale_price: string | null;
  sale_currency: "ETH" | "WETH" | "USD" | null; created_at: string;
};

type Listing = {
  id?: string; listing_id?: string; artwork_id: string; lister: string | null;
  seller?: string | null; price?: string | null; price_eth?: string | null;
  currency?: string | null; status: "active" | "cancelled" | "filled"; created_at: string;
};
type TraitStat = { trait_type: string; value: string; count: number; total: number; freq: number; };
type Act = { id: string; kind: "mint"|"list"|"sale"|"bid"|"transfer"|"buy"|"cancel_list"; tx_hash: string | null; price_eth: string | number | null; actor: string | null; created_at: string; };
type BestOffer = { artwork_id: string; offer_id: string; offerer: string; price: string; currency: string; created_at: string; };

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

function formatPrice(val: string | number, currency: "ETH" | "WETH" | "USD"): string {
  if (currency === "USD") {
    const n = Number(val);
    return Number.isFinite(n)
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
      : `$${val}`;
  }
  const n = Number(val);
  const trimmed = Number.isFinite(n) ? Number(n.toFixed(4)).toString() : String(val);
  return `${trimmed} ${currency}`;
}

export default function ArtworkDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [art, setArt] = useState<Artwork | null>(null);
  const [meta, setMeta] = useState<Metadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [tab, setTab] = useState<"details" | "activity">("details");
  const [acts, setActs] = useState<Act[]>([]);
  const [traitStats, setTraitStats] = useState<TraitStat[]>([]);
  const [listing, setListing] = useState<Listing | null>(null);
  const [bestOffer, setBestOffer] = useState<BestOffer | null>(null);

  const [showCheckout, setShowCheckout] = useState(false);
  const [showOffer, setShowOffer] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase.from("artworks").select("*").eq("id", id).single();
        if (error) throw error;
        if (mounted) setArt(data as any);
      } catch (e: any) {
        setErr(e?.message || "Failed to load artwork");
      } finally {
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

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
      } catch { if (!aborted) setMeta(null); }
    })();
    return () => { aborted = true; };
  }, [art?.metadata_url]);

  async function fetchActivity(artworkId: string) {
    const { data } = await supabase
      .from("activity")
      .select("*")
      .eq("artwork_id", artworkId)
      .order("created_at", { ascending: false });
    if (data) setActs(data as any);
  }
  useEffect(() => { if (art?.id) fetchActivity(art.id); }, [art?.id]);

  useEffect(() => {
    (async () => {
      let { data, error } = await supabase.from("trait_stats").select("*");
      if (error) {
        const alt = await supabase.from("trait_stats_mv").select("*");
        data = alt.data || null;
      }
      if (data) setTraitStats(data as any);
    })();
  }, []);

  async function fetchListing(artworkId: string) {
    const viaView = await supabase.from("v_active_listing").select("*").eq("artwork_id", artworkId).maybeSingle();
    if (viaView.data) { setListing(viaView.data as any); return; }
    const fallback = await supabase
      .from("listings").select("*")
      .eq("artwork_id", artworkId).eq("status", "active")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (fallback.data) setListing(fallback.data as any); else setListing(null);
  }
  useEffect(() => { if (id) fetchListing(id); }, [id]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error } = await supabase.from("v_best_offer").select("*").eq("artwork_id", id).maybeSingle();
      if (!error && data) setBestOffer(data as any); else setBestOffer(null);
    })();
  }, [id]);

  async function refetchAll() { if (!id) return; await Promise.all([fetchListing(id), fetchActivity(id)]); }

  // Build media source candidates (multiple gateways) + poster fallback
  const poster = art?.cover_url || DEFAULT_COVER_URL;
  const imageCandidates = useMemo(() => {
    if (art?.media_kind === "video") return [] as string[];
    if (art?.image_cid) return ipfsCandidates(`ipfs://${art.image_cid}`);
    if (meta?.image)    return ipfsCandidates(meta.image);
    return poster ? [poster] : [];
  }, [art?.media_kind, art?.image_cid, meta?.image, poster]);

  const videoCandidates = useMemo(() => {
    if (art?.media_kind !== "video") return [] as string[];
    if (art?.animation_cid) return ipfsCandidates(`ipfs://${art.animation_cid}`);
    if (meta?.animation_url) return ipfsCandidates(meta.animation_url);
    return [];
  }, [art?.media_kind, art?.animation_cid, meta?.animation_url]);

  // index states to rotate through gateways on errors
  const [imgIdx, setImgIdx] = useState(0);
  const [vidIdx, setVidIdx] = useState(0);

  useEffect(() => setImgIdx(0), [imageCandidates.join("|")]);
  useEffect(() => setVidIdx(0), [videoCandidates.join("|")]);

  if (loading) return <Skeleton />;
  if (err) return <div className="p-6 text-red-400">Error: {err}</div>;
  if (!art) return <div className="p-6 text-neutral-400">Artwork not found.</div>;

  const isOwner = Boolean(user?.id && art.owner && user.id === art.owner);

  const title = art.title || meta?.name || "Untitled";
  const desc = art.description || meta?.description || "";
  const royaltyPct = ((art.royalty_bps || 0) / 100).toFixed(2);
  const attributes: Attribute[] = Array.isArray(meta?.attributes) ? meta!.attributes! : [];

  const listingId = (listing?.listing_id || listing?.id || null) as string | null;
  const currentPrice = listing?.price ?? listing?.price_eth ?? art.sale_price ?? "";
  const currentCurrency = (listing?.currency || art.sale_currency || "ETH") as "ETH" | "WETH" | "USD";
  const displayPrice = currentPrice ? formatPrice(currentPrice, currentCurrency) : null;

  const canBuy = !isOwner && Boolean(listingId && currentPrice);

  async function ownerListForSaleUSD() {
    try {
      if (!user?.id) { alert("Please log in."); return; }
      const j = await apiFetch("/api/listings/create", {
        method: "POST",
        body: JSON.stringify({
          artwork_id: art.id,
          price: 123,              // placeholder; replace with UI later
          currency: "USD",
        }),
      });
      setListing(j?.listing || null);
    } catch (e: any) {
      alert(`Create listing failed: ${e?.message || e}`);
    }
  }

  async function handleBuyClick() {
    setShowCheckout(true);
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="grid gap-6 md:grid-cols-2">
        {/* Media */}
        <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950">
          {art.media_kind === "video" ? (
            videoCandidates.length ? (
              <video
                key={videoCandidates[vidIdx]}
                src={videoCandidates[vidIdx]}
                poster={poster || undefined}
                className="h-full w-full"
                controls
                playsInline
                onError={() => {
                  const next = vidIdx + 1;
                  if (next < videoCandidates.length) setVidIdx(next);
                }}
              />
            ) : (
              <img src={poster} alt={title} className="h-full w-full object-contain" />
            )
          ) : (
            <img
              key={imageCandidates[imgIdx] || poster}
              src={imageCandidates[imgIdx] || poster}
              alt={title}
              className="h-full w-full object-contain"
              onError={() => {
                const next = imgIdx + 1;
                if (next < imageCandidates.length) setImgIdx(next);
                else if (imageCandidates[imgIdx] !== poster) {
                  // Final fallback to poster
                  (e => ((e.target as HTMLImageElement).src = poster)) as any;
                }
              }}
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
            ) : ("unknown")}
          </div>

          <div className="mt-4 rounded-2xl border border-neutral-800 p-4">
            <div className="text-sm text-neutral-400">Price</div>
            <div className="mt-1 text-2xl font-semibold">{displayPrice ?? "—"}</div>

            {bestOffer ? (
              <div className="mt-2 text-sm text-neutral-400">
                Best offer: <span className="text-neutral-200">{bestOffer.price} {bestOffer.currency}</span>
              </div>
            ) : null}

            <div className="mt-3 flex gap-2">
              {!isOwner && (
                <button className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
                  disabled={!canBuy} onClick={handleBuyClick}>
                  Buy now
                </button>
              )}
              {isOwner && !listingId && (
                <button className="rounded-xl border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-900"
                  onClick={ownerListForSaleUSD}>
                  List for sale (USD)
                </button>
              )}
              <button className="rounded-xl border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-900"
                onClick={() => setShowOffer(true)}>
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
              <button key={t}
                className={`rounded-full border px-3 py-1 text-sm capitalize ${tab === t ? "border-neutral-500" : "border-neutral-800 hover:bg-neutral-900"}`}
                onClick={() => setTab(t)}>
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

              <div className="mt-6">
                <div className="mb-1 text-sm font-medium text-neutral-200">Blockchain details</div>
                <div className="grid grid-cols-2 gap-2 text-xs text-neutral-400">
                  <div className="rounded-lg border border-neutral-800 p-2">
                    <div className="text-neutral-500">Metadata URI</div>
                    <a className="truncate text-neutral-300 hover:underline"
                       href={ipfsToHttp(art.metadata_url || "")} target="_blank" rel="noreferrer">
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
                  <div key={a.id} className="flex items-center justify-between rounded-xl border border-neutral-800 p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-xs capitalize">{a.kind}</span>
                      <span className="text-neutral-300">{a.actor ? `${a.actor.slice(0, 6)}…${a.actor.slice(-4)}` : "Someone"}</span>
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

      {/* Traits */}
      <div className="mt-8">
        <div className="mb-2 text-lg font-semibold">Traits</div>
        {attributes.length ? (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {attributes.map((t, i) => {
              const key = `${t.trait_type}::${String(t.value)}`;
              const s = traitStats.find((x) => x.trait_type === t.trait_type && x.value === String(t.value));
              const pct = s ? Math.round((s.freq || 0) * 1000) / 10 : null;
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
                          <div className="text-[11px] text-neutral-500">{s?.count ?? 0} of {s?.total ?? 0}</div>
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
      {showCheckout && listing && (
        <CheckoutModal
          open={showCheckout}
          onClose={() => setShowCheckout(false)}
          onPurchased={refetchAll}
          artworkId={art.id}
          listingId={listingId || ""}
          title={title}
          price={String(currentPrice)}
          currency={currentCurrency}
          imageUrl={(imageCandidates[imgIdx] || poster)}
        />
      )}
      {showOffer && (
        <MakeOfferModal artworkId={art.id} onClose={() => setShowOffer(false)} onDone={refetchAll} />
      )}
    </div>
  );
}
