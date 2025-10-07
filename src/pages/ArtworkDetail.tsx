import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { updateSEO } from "../lib/seo";

/* ---------- helpers ---------- */

function toGateway(u?: string | null) {
  if (!u) return "";
  if (u.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${u.slice(7)}`;
  // Bare CID (rough test)
  if (/^[A-Za-z0-9]{46,}$/.test(u)) return `https://ipfs.io/ipfs/${u}`;
  return u;
}
function ipfsCidToHttp(cid?: string | null) {
  return cid ? `https://ipfs.io/ipfs/${cid}` : "";
}

type ArtworkRow = {
  id: string;
  title: string | null;
  description: string | null;
  cover_url: string | null;
  image_cid: string | null;
  metadata_url: string | null;
  tx_hash: string | null;
  token_id: string | null;
  owner: string;
  created_at: string;
  profiles?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

type NftMetadata = {
  image?: string;
  name?: string;
  description?: string;
  // allow unknown extra fields
  [k: string]: any;
};

export default function ArtworkDetail() {
  const { id = "" } = useParams();

  const [art, setArt] = useState<ArtworkRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [meta, setMeta] = useState<NftMetadata | null>(null);

  /* load artwork */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);

      const { data, error } = await supabase
        .from("artworks")
        .select(
          "id,title,description,cover_url,image_cid,metadata_url,tx_hash,token_id,owner,created_at,profiles:owner ( username,display_name,avatar_url )"
        )
        .eq("id", id)
        .maybeSingle();

      if (cancelled) return;
      setLoading(false);

      if (error) {
        setErr(error.message);
        return;
      }
      if (!data) {
        setErr("Not found.");
        return;
      }
      setArt(data as unknown as ArtworkRow);
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  /* fetch metadata JSON (for image fallback) */
  useEffect(() => {
    if (!art?.metadata_url) {
      setMeta(null);
      return;
    }

    const url = toGateway(art.metadata_url);
    if (!url) return;

    let cancelled = false;
    const ac = new AbortController();

    (async () => {
      try {
        // modest timeout so UI never “hangs”
        const t = setTimeout(() => ac.abort(), 8000);
        const r = await fetch(url, { signal: ac.signal });
        clearTimeout(t);
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as NftMetadata;
        if (!cancelled) setMeta(j || null);
      } catch {
        if (!cancelled) setMeta(null);
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [art?.metadata_url]);

  /* choose best image source */
  const image = useMemo(() => {
    return (
      art?.cover_url ||
      ipfsCidToHttp(art?.image_cid) ||
      toGateway(meta?.image) ||
      ""
    );
  }, [art?.cover_url, art?.image_cid, meta?.image]);

  /* SEO */
  useEffect(() => {
    if (!art) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const title = art.title || "Untitled artwork";
    updateSEO({
      title: `${title} | taedal`,
      description: art.description || "Artwork on taedal",
      image: image || `${origin}/brand/og-default.jpg`,
      url: `${origin}/a/${art.id}`,
      type: "article",
    });
  }, [art, image]);

  if (loading) return <div className="p-8 text-neutral-400">Loading…</div>;
  if (err) return <div className="p-8 text-neutral-400">{err}</div>;
  if (!art) return <div className="p-8 text-neutral-400">Not found.</div>;

  const ownerName =
    art.profiles?.display_name ||
    (art.profiles?.username ? `@${art.profiles.username}` : "Creator");

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900">
          {image ? (
            <img src={image} alt={art.title ?? ""} className="w-full object-cover" />
          ) : (
            <div className="grid aspect-square w-full place-items-center text-neutral-500">
              No image
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h1 className="text-2xl font-semibold">{art.title || "Untitled"}</h1>

          <div className="flex items-center gap-3">
            <img
              src={art.profiles?.avatar_url || "/brand/taedal-logo.svg"}
              className="h-10 w-10 rounded-full object-cover"
            />
            <div>
              <div className="text-sm text-neutral-300">{ownerName}</div>
              {art.profiles?.username && (
                <Link
                  to={`/@${art.profiles.username}`}
                  className="text-xs text-neutral-400 underline"
                >
                  @{art.profiles.username}
                </Link>
              )}
            </div>
          </div>

          {art.description && (
            <p className="whitespace-pre-line text-neutral-300">{art.description}</p>
          )}

          <div className="space-y-1 text-sm text-neutral-400">
            {art.token_id && (
              <div>
                Token ID: <span className="text-neutral-200">{art.token_id}</span>
              </div>
            )}
            {art.tx_hash && (
              <div className="truncate">
                tx:{" "}
                <a
                  className="underline"
                  href={`https://sepolia.etherscan.io/tx/${art.tx_hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {art.tx_hash}
                </a>
              </div>
            )}
            {art.metadata_url && (
              <div className="truncate">
                metadata:{" "}
                <a
                  className="underline"
                  href={toGateway(art.metadata_url)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {art.metadata_url}
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
