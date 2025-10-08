// src/pages/ArtworkDetail.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ipfsToHttp } from "../lib/ipfs-url";
import { DEFAULT_COVER_URL } from "../lib/config";

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

type TraitStat = {
  trait_type: string;
  value: string;
  count: number;
  total: number;
  freq: number; // 0..1
};

type Act = {
  id: string;
  kind: "mint" | "list" | "sale" | "bid" | "transfer";
  tx_hash: string | null;
  price_eth: string | number | null;
  actor: string | null;
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
      } catch (e) {
        console.warn("[metadata] fetch failed:", e);
        if (!aborted) setMeta(null);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [art?.metadata_url]);

  // 3) Activity for this artwork
  useEffect(() => {
    if (!art?.id) return;
    (async () => {
      const { data, error } = await supabase
        .from("activity")
        .select("*")
        .eq("artwork_id", art.id)
        .order("created_at", { ascending: false });
      if (!error && data) setActs(data as Act[]);
    })();
  }, [art?.id]);

  // 4) Rarity stats (materialized view)
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("trait_stats_mv").select("*");
      if (!error && data) setTraitStats(data as TraitStat[]);
    })();
  }, []);

  // 5) Media + rarity map
  const media = useMemo(() => {
    if (!art) return { kind: "image" as const, poster: DEFAULT_COVER_URL, src: "" };
    const poster = art.cover_url || DEFAULT_COVER_URL;

    // Solid DB cids first
    if (art.media_kind === "video" && art.animation_cid) {
      return { kind: "video" as const, poster, src: ipfsToHttp(`ipfs://${art.animation_cid}`) };
    }
    if (art.image_cid) {
      return { kind: "image" as const, poster, src: ipfsToHttp(`ipfs://${art.image_cid}`) };
    }

    // Fallback to metadata
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

  // Early returns AFTER hooks
  if (loading) return <Skeleton />;
  if (err) return <div className="p-6 text-red-400">Error: {err}</div>;
  if (!art) return <div className="p-6 text-neutral-400">Artwork not found.</div>;

  const title = art.title || meta?.name || "Untitled";
  const desc = art.description || meta?.description || "";
  const royaltyPct = ((art.royalty_bps || 0) / 100).toFixed(2);
  const price =
    art.sale_kind === "fixed" && art.sale_price
      ? `${art.sale_price} ${art.sale_currency || "ETH"}`
      : null;

  const attributes: Attribute[] = Array.isArray(meta?.attributes) ? meta!.attributes! : [];

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
            <div className="mt-1 text-2xl font-semibold">{price ?? "—"}</div>
            <div className="mt-3 flex gap-2">
              <button
                className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
                disabled={!price}
              >
                Buy now
              </button>
              <button className="rounded-xl border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-900">
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
        {Array.isArray(meta?.attributes) && meta!.attributes!.length ? (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {meta!.attributes!.map((t, i) => {
              const key = `${t.trait_type}::${String(t.value)}`;
              const s = rarityMap.get(key);
              const pct = s ? Math.round((s.freq || 0) * 1000) / 10 : null; // e.g., 12.3%
              return (
                <li key={i} className="rounded-xl border border-neutral-800 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-neutral-500">
                        {t.trait_type}
                      </div>
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
    </div>
  );
}
