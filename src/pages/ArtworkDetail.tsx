import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ipfsToHttp } from "../lib/ipfs-url";
import { DEFAULT_COVER_URL } from "../lib/config";

type Attribute = { trait_type: string; value: string | number };
type Metadata = {
  name?: string;
  description?: string;
  image?: string;           // ipfs://... or http(s)
  animation_url?: string;   // ipfs://... or http(s)
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

  // 1) Load the artwork row
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

  // 2) Fetch metadata JSON (traits, image/animation fallbacks)
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
    return () => { aborted = true; };
  }, [art?.metadata_url]);

  // 3) Decide which media to show (DB CIDs first, then metadata)
  const media = useMemo(() => {
    if (!art) {
      return { kind: "image" as const, poster: DEFAULT_COVER_URL, src: "" };
    }

    const poster = art.cover_url || DEFAULT_COVER_URL;

    // Prefer DB-provided CIDs
    if (art.media_kind === "video" && art.animation_cid) {
      return { kind: "video" as const, poster, src: ipfsToHttp(`ipfs://${art.animation_cid}`) };
    }
    if (art.image_cid) {
      return { kind: "image" as const, poster, src: ipfsToHttp(`ipfs://${art.image_cid}`) };
    }

    // Fallback to metadata
    const metaAnim = meta?.animation_url ? ipfsToHttp(meta.animation_url) : "";
    const metaImg  = meta?.image ? ipfsToHttp(meta.image) : "";

    if (metaAnim) return { kind: "video" as const, poster, src: metaAnim };
    if (metaImg)  return { kind: "image" as const, poster, src: metaImg };

    return { kind: "image" as const, poster, src: poster };
  }, [art, meta]);

  if (loading) return <Skeleton />;
  if (err) return <div className="p-6 text-red-400">Error: {err}</div>;
  if (!art) return <div className="p-6 text-neutral-400">Artwork not found.</div>;

  const title = art.title || meta?.name || "Untitled";
  const desc  = art.description || meta?.description || "";
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

          {/* Buy box */}
          <div className="mt-4 rounded-2xl border border-neutral-800 p-4">
            <div className="text-sm text-neutral-400">Price</div>
            <div className="mt-1 text-2xl font-semibold">
              {price ? price : "—"}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={!price}
                className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
                title={price ? "Buy now (coming soon)" : "Not listed"}
              >
                Buy now
              </button>
              <button
                type="button"
                className="rounded-xl border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-900"
                title="Offers coming soon"
              >
                Make offer
              </button>
            </div>

            <div className="mt-3 text-xs text-neutral-500">
              Royalty: {royaltyPct}% • Token ID: {art.token_id ?? "—"}
            </div>
          </div>

          {/* Description */}
          {desc && (
            <div className="mt-6">
              <div className="mb-1 text-sm font-medium text-neutral-200">About</div>
              <div className="whitespace-pre-wrap text-sm text-neutral-300">
                {desc}
              </div>
            </div>
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
      </div>

      {/* Traits */}
      <div className="mt-8">
        <div className="mb-2 text-lg font-semibold">Traits</div>
        {attributes.length ? (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {attributes.map((t, i) => (
              <li key={i} className="rounded-xl border border-neutral-800 p-3">
                <div className="text-xs uppercase tracking-wide text-neutral-500">
                  {t.trait_type}
                </div>
                <div className="text-sm text-neutral-200">{String(t.value)}</div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-neutral-400">No traits.</div>
        )}
      </div>
    </div>
  );
}
