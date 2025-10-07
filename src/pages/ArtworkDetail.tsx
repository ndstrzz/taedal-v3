import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { updateSEO } from "../lib/seo";

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
  // join
  profiles?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

function ipfsUrl(cid?: string | null) {
  return cid ? `https://ipfs.io/ipfs/${cid}` : "";
}

export default function ArtworkDetail() {
  const { id = "" } = useParams();
  const [art, setArt] = useState<ArtworkRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

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
        setArt(null);
        return;
      }
      if (!data) {
        setErr("Not found.");
        setArt(null);
        return;
      }
      setArt(data as unknown as ArtworkRow);
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const image = useMemo(() => art?.cover_url || ipfsUrl(art?.image_cid), [art]);

  // SEO — when artwork is loaded
  useEffect(() => {
    if (!art) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    updateSEO({
      title: `${art.title || "Untitled"} | taedal`,
      description: art.description || "Artwork on taedal",
      image: image || `${origin}/brand/og-default.jpg`,
      url: `${origin}/a/${encodeURIComponent(art.id)}`,
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
            <img src={image} className="w-full object-cover" alt={art.title ?? ""} />
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
              className="h-10 w-10 rounded-full object-cover bg-neutral-900"
              alt=""
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

          {art.description ? (
            <p className="whitespace-pre-line text-neutral-300">{art.description}</p>
          ) : (
            <p className="text-neutral-400">No description provided.</p>
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
                  href={
                    art.metadata_url.startsWith("ipfs://")
                      ? art.metadata_url.replace("ipfs://", "https://ipfs.io/ipfs/")
                      : art.metadata_url
                  }
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
