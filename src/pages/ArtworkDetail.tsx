import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { DEFAULT_COVER_URL, API_BASE } from "../lib/config";
import { ipfsToHttp } from "../lib/ipfs-url";
import { useAuth } from "../state/AuthContext";
import { Helmet } from "react-helmet-async"; // add: npm i react-helmet-async
import { useToast } from "../components/Toaster";

type Artwork = {
  id: string;
  owner: string;
  title: string | null;
  description: string | null;
  cover_url: string | null;
  status: "draft" | "published";
  media_kind: "image" | "video";
  image_cid: string | null;
  animation_cid: string | null;
  metadata_url: string | null;
  token_id: string | null;
  tx_hash: string | null;
  royalty_bps: number;
  sale_kind: "fixed" | "auction" | null;
  sale_currency: string | null;
  sale_price: string | null;
  created_at: string;
};

type Attr = { trait_type: string; value: string };
type Activity = {
  id: number;
  kind: "mint" | "list" | "unlist" | "offer" | "sale" | "transfer";
  tx_hash: string | null;
  created_at: string;
  data: any;
};

export default function ArtworkDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [art, setArt] = useState<Artwork | null>(null);
  const [attrs, setAttrs] = useState<Attr[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  // listing controls
  const isOwner = !!user && art?.owner === user.id;
  const [listPrice, setListPrice] = useState<string>("");

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const { data: a, error } = await supabase
          .from("artworks")
          .select("*")
          .eq("id", id)
          .single();
        if (error) throw error;
        setArt(a as any);

        const { data: at } = await supabase
          .from("artwork_attributes")
          .select("trait_type, value")
          .eq("artwork_id", id)
          .order("trait_type", { ascending: true });
        setAttrs((at || []) as any);

        const { data: act } = await supabase
          .from("activity")
          .select("*")
          .eq("artwork_id", id)
          .order("created_at", { ascending: false });
        setActivity((act || []) as any);
      } catch (e: any) {
        toast({ variant: "error", title: "Failed to load", description: String(e?.message || e) });
      } finally {
        setLoading(false);
      }
    })();
  }, [id, toast]);

  const mediaUrl = useMemo(() => {
    if (!art) return DEFAULT_COVER_URL;
    if (art.media_kind === "video" && art.animation_cid) {
      return ipfsToHttp(`ipfs://${art.animation_cid}`);
    }
    if (art.image_cid) return ipfsToHttp(`ipfs://${art.image_cid}`);
    return art.cover_url || DEFAULT_COVER_URL;
  }, [art]);

  async function doList() {
    if (!art || !user) return;
    try {
      const price = Number(listPrice);
      if (!Number.isFinite(price) || price <= 0) {
        toast({ variant: "error", title: "Enter a valid price in ETH" });
        return;
      }
      const r = await fetch(`${API_BASE.replace(/\/$/, "")}/api/activity/list`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artwork_id: art.id, actor: user.id, price: listPrice, currency: "ETH" })
      });
      if (!r.ok) throw new Error(await r.text());
      toast({ title: "Listed" });
      setArt({ ...(art as any), sale_kind: "fixed", sale_price: listPrice, sale_currency: "ETH" });
      setActivity([{ id: Date.now(), kind: "list", tx_hash: null, created_at: new Date().toISOString(), data: { price: listPrice, currency: "ETH" } }, ...activity]);
      setListPrice("");
    } catch (e: any) {
      toast({ variant: "error", title: "List failed", description: String(e?.message || e) });
    }
  }

  async function doUnlist() {
    if (!art || !user) return;
    try {
      const r = await fetch(`${API_BASE.replace(/\/$/, "")}/api/activity/unlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artwork_id: art.id, actor: user.id })
      });
      if (!r.ok) throw new Error(await r.text());
      toast({ title: "Unlisted" });
      setArt({ ...(art as any), sale_kind: null, sale_price: null });
      setActivity([{ id: Date.now(), kind: "unlist", tx_hash: null, created_at: new Date().toISOString(), data: {} }, ...activity]);
    } catch (e: any) {
      toast({ variant: "error", title: "Unlist failed", description: String(e?.message || e) });
    }
  }

  async function doOffer(val?: string) {
    if (!art || !user) return;
    const price = val ?? prompt("Offer price (ETH)") ?? "";
    if (!price) return;
    try {
      const r = await fetch(`${API_BASE.replace(/\/$/, "")}/api/activity/offer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artwork_id: art.id, actor: user.id, price, currency: "ETH" })
      });
      if (!r.ok) throw new Error(await r.text());
      toast({ title: "Offer submitted" });
      setActivity([{ id: Date.now(), kind: "offer", tx_hash: null, created_at: new Date().toISOString(), data: { price, currency: "ETH" } }, ...activity]);
    } catch (e: any) {
      toast({ variant: "error", title: "Offer failed", description: String(e?.message || e) });
    }
  }

  async function markSold() {
    if (!art || !user) return;
    const price = prompt("Sold price (ETH)") ?? "";
    if (!price) return;
    const tx = prompt("Optional tx hash (if sold on-chain)") ?? "";
    try {
      const r = await fetch(`${API_BASE.replace(/\/$/, "")}/api/activity/sale`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artwork_id: art.id, actor: user.id, price, currency: "ETH", tx_hash: tx || null })
      });
      if (!r.ok) throw new Error(await r.text());
      toast({ title: "Sale recorded" });
      setArt({ ...(art as any), sale_kind: null, sale_price: null });
      setActivity([{ id: Date.now(), kind: "sale", tx_hash: tx || null, created_at: new Date().toISOString(), data: { price, currency: "ETH" } }, ...activity]);
    } catch (e: any) {
      toast({ variant: "error", title: "Record sale failed", description: String(e?.message || e) });
    }
  }

  // SEO / OG
  const ogTitle = art?.title || "Artwork";
  const ogDesc = art?.description || "View artwork on Taedal";
  const ogImage = art?.media_kind === 'video' ? (art?.cover_url || DEFAULT_COVER_URL) : mediaUrl;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Helmet>
        <title>{ogTitle} • Taedal</title>
        <meta name="description" content={ogDesc} />
        <meta property="og:title" content={ogTitle} />
        <meta property="og:description" content={ogDesc} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:type" content="article" />
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:title" content={ogTitle} />
        <meta property="twitter:description" content={ogDesc} />
        <meta property="twitter:image" content={ogImage} />
      </Helmet>

      {loading && <div className="text-neutral-400">Loading…</div>}
      {!loading && !art && <div className="text-neutral-400">Not found.</div>}
      {!loading && art && (
        <div className="grid gap-6 md:grid-cols-[1.1fr,0.9fr]">
          {/* Media */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            {art.media_kind === "video" ? (
              <video src={mediaUrl} controls className="w-full rounded-xl" />
            ) : (
              <img src={mediaUrl} className="w-full rounded-xl object-contain" />
            )}
          </div>

          {/* Side panel */}
          <div>
            <div className="mb-3 text-2xl font-semibold">{art.title || "Untitled"}</div>

            <div className="rounded-2xl border border-neutral-800 p-4">
              <div className="text-sm text-neutral-400 mb-1">Price</div>
              {art.sale_kind === "fixed" && art.sale_price ? (
                <div className="flex items-center gap-3">
                  <div className="text-lg">{art.sale_price} {art.sale_currency || "ETH"}</div>
                  <button className="rounded-lg bg-white px-3 py-1.5 text-sm text-black"
                    onClick={() => doOffer(art.sale_price)}>Buy now</button>
                  <button className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm"
                    onClick={() => doOffer()}>Make offer</button>
                </div>
              ) : (
                <div className="text-neutral-500 text-sm">—</div>
              )}

              {/* Owner controls */}
              {isOwner && (
                <div className="mt-4 space-y-2">
                  <div className="text-xs text-neutral-400">Owner controls</div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.0001"
                      placeholder="List price (ETH)"
                      value={listPrice}
                      onChange={(e)=>setListPrice(e.target.value)}
                      className="w-40 rounded-xl border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm"
                    />
                    <button onClick={doList} className="rounded-lg bg-white px-3 py-1.5 text-sm text-black">List</button>
                    <button onClick={doUnlist} className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm">Unlist</button>
                    <button onClick={markSold} className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm">Mark sold</button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 rounded-2xl border border-neutral-800 p-4">
              <div className="text-sm text-neutral-400 mb-1">About</div>
              <div className="text-sm">{art.description || "—"}</div>
            </div>

            <div className="mt-4 rounded-2xl border border-neutral-800 p-4 text-sm">
              <div className="text-neutral-400 mb-2">Blockchain details</div>
              <div className="flex flex-col gap-2">
                <div className="truncate"><span className="text-neutral-400 mr-2">Metadata URI</span>{art.metadata_url || "—"}</div>
                <div className="truncate"><span className="text-neutral-400 mr-2">Tx hash</span>{art.tx_hash || "—"}</div>
                <div className="truncate"><span className="text-neutral-400 mr-2">Token ID</span>{art.token_id || "—"}</div>
                <div className="truncate"><span className="text-neutral-400 mr-2">Royalty</span>{((art.royalty_bps || 0)/100).toFixed(2)}%</div>
              </div>
            </div>
          </div>

          {/* Traits */}
          <div className="md:col-span-2 mt-2">
            <h2 className="mb-2 text-lg font-semibold">Traits</h2>
            {attrs.length === 0 ? (
              <div className="text-sm text-neutral-500">No traits.</div>
            ) : (
              <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                {attrs.map((t, i) => (
                  <li key={i} className="rounded-xl border border-neutral-800 p-3">
                    <div className="text-xs text-neutral-400">{t.trait_type}</div>
                    <div className="text-neutral-200">{t.value}</div>
                    {/* Optionally you can fetch rarity here from trait_stats_mat */}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Activity */}
          <div className="md:col-span-2 mt-6">
            <h2 className="mb-2 text-lg font-semibold">Activity</h2>
            {activity.length === 0 ? (
              <div className="text-sm text-neutral-500">No activity yet.</div>
            ) : (
              <ul className="space-y-2">
                {activity.map(a => (
                  <li key={a.id} className="rounded-xl border border-neutral-800 p-3 text-sm flex items-center justify-between">
                    <div>
                      <span className="capitalize font-medium">{a.kind}</span>
                      {a.data?.price ? <span className="ml-2 text-neutral-400">{a.data.price} {a.data.currency || 'ETH'}</span> : null}
                      {a.tx_hash ? <span className="ml-2 text-neutral-500 truncate">tx {a.tx_hash}</span> : null}
                    </div>
                    <div className="text-xs text-neutral-500">{new Date(a.created_at).toLocaleString()}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
