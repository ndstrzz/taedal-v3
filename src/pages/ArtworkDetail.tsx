// src/pages/ArtworkDetail.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { DEFAULT_COVER_URL } from "../lib/config";
import { ipfsToHttp } from "../lib/ipfs-url";

type ArtworkRow = {
  id: string;
  owner: string;
  title: string | null;
  description: string | null;
  cover_url: string | null;
  image_cid: string | null;
  animation_cid: string | null;
  metadata_url: string | null;
  sale_kind: "fixed" | "auction" | null;
  sale_currency: string | null;
  sale_price: string | null;
  royalty_bps: number | null;
  token_id: string | null;
  tx_hash: string | null;
  created_at?: string;
};

type MetaAttr = { trait_type?: string; value?: string | number; display_type?: string };
type Metadata = {
  name?: string;
  description?: string;
  image?: string;
  animation_url?: string;
  attributes?: MetaAttr[];
  properties?: any;
};

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-800 p-3">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-sm text-neutral-100">{value}</div>
    </div>
  );
}

function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-neutral-800">
      <button
        className="flex w-full items-center justify-between px-4 py-3 text-sm hover:bg-neutral-900"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <span className="font-medium text-neutral-200">{title}</span>
        <span className="text-neutral-500">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="border-t border-neutral-800 p-4">{children}</div>}
    </div>
  );
}

export default function ArtworkDetail() {
  const { id } = useParams();
  const [row, setRow] = useState<ArtworkRow | null>(null);
  const [meta, setMeta] = useState<Metadata | null>(null);
  const [loading, setLoading] = useState(true);

  // Load DB row
  useEffect(() => {
    let dead = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.from("artworks").select("*").eq("id", id).single();
      if (error) console.error(error);
      if (!dead) setRow((data as any) || null);
      setLoading(false);
    })();
    return () => {
      dead = true;
    };
  }, [id]);

  // Load on-chain metadata JSON
  useEffect(() => {
    let dead = false;
    (async () => {
      if (!row?.metadata_url) {
        setMeta(null);
        return;
      }
      try {
        const url = ipfsToHttp(row.metadata_url);
        const r = await fetch(url, { cache: "no-store" });
        const j = (await r.json()) as Metadata;
        if (!dead) setMeta(j);
      } catch (e) {
        console.warn("meta fetch failed", e);
        if (!dead) setMeta(null);
      }
    })();
    return () => {
      dead = true;
    };
  }, [row?.metadata_url]);

  const media = useMemo(() => {
    const imageHttp =
      meta?.image
        ? ipfsToHttp(meta.image)
        : row?.image_cid
        ? ipfsToHttp(`ipfs://${row.image_cid}`)
        : row?.cover_url || DEFAULT_COVER_URL;

    const animHttp =
      meta?.animation_url
        ? ipfsToHttp(meta.animation_url)
        : row?.animation_cid
        ? ipfsToHttp(`ipfs://${row.animation_cid}`)
        : "";

    return { imageHttp, animHttp };
  }, [meta?.image, meta?.animation_url, row?.image_cid, row?.animation_cid, row?.cover_url]);

  const attrs = useMemo<MetaAttr[]>(() => meta?.attributes || [], [meta?.attributes]);

  const priceLabel = useMemo(() => {
    if (row?.sale_kind === "fixed" && row?.sale_price) {
      return `${row.sale_price} ${row.sale_currency || "ETH"}`;
    }
    if (row?.sale_kind === "auction") return "Auction";
    return "—";
  }, [row?.sale_kind, row?.sale_price, row?.sale_currency]);

  if (loading) {
    return <div className="mx-auto max-w-6xl p-6 text-sm text-neutral-400">Loading…</div>;
  }
  if (!row) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="rounded-xl border border-neutral-800 p-6 text-sm text-neutral-400">
          Artwork not found. <Link to="/" className="underline">Go home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl gap-6 p-4 md:grid md:grid-cols-12">
      {/* Media (left) */}
      <div className="md:col-span-7">
        <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900">
          {media.animHttp ? (
            <video src={media.animHttp} controls className="h-full w-full" />
          ) : (
            <img src={media.imageHttp} className="h-full w-full object-contain" />
          )}
        </div>
      </div>

      {/* Right rail */}
      <div className="md:col-span-5 md:pl-2">
        <div className="mb-3 text-xs text-neutral-500">TOKEN #{row.token_id ?? "—"}</div>
        <h1 className="mb-2 text-xl font-semibold text-neutral-100">{row.title || meta?.name || "Untitled"}</h1>

        <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
          <Stat label="Top offer" value="—" />
          <Stat label="Collection floor" value="—" />
          <Stat label="Rarity" value="—" />
          <Stat label="Last sale" value="—" />
        </div>

        <div className="mb-4 rounded-2xl border border-neutral-800 p-4">
          <div className="text-xs text-neutral-400">Buy for</div>
          <div className="mb-3 text-2xl font-semibold text-neutral-100">{priceLabel}</div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={row.sale_kind !== "fixed" || !row.sale_price}
              className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
              onClick={() => alert("Buy flow to be wired")}
            >
              Buy now
            </button>
            <button
              type="button"
              className="rounded-xl border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-900"
              onClick={() => alert("Make offer (TBD)")}
            >
              Make offer
            </button>
          </div>
          {row.royalty_bps != null && (
            <div className="mt-3 text-xs text-neutral-500">Royalty: {(row.royalty_bps / 100).toFixed(2)}%</div>
          )}
        </div>

        {!!attrs?.length && (
          <div className="mb-4">
            <div className="mb-2 text-sm font-medium text-neutral-200">Traits</div>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {attrs.map((a, i) => (
                <li key={i} className="rounded-xl border border-neutral-800 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-neutral-500">{a.trait_type || "Trait"}</div>
                  <div className="truncate text-sm text-neutral-100">{String(a.value ?? "—")}</div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-3">
          <Section title="Details" defaultOpen>
            <div className="space-y-2 text-sm text-neutral-300">
              {row.description ? (
                <p className="whitespace-pre-line">{row.description}</p>
              ) : meta?.description ? (
                <p className="whitespace-pre-line">{meta.description}</p>
              ) : (
                <p className="text-neutral-400">No description.</p>
              )}
              <div className="grid grid-cols-2 gap-3 text-xs text-neutral-400">
                <div>
                  <div className="text-neutral-500">Owner</div>
                  <div className="truncate">{row.owner}</div>
                </div>
                <div>
                  <div className="text-neutral-500">Tx</div>
                  {row.tx_hash ? (
                    <a
                      className="truncate underline"
                      href={`https://sepolia.etherscan.io/tx/${row.tx_hash}`}
                      target="_blank"
                    >
                      {row.tx_hash.slice(0, 10)}…
                    </a>
                  ) : (
                    <div>—</div>
                  )}
                </div>
              </div>
            </div>
          </Section>

          <Section title="Orders">
            <div className="text-sm text-neutral-400">Listings / bids UI stub (to be wired).</div>
          </Section>

          <Section title="Activity">
            <div className="text-sm text-neutral-400">Sales & transfers history coming soon.</div>
          </Section>
        </div>
      </div>
    </div>
  );
}
