import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../state/AuthContext";
import { supabase } from "../lib/supabase";
import { DEFAULT_COVER_URL, API_BASE } from "../lib/config";
import { pinFileViaServerWithProgress } from "../lib/ipfs";
import { useToast } from "../components/Toaster";
import { Skeleton } from "../components/Skeleton";
import DropZone from "../components/DropZone";
import MintWalletModal from "../components/MintWalletModal";
import { mintWithMetaMask, WalletError } from "../lib/eth";

type SimilarRecord = {
  id: string;
  title: string | null;
  username?: string | null;
  user_id?: string | null;
  image_url?: string | null;
  score?: number;
};

const ACCEPT = "image/png,image/jpeg,image/webp,video/mp4";
const MAX_MB = 25;

function fmtMB(bytes: number) {
  return (bytes / (1024 * 1024)).toFixed(1) + "MB";
}

export default function CreateArtwork() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  const [checking, setChecking] = useState(false);
  const [candidates, setCandidates] = useState<SimilarRecord[] | null>(null);
  const [ackOriginal, setAckOriginal] = useState(false);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number>(0);

  // mint modal state
  const [mintOpen, setMintOpen] = useState(false);
  const [mintBusy, setMintBusy] = useState(false);
  const [mintErr, setMintErr] = useState<string | null>(null);

  // values for DB insert after mint
  const [pendingMetaUrl, setPendingMetaUrl] = useState<string>("");
  const [pendingImageCid, setPendingImageCid] = useState<string>("");
  const [pendingCoverUrl, setPendingCoverUrl] = useState<string>("");
  const [pendingArtworkNum, setPendingArtworkNum] = useState<number | null>(null);
  const [pendingDHash, setPendingDHash] = useState<string>("");
  const [pendingSha256, setPendingSha256] = useState<string>("");

  // skeleton
  const [initializing, setInitializing] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setInitializing(false), 200);
    return () => clearTimeout(t);
  }, []);

  // Preview blob URL
  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const mustAcknowledge = (candidates?.length ?? 0) > 0;

  const canSubmit = useMemo(
    () =>
      !!file &&
      !!title.trim() &&
      !busy &&
      !checking &&
      (!mustAcknowledge || ackOriginal),
    [file, title, busy, checking, mustAcknowledge, ackOriginal]
  );

  // intake & validation
  const handleNewFile = useCallback(
    (f: File) => {
      if (!ACCEPT.split(",").includes(f.type)) {
        toast({
          variant: "error",
          title: "Unsupported file type",
          description: `Got ${f.type}. Allowed: ${ACCEPT.replaceAll("image/", "").replaceAll("video/", "")}`,
        });
        return;
      }
      if (f.size > MAX_MB * 1024 * 1024) {
        toast({
          variant: "error",
          title: "File too large",
          description: `Max ${MAX_MB}MB, got ${fmtMB(f.size)}.`,
        });
        return;
      }
      setFile(f);
      setCandidates(null);
      setAckOriginal(false);
    },
    [toast]
  );

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleNewFile(f);
      e.currentTarget.value = "";
    },
    [handleNewFile]
  );

  // Auto similarity check — send field name "artwork"
  useEffect(() => {
    if (!file) return;
    if (!API_BASE) {
      toast({
        variant: "error",
        title: "API not configured",
        description: "Missing API_BASE in window.__CONFIG__",
      });
      return;
    }
    (async () => {
      setChecking(true);
      setCandidates(null);
      try {
        const fd = new FormData();
        fd.append("artwork", file); // IMPORTANT
        const r = await fetch(`${API_BASE.replace(/\/$/, "")}/api/verify`, {
          method: "POST",
          body: fd,
        });
        if (!r.ok) throw new Error(`Similarity check failed (${r.status})`);
        const out = (await r.json()) as { similar?: SimilarRecord[]; matches?: SimilarRecord[] };
        const results = Array.isArray(out?.similar) ? out.similar : (out?.matches || []);
        setCandidates(results);
        if (results.length > 0) {
          toast({
            title: "Possible matches found",
            description: "Review below and confirm you’re the original creator.",
          });
        } else {
          toast({ variant: "success", title: "No near-duplicates found" });
        }
      } catch (err: any) {
        toast({
          variant: "error",
          title: "Similarity check error",
          description: String(err.message || err),
        });
        setCandidates([]); // allow continue
      } finally {
        setChecking(false);
      }
    })();
  }, [file, toast]);

  // Create → upload + metadata → open wallet modal
  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user) {
        toast({ variant: "error", title: "Please log in to create" });
        return;
      }
      if (!file) {
        toast({ variant: "error", title: "Select a file" });
        return;
      }
      if (!API_BASE) {
        toast({
          variant: "error",
          title: "API not configured",
          description: "Missing API_BASE in window.__CONFIG__",
        });
        return;
      }

      setBusy(true);
      setProgress(0);

      try {
        // 1) Pin primary media
        let lastShown = 0;
        const pin = await pinFileViaServerWithProgress(file, file.name, (ratio) => {
          const pct = Math.round(ratio * 100);
          if (pct - lastShown >= 2 || pct === 100) {
            setProgress(Math.min(99, pct));
            lastShown = pct;
          }
        });
        setProgress(100);
        toast({ variant: "success", title: "Pinned media to IPFS" });

        setPendingImageCid(pin.cid);
        setPendingCoverUrl(pin.gatewayUrl || DEFAULT_COVER_URL);

        // 2) Hashes — store for DB insert
        const fd1 = new FormData();
        fd1.append("file", file);
        const r1 = await fetch(`${API_BASE.replace(/\/$/, "")}/api/hashes`, {
          method: "POST",
          body: fd1,
        });
        if (!r1.ok) throw new Error(`Failed to compute hashes (${r1.status})`);
        const { dhash64, sha256 } = await r1.json();
        setPendingDHash(dhash64 || "");
        setPendingSha256(sha256 || "");
        toast({ title: "Computed hashes", description: "Perceptual + SHA256" });

        // 3) Metadata (just name/desc/imageCid)
        const r2 = await fetch(`${API_BASE.replace(/\/$/, "")}/api/metadata`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: title.trim(),
            description: description.trim(),
            imageCid: pin.cid,
          }),
        });
        if (!r2.ok) throw new Error(`Failed to pin metadata (${r2.status})`);
        const metaOut = await r2.json();
        const metadataUri =
          metaOut?.gatewayUrl?.replace("https://gateway.pinata.cloud/ipfs/", "ipfs://") ||
          metaOut?.ipfsUri ||
          `ipfs://${metaOut?.metadata_cid}`;
        toast({ variant: "success", title: "Pinned metadata" });

        setPendingMetaUrl(metadataUri);
        setPendingArtworkNum(Math.floor(Date.now() / 1000));
        setMintErr(null);
        setMintOpen(true);
      } catch (err: any) {
        toast({
          variant: "error",
          title: "Create failed",
          description: String(err.message || err),
        });
        setBusy(false);
        setProgress(0);
      }
    },
    [user, file, title, description, toast]
  );

  // Mint via MetaMask, then insert DB row (now includes hashes)
  async function handleMintWithMetaMask() {
    try {
      setMintBusy(true);
      setMintErr(null);
      const artworkNum = pendingArtworkNum ?? Math.floor(Date.now() / 1000);
      const { txHash, tokenId } = await mintWithMetaMask(pendingMetaUrl, artworkNum);

      toast({
        variant: "success",
        title: "Minted on-chain",
        description: `tx: ${txHash.slice(0, 10)}…`,
      });

      const { data: inserted, error: dberr } = await supabase
        .from("artworks")
        .insert({
          owner: user!.id,
          title: title.trim(),
          description: description.trim(),
          cover_url: pendingCoverUrl || DEFAULT_COVER_URL,
          status: "published",
          image_cid: pendingImageCid,
          metadata_url: pendingMetaUrl,
          token_id: tokenId,
          tx_hash: txHash,
          dhash64: pendingDHash || null,
          sha256: pendingSha256 || null,
        })
        .select("*")
        .single();

      if (dberr) throw dberr;

      setMintOpen(false);
      setBusy(false);
      navigate(`/a/${inserted.id}`, { replace: true });
    } catch (e: any) {
      const msg = e instanceof WalletError ? e.message : (e?.message || String(e));
      setMintErr(msg);
    } finally {
      setMintBusy(false);
    }
  }

  if (initializing) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Skeleton className="mb-6 h-8 w-2/3" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Skeleton className="aspect-square" />
          <div className="space-y-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-28" />
            <Skeleton className="h-10 w-40" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-6 text-2xl font-semibold">Create artwork</h1>

      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Left: media */}
        <div>
          <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900">
            {previewUrl ? (
              <img src={previewUrl} alt="preview" className="w-full object-cover" />
            ) : (
              <DropZone
                onSelect={handleNewFile}
                accept={ACCEPT}
                className="aspect-square grid place-items-center"
                ariaLabel="Upload artwork media"
              >
                <div className="mx-6 rounded-2xl border border-dashed border-neutral-700 p-8 text-center">
                  <div className="text-sm text-neutral-300">Drag & drop your image/video</div>
                  <div className="mt-1 text-xs text-neutral-500">
                    or click to browse — PNG, JPG, WEBP or MP4 · up to {MAX_MB}MB
                  </div>
                </div>
              </DropZone>
            )}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              onChange={onPick}
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-black"
            />
            {file && (
              <span className="text-xs text-neutral-400">
                {file.type} • {fmtMB(file.size)}
              </span>
            )}
          </div>

          {checking && (
            <div className="mt-3 text-xs text-neutral-400">Checking for similar works…</div>
          )}
        </div>

        {/* Right: details */}
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm text-neutral-300">Title</span>
            <input
              className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Your artwork title"
              required
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-neutral-300">Description</span>
            <textarea
              className="min-h-[120px] w-full resize-y rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell collectors about the piece…"
            />
          </label>

          {busy && (
            <div className="mt-2">
              <div className="mb-1 text-xs text-neutral-400">Uploading & preparing…</div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
                <div
                  className="h-full bg-white transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {(candidates?.length ?? 0) > 0 && (
            <label className="flex items-start gap-3 rounded-2xl border border-yellow-600/40 bg-yellow-500/10 p-3 text-sm text-yellow-100">
              <input
                type="checkbox"
                checked={ackOriginal}
                onChange={(e) => setAckOriginal(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                I confirm I am the original creator or have the rights to mint and list this artwork.
              </span>
            </label>
          )}

          <div className="pt-2">
            <button
              className="rounded-xl bg-white px-4 py-2 font-medium text-black disabled:opacity-60"
              disabled={!canSubmit}
            >
              {busy ? "Preparing…" : "Create & publish"}
            </button>
          </div>
        </div>
      </form>

      {/* Similarity results */}
      {candidates && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Possible matches</h2>
          {candidates.length === 0 ? (
            <div className="text-sm text-neutral-400">No similar artworks found.</div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {candidates.map((c) => (
                <li key={c.id} className="rounded-xl border border-neutral-800 p-3">
                  <div className="mb-2 aspect-square overflow-hidden rounded-lg bg-neutral-900">
                    {c.image_url ? (
                      <img src={c.image_url} className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-xs text-neutral-500">
                        No preview
                      </div>
                    )}
                  </div>
                  <div className="truncate text-sm font-medium">{c.title || "Untitled"}</div>
                  {c.username && (
                    <div className="truncate text-xs text-neutral-400">@{c.username}</div>
                  )}
                  {typeof c.score === "number" && (
                    <div className="mt-1 text-xs text-neutral-500">score: {c.score.toFixed(2)}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Mint wallet modal */}
      <MintWalletModal
        open={mintOpen}
        busy={mintBusy}
        error={mintErr || null}
        onClose={() => {
          setMintOpen(false);
          setBusy(false);
        }}
        onPickMetaMask={handleMintWithMetaMask}
      />
    </div>
  );
}
