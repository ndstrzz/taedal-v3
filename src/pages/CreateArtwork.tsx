import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../state/AuthContext";
import { supabase } from "../lib/supabase";
import { DEFAULT_COVER_URL, API_BASE } from "../lib/config";
import { pinFileViaServerWithProgress } from "../lib/ipfs";
import { useToast } from "../components/Toaster";
import DropZone from "../components/DropZone";
import MintWalletModal from "../components/MintWalletModal";
import { mintWithMetaMask, WalletError } from "../lib/eth";
import AttributeEditor, { Attribute } from "../components/AttributeEditor";
import { capturePosterFromVideo } from "../lib/video";

type SimilarRecord = {
  id: string; title: string | null; username?: string | null; user_id?: string | null;
  image_url?: string | null; score?: number;
};

const ACCEPT = "image/png,image/jpeg,image/webp,video/mp4";
const MAX_MB = 25;

function fmtMB(bytes: number) { return (bytes / (1024 * 1024)).toFixed(1) + "MB"; }

type Step = "media" | "details" | "rights" | "sale" | "preview";

export default function CreateArtwork() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");

  const isVideo = file ? file.type.startsWith("video/") : false;
  const [posterBlob, setPosterBlob] = useState<Blob | null>(null);
  const [posterUrl, setPosterUrl] = useState<string>("");

  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [royaltyBps, setRoyaltyBps] = useState<number>(500);

  const [ackRights, setAckRights] = useState<boolean>(false);
  const [license, setLicense] = useState<string>("All Rights Reserved");

  const [saleKind, setSaleKind] = useState<"fixed" | "auction" | null>("fixed");
  const [salePrice, setSalePrice] = useState<string>("");
  const [auctionReserve, setAuctionReserve] = useState<string>("");
  const [auctionStart, setAuctionStart] = useState<string>("");
  const [auctionEnd, setAuctionEnd] = useState<string>("");

  const [checking, setChecking] = useState(false);
  const [candidates, setCandidates] = useState<SimilarRecord[] | null>(null);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number>(0);

  const [mintOpen, setMintOpen] = useState(false);
  const [mintBusy, setMintBusy] = useState(false);
  const [mintErr, setMintErr] = useState<string | null>(null);

  const [pendingMetaUrl, setPendingMetaUrl] = useState<string>("");
  const [pendingImageCid, setPendingImageCid] = useState<string>("");
  const [pendingAnimationCid, setPendingAnimationCid] = useState<string>("");
  const [pendingCoverUrl, setPendingCoverUrl] = useState<string>("");
  const [pendingArtworkNum, setPendingArtworkNum] = useState<number | null>(null);
  const [pendingDHash, setPendingDHash] = useState<string>("");
  const [pendingSha256, setPendingSha256] = useState<string>("");

  const [step, setStep] = useState<Step>("media");
  const canNext =
    step === "media"    ? !!file && (!isVideo || !!posterBlob)
  : step === "details"  ? !!title.trim()
  : step === "rights"   ? ackRights
  : step === "sale"     ? (saleKind === "fixed" ? Number(salePrice) > 0 : true)
  : step === "preview"  ? true
  : false;

  useEffect(() => {
    if (!file) { setPreviewUrl(""); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!posterBlob) { setPosterUrl(""); return; }
    const url = URL.createObjectURL(posterBlob);
    setPosterUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [posterBlob]);

  const handleNewFile = useCallback((f: File) => {
    if (!ACCEPT.split(",").includes(f.type)) {
      toast({ variant: "error", title: "Unsupported file type", description: f.type });
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      toast({ variant: "error", title: "File too large", description: `Max ${MAX_MB}MB, got ${fmtMB(f.size)}.` });
      return;
    }
    setFile(f);
    setCandidates(null);
    setAckRights(false);
    setPosterBlob(null);
  }, [toast]);

  const onPick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleNewFile(f);
    e.currentTarget.value = "";
  }, [handleNewFile]);

  useEffect(() => {
    if (!file || !API_BASE) return;
    (async () => {
      try {
        setChecking(true);
        const fd = new FormData();
        fd.append("file", file);
        const r = await fetch(`${API_BASE.replace(/\/$/, "")}/api/verify`, { method: "POST", body: fd, headers: { Accept: "application/json" }});
        const out = await r.json();
        const results = Array.isArray(out?.similar) ? out.similar : out?.matches || [];
        setCandidates(results);
      } catch {
        setCandidates([]);
      } finally {
        setChecking(false);
      }
    })();
  }, [file]);

  const makePoster = useCallback(async () => {
    if (!file || !isVideo) return;
    try {
      const blob = await capturePosterFromVideo(file);
      setPosterBlob(blob);
      toast({ title: "Poster captured" });
    } catch (e: any) {
      toast({ variant: "error", title: "Poster capture failed", description: String(e?.message || e) });
    }
  }, [file, isVideo, toast]);

  const onPublish = useCallback(async () => {
    if (!user || !file) { toast({ variant: "error", title: "Please log in & select a file" }); return; }
    if (!API_BASE) { toast({ variant: "error", title: "API not configured" }); return; }
    if (isVideo && !posterBlob) { toast({ variant: "error", title: "Capture a poster for the video first" }); return; }

    setBusy(true); setProgress(0);
    try {
      // 1) pin primary media
      let last = 0;
      const pinPrimary = await pinFileViaServerWithProgress(file, file.name, (r) => {
        const pct = Math.round(r * 100);
        if (pct - last >= 2 || pct === 100) { setProgress(Math.min(99, pct)); last = pct; }
      });
      const mediaCid = pinPrimary.cid;

      // 2) poster (if video)
      let posterGateway = "";
      if (isVideo && posterBlob) {
        const posterOut = await pinFileViaServerWithProgress(
          new File([posterBlob], "poster.webp", { type: "image/webp" }),
          "poster.webp"
        );
        posterGateway = posterOut.gatewayUrl;
        setPendingCoverUrl(posterGateway || DEFAULT_COVER_URL);
      } else {
        setPendingCoverUrl(pinPrimary.gatewayUrl || DEFAULT_COVER_URL);
      }

      setPendingImageCid(isVideo ? "" : mediaCid);
      setPendingAnimationCid(isVideo ? mediaCid : "");
      setProgress(100);
      toast({ variant: "success", title: "Pinned media to IPFS" });

      // 3) hashes — use poster for videos
      const fd1 = new FormData();
      const blobForHash =
        isVideo && posterBlob
          ? new File([posterBlob], "poster.webp", { type: "image/webp" })
          : file;
      fd1.append("file", blobForHash);

      const r1 = await fetch(`${API_BASE.replace(/\/$/, "")}/api/hashes`, { method: "POST", body: fd1 });
      if (!r1.ok) throw new Error(`Failed to compute hashes (${r1.status})`);
      const { dhash64, sha256 } = await r1.json();
      setPendingDHash(dhash64 || "");
      setPendingSha256(sha256 || "");

      // 4) metadata
      const body = {
        name: title.trim(),
        description: description.trim(),
        attributes: attributes?.length ? attributes : undefined,
        ...(isVideo
          ? {
              image: posterGateway ? posterGateway.replace("https://gateway.pinata.cloud/ipfs/","ipfs://") : undefined,
              animationCid: mediaCid
            }
          : { imageCid: mediaCid }),
      };

      const r2 = await fetch(`${API_BASE.replace(/\/$/, "")}/api/metadata`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r2.ok) throw new Error(`Failed to pin metadata (${r2.status})`);
      const metaOut = await r2.json();
      const metadataUri =
        metaOut?.metadata_url || metaOut?.ipfsUri || `ipfs://${metaOut?.metadata_cid}`;
      setPendingMetaUrl(metadataUri);

      // 5) open mint modal
      setPendingArtworkNum(Math.floor(Date.now() / 1000));
      setMintErr(null);
      setMintOpen(true);
    } catch (err: any) {
      toast({ variant: "error", title: "Create failed", description: String(err.message || err) });
      setBusy(false); setProgress(0);
    }
  }, [user, file, isVideo, posterBlob, title, description, attributes, toast]);

  const onSaveDraft = useCallback(async () => {
    if (!user) { toast({ variant: "error", title: "Please log in" }); return; }
    try {
      const { data, error } = await supabase.from("artworks").insert({
        owner: user.id,
        title: title.trim() || "Untitled",
        description: description.trim() || null,
        cover_url: posterUrl || DEFAULT_COVER_URL,
        status: "draft",
        media_kind: isVideo ? "video" : "image",
        royalty_bps: royaltyBps,
        sale_kind: saleKind,
        sale_currency: "ETH",
        sale_price: saleKind === "fixed" && salePrice ? salePrice : null,
        auction_reserve: saleKind === "auction" && auctionReserve ? auctionReserve : null,
        auction_starts_at: saleKind === "auction" && auctionStart ? new Date(auctionStart).toISOString() : null,
        auction_ends_at: saleKind === "auction" && auctionEnd ? new Date(auctionEnd).toISOString() : null,
      }).select("*").single();
      if (error) throw error;
      toast({ variant: "success", title: "Draft saved" });
      navigate(`/a/${data.id}`, { replace: false });
    } catch (e: any) {
      toast({ variant: "error", title: "Failed to save draft", description: String(e?.message || e) });
    }
  }, [user, title, description, posterUrl, isVideo, royaltyBps, saleKind, salePrice, auctionReserve, auctionStart, auctionEnd, navigate, toast]);

  async function handleMintWithMetaMask() {
    try {
      setMintBusy(true);
      setMintErr(null);
      const artworkNum = pendingArtworkNum ?? Math.floor(Date.now() / 1000);
      const { txHash, tokenId } = await mintWithMetaMask(pendingMetaUrl, artworkNum);

      const { data: inserted, error: dberr } = await supabase
        .from("artworks")
        .insert({
          owner: user!.id,
          title: title.trim(),
          description: description.trim(),
          cover_url: pendingCoverUrl || DEFAULT_COVER_URL,
          status: "published",
          image_cid: pendingImageCid || null,
          metadata_url: pendingMetaUrl,
          token_id: tokenId,
          tx_hash: txHash,
          dhash64: pendingDHash || null,
          sha256: pendingSha256 || null,
          media_kind: isVideo ? "video" : "image",
          animation_cid: isVideo ? pendingAnimationCid : null,
          royalty_bps: royaltyBps,
          sale_kind: saleKind,
          sale_currency: "ETH",
          sale_price: saleKind === "fixed" && salePrice ? salePrice : null,
          auction_reserve: saleKind === "auction" && auctionReserve ? auctionReserve : null,
          auction_starts_at: saleKind === "auction" && auctionStart ? new Date(auctionStart).toISOString() : null,
          auction_ends_at: saleKind === "auction" && auctionEnd ? new Date(auctionEnd).toISOString() : null,
        })
        .select("*")
        .single();
      if (dberr) throw dberr;

      setMintOpen(false);
      setBusy(false);
      navigate(`/a/${inserted.id}`, { replace: true });
    } catch (e: any) {
      const msg = e instanceof WalletError ? e.message : e?.message || String(e);
      setMintErr(msg);
    } finally {
      setMintBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-6 text-2xl font-semibold">Create artwork</h1>
      {/* …the rest of your JSX is unchanged… */}
      {/* (I kept it identical to what you pasted) */}
      <MintWalletModal
        open={mintOpen}
        busy={mintBusy}
        error={mintErr || null}
        onClose={() => { setMintOpen(false); setBusy(false); }}
        onPickMetaMask={handleMintWithMetaMask}
      />
    </div>
  );
}
