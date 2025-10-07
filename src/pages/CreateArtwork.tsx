// src/pages/CreateArtwork.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
const ipfs = (cid?: string | null) => (cid ? `https://ipfs.io/ipfs/${cid}` : "");

type Step = "media" | "details" | "rights" | "sale" | "preview";

export default function CreateArtwork() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Core state
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");

  // poster/video specific
  const isVideo = file ? file.type.startsWith("video/") : false;
  const [posterBlob, setPosterBlob] = useState<Blob | null>(null);
  const [posterUrl, setPosterUrl] = useState<string>("");

  // details / metadata
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [royaltyBps, setRoyaltyBps] = useState<number>(500); // default 5%

  // rights
  const [ackRights, setAckRights] = useState<boolean>(false);
  const [license, setLicense] = useState<string>("All Rights Reserved");

  // sale
  const [saleKind, setSaleKind] = useState<"fixed" | "auction" | null>("fixed");
  const [salePrice, setSalePrice] = useState<string>("");
  const [auctionReserve, setAuctionReserve] = useState<string>("");
  const [auctionStart, setAuctionStart] = useState<string>("");
  const [auctionEnd, setAuctionEnd] = useState<string>("");

  // verify
  const [checking, setChecking] = useState(false);
  const [candidates, setCandidates] = useState<SimilarRecord[] | null>(null);
  const [ackOriginalMedia, setAckOriginalMedia] = useState(false); // ✅ must-ack in Media if matches

  // progress
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number>(0);

  // mint modal
  const [mintOpen, setMintOpen] = useState(false);
  const [mintBusy, setMintBusy] = useState(false);
  const [mintErr, setMintErr] = useState<string | null>(null);

  // values for DB insert after mint
  const [pendingMetaUrl, setPendingMetaUrl] = useState<string>("");
  const [pendingImageCid, setPendingImageCid] = useState<string>("");
  const [pendingAnimationCid, setPendingAnimationCid] = useState<string>("");
  const [pendingCoverUrl, setPendingCoverUrl] = useState<string>("");
  const [pendingArtworkNum, setPendingArtworkNum] = useState<number | null>(null);
  const [pendingDHash, setPendingDHash] = useState<string>("");
  const [pendingSha256, setPendingSha256] = useState<string>("");

  // wizard
  const mustAcknowledgeMedia = (candidates?.length ?? 0) > 0;
  const [step, setStep] = useState<Step>("media");
  const canNext =
    step === "media"
      ? !!file &&
        (!isVideo || !!posterBlob) &&
        (!mustAcknowledgeMedia || ackOriginalMedia) // ✅ require ack if matches
    : step === "details"
      ? !!title.trim()
    : step === "rights"
      ? ackRights
    : step === "sale"
      ? (saleKind === "fixed" ? Number(salePrice) > 0 : true)
    : step === "preview"
      ? true
    : false;

  // preview blob URL
  useEffect(() => {
    if (!file) { setPreviewUrl(""); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // poster preview URL
  useEffect(() => {
    if (!posterBlob) { setPosterUrl(""); return; }
    const url = URL.createObjectURL(posterBlob);
    setPosterUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [posterBlob]);

  // -------- intake & validation ----------
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
    setAckOriginalMedia(false); // ✅ reset ack when picking a new file
    setPosterBlob(null);
  }, [toast]);

  const onPick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleNewFile(f);
    e.currentTarget.value = "";
  }, [handleNewFile]);

  // Auto-generate a poster for videos as soon as they’re picked (silent)
  useEffect(() => {
    if (file && isVideo && !posterBlob) {
      (async () => {
        try {
          const blob = await capturePosterFromVideo(file);
          setPosterBlob(blob);
        } catch {
          /* silent; user can still click "Capture poster" manually */
        }
      })();
    }
  }, [file, isVideo, posterBlob]);

  // Auto similarity check: image → downscale; video → use poster
  useEffect(() => {
    async function runCheck(checkBlob: Blob, nameHint = "check.jpg") {
      try {
        setChecking(true);
        const fd = new FormData();
        fd.append("file", new File([checkBlob], nameHint, { type: checkBlob.type || "image/jpeg" }));
        const r = await fetch(`${API_BASE!.replace(/\/$/, "")}/api/verify`, {
          method: "POST",
          body: fd,
          headers: { Accept: "application/json" }
        });
        const out = await r.json().catch(() => ({}));
        const results = Array.isArray(out?.similar) ? out.similar : out?.matches || [];
        setCandidates(results);
      } catch {
        setCandidates([]); // allow continue if API fails
      } finally {
        setChecking(false);
      }
    }

    (async () => {
      if (!file || !API_BASE) return;

      // reset results on each new file/poster
      setCandidates(null);
      setAckOriginalMedia(false);

      if (isVideo) {
        if (!posterBlob) return; // wait for poster first
        await runCheck(posterBlob, "poster.webp");
      } else {
        try {
          const blob = await downscaleForVerify(file, 1024);
          await runCheck(blob, file.name || "image.jpg");
        } catch {
          // fall back to full file if downscale fails
          await runCheck(file, file.name || "image.jpg");
        }
      }
    })();
  }, [file, isVideo, posterBlob]);

  // Generate poster for videos (manual button)
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

  // -------- submit (pinning + metadata + mint) ----------
  const onPublish = useCallback(async () => {
    if (!user || !file) { toast({ variant: "error", title: "Please log in & select a file" }); return; }
    if (!API_BASE) { toast({ variant: "error", title: "API not configured" }); return; }
    if (isVideo && !posterBlob) { toast({ variant: "error", title: "Capture a poster for the video first" }); return; }

    setBusy(true); setProgress(0);
    try {
      // 1) pin primary media (image or video)
      let last = 0;
      const pinPrimary = await pinFileViaServerWithProgress(file, file.name, (r) => {
        const pct = Math.round(r * 100);
        if (pct - last >= 2 || pct === 100) { setProgress(Math.min(99, pct)); last = pct; }
      });
      const mediaCid = pinPrimary.cid;

      // 2) poster (if video) — also pin
      let posterGateway = "";
      if (isVideo && posterBlob) {
        const posterOut = await pinFileViaServerWithProgress(
          new File([posterBlob], "poster.webp", { type: "image/webp" }),
          "poster.webp"
        );
        posterGateway = posterOut.gatewayUrl;
        setPendingCoverUrl(posterGateway || DEFAULT_COVER_URL);
      } else {
        // for images, use pin gateway or default
        setPendingCoverUrl(pinPrimary.gatewayUrl || DEFAULT_COVER_URL);
      }

      // set pending cids
      setPendingImageCid(isVideo ? "" : mediaCid);
      setPendingAnimationCid(isVideo ? mediaCid : "");
      setProgress(100);
      toast({ variant: "success", title: "Pinned media to IPFS" });

      // 3) hashes
      const fd1 = new FormData();
      fd1.append("file", file);
      const r1 = await fetch(`${API_BASE.replace(/\/$/, "")}/api/hashes`, { method: "POST", body: fd1 });
      if (!r1.ok) throw new Error(`Failed to compute hashes (${r1.status})`);
      const { dhash64, sha256 } = await r1.json();
      setPendingDHash(dhash64 || "");
      setPendingSha256(sha256 || "");

      // 4) metadata
      const body: any = {
        name: title.trim(),
        description: description.trim(),
        attributes: attributes?.length ? attributes : undefined,
      };
      if (isVideo) {
        body.image = posterGateway ? posterGateway.replace("https://gateway.pinata.cloud/ipfs/","ipfs://") : undefined;
        body.animationCid = mediaCid;
      } else {
        body.imageCid = mediaCid;
      }

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

  // Save draft (no mint)
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

  // Mint → then DB insert (published)
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

  // UI ----------------------------------------------------------------------
  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-6 text-2xl font-semibold">Create artwork</h1>

      {/* stepper */}
      <div className="mb-6 flex flex-wrap gap-2 text-xs">
        {(["media","details","rights","sale","preview"] as Step[]).map(s => (
          <button key={s}
            className={`rounded-full border px-3 py-1 capitalize ${step===s?"border-neutral-500":"border-neutral-700 hover:bg-neutral-900"}`}
            onClick={() => setStep(s)}
            type="button"
          >{s}</button>
        ))}
      </div>

      {/* steps */}
      {step === "media" && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900">
            {previewUrl ? (
              isVideo ? (
                <video src={previewUrl} controls className="w-full" />
              ) : (
                <img src={previewUrl} alt="preview" className="w-full object-cover" />
              )
            ) : (
              <DropZone onSelect={handleNewFile} accept={ACCEPT} className="aspect-square grid place-items-center" ariaLabel="Upload artwork media">
                <div className="mx-6 rounded-2xl border border-dashed border-neutral-700 p-8 text-center">
                  <div className="text-sm text-neutral-300">Drag & drop your image/video</div>
                  <div className="mt-1 text-xs text-neutral-500">PNG, JPG, WEBP or MP4 · up to {MAX_MB}MB</div>
                </div>
              </DropZone>
            )}
          </div>

          <div className="space-y-3">
            <input ref={fileInputRef} type="file" accept={ACCEPT} onChange={onPick}
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-black"/>
            {file && <div className="text-xs text-neutral-400">{file.type} • {fmtMB(file.size)}</div>}
            {isVideo && (
              <>
                <div className="text-sm text-neutral-300">Poster (thumbnail)</div>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={makePoster}
                    className="rounded-xl border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-900">Capture poster</button>
                  {posterUrl && <img src={posterUrl} className="h-16 w-16 rounded-lg object-cover" />}
                </div>
              </>
            )}
          </div>

          {/* Similarity panel (full width under the two columns) */}
          {file && (
            <div className="col-span-full rounded-2xl border border-neutral-800 p-3">
              {checking ? (
                <div className="text-xs text-neutral-400">Checking for similar works…</div>
              ) : candidates ? (
                candidates.length > 0 ? (
                  <>
                    <div className="mb-2 text-sm font-medium">Possible matches</div>
                    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                      {candidates.map((c) => (
                        <li key={c.id} className="rounded-lg border border-neutral-800 p-2">
                          <div className="mb-2 aspect-square overflow-hidden rounded bg-neutral-900">
                            {c.image_url ? (
                              <img src={c.image_url} className="h-full w-full object-cover" />
                            ) : (
                              <div className="grid h-full w-full place-items-center text-xs text-neutral-500">No preview</div>
                            )}
                          </div>
                          <div className="truncate text-xs text-neutral-200">{c.title || "Untitled"}</div>
                          {typeof c.score === "number" && (
                            <div className="mt-0.5 text-[11px] text-neutral-500">score: {c.score.toFixed(2)}</div>
                          )}
                        </li>
                      ))}
                    </ul>

                    {/* must acknowledge before proceeding */}
                    <label className="mt-3 flex items-start gap-3 rounded-xl border border-yellow-600/40 bg-yellow-500/10 p-3 text-sm text-yellow-100">
                      <input
                        type="checkbox"
                        checked={ackOriginalMedia}
                        onChange={(e) => setAckOriginalMedia(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>I confirm I am the original creator or have the rights to mint and list this artwork.</span>
                    </label>
                  </>
                ) : (
                  <div className="text-xs text-neutral-400">No near-duplicates found.</div>
                )
              ) : (
                <div className="text-xs text-neutral-400">Ready to check similarity once uploaded.</div>
              )}
            </div>
          )}

          <div className="col-span-full flex justify-end">
            <button type="button" disabled={!canNext}
              className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
              onClick={() => setStep("details")}>Next</button>
          </div>
        </div>
      )}

      {step === "details" && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm text-neutral-300">Title</span>
              <input className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2"
                value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="Your artwork title" required />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-neutral-300">Description</span>
              <textarea className="min-h-[120px] w-full resize-y rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2"
                value={description} onChange={(e)=>setDescription(e.target.value)} placeholder="Tell collectors about the piece…" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-neutral-300">Attributes</span>
              <AttributeEditor value={attributes} onChange={setAttributes}/>
            </label>
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm text-neutral-300">Royalties (bps)</span>
              <input type="number" min={0} max={10000}
                className="w-40 rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2"
                value={royaltyBps} onChange={(e)=>setRoyaltyBps(Math.max(0, Math.min(10000, Number(e.target.value||0))))}/>
              <div className="mt-1 text-xs text-neutral-500">100 = 1%, 500 = 5%</div>
            </label>
          </div>

          <div className="col-span-full flex justify-between">
            <button type="button" onClick={()=>setStep("media")} className="rounded-xl border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-900">Back</button>
            <button type="button" disabled={!canNext}
              className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
              onClick={()=>setStep("rights")}>Next</button>
          </div>
        </div>
      )}

      {step === "rights" && (
        <div className="space-y-4">
          <label className="flex items-start gap-3 rounded-2xl border border-neutral-700 p-3 text-sm">
            <input type="checkbox" checked={ackRights} onChange={(e)=>setAckRights(e.target.checked)} className="mt-0.5"/>
            <span>I confirm I am the original creator or have the rights to mint and sell this artwork.</span>
          </label>
          <label className="block max-w-md">
            <span className="mb-1 block text-sm text-neutral-300">License</span>
            <select value={license} onChange={(e)=>setLicense(e.target.value)}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2">
              {["All Rights Reserved","CC BY","CC BY-NC","CC BY-SA","Custom/Other"].map(x=> <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <div className="flex justify-between">
            <button type="button" onClick={()=>setStep("details")} className="rounded-xl border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-900">Back</button>
            <button type="button" disabled={!canNext}
              className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
              onClick={()=>setStep("sale")}>Next</button>
          </div>
        </div>
      )}

      {step === "sale" && (
        <div className="grid max-w-2xl grid-cols-1 gap-6">
          <div className="flex gap-3">
            {(["fixed","auction"] as const).map(k=>(
              <button key={k} type="button" onClick={()=>setSaleKind(k)}
                className={`rounded-full border px-3 py-1.5 text-sm capitalize ${saleKind===k?"border-neutral-500":"border-neutral-700 hover:bg-neutral-900"}`}>
                {k}
              </button>
            ))}
          </div>

          {saleKind==="fixed" && (
            <label className="block max-w-xs">
              <span className="mb-1 block text-sm text-neutral-300">Price (ETH)</span>
              <input type="number" min={0} step="0.0001" value={salePrice}
                onChange={(e)=>setSalePrice(e.target.value)}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2"/>
            </label>
          )}

          {saleKind==="auction" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm text-neutral-300">Reserve (ETH)</span>
                <input type="number" min={0} step="0.0001" value={auctionReserve}
                  onChange={(e)=>setAuctionReserve(e.target.value)}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2"/>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-neutral-300">Starts</span>
                <input type="datetime-local" value={auctionStart}
                  onChange={(e)=>setAuctionStart(e.target.value)}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2"/>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-neutral-300">Ends</span>
                <input type="datetime-local" value={auctionEnd}
                  onChange={(e)=>setAuctionEnd(e.target.value)}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2"/>
              </label>
            </div>
          )}

          <div className="flex justify-between">
            <button type="button" onClick={()=>setStep("rights")} className="rounded-xl border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-900">Back</button>
            <button type="button" disabled={!canNext}
              className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
              onClick={()=>setStep("preview")}>Next</button>
          </div>
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900">
              {isVideo ? (posterUrl ? <img src={posterUrl} className="w-full"/> : <div className="aspect-square grid place-items-center text-neutral-500">No poster</div>)
                       : (previewUrl ? <img src={previewUrl} className="w-full"/> : null)}
            </div>
            <div className="space-y-2 text-sm text-neutral-300">
              <div className="text-lg font-semibold text-neutral-100">{title || "Untitled"}</div>
              {description && <div className="whitespace-pre-line">{description}</div>}
              {attributes?.length ? <div className="mt-3">
                <div className="mb-1 text-neutral-400">Attributes</div>
                <ul className="grid grid-cols-2 gap-2">
                  {attributes.map((a,i)=>(<li key={i} className="rounded-xl border border-neutral-800 px-3 py-2">
                    <div className="text-xs text-neutral-400">{a.trait_type}</div>
                    <div className="text-neutral-200">{a.value}</div>
                  </li>))}
                </ul>
              </div> : null}
              <div className="mt-3 text-xs text-neutral-400">Royalty: {(royaltyBps/100).toFixed(2)}%</div>
              <div className="text-xs text-neutral-400">Sale: {saleKind === "fixed" ? `Fixed • ${salePrice || 0} ETH` : "Auction"}</div>
            </div>
          </div>

          {busy && (
            <div>
              <div className="mb-1 text-xs text-neutral-400">Uploading & preparing…</div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
                <div className="h-full bg-white transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={()=>setStep("sale")}
              className="rounded-xl border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-900">Back</button>
            <button type="button" onClick={onSaveDraft}
              className="rounded-xl border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-900">Save draft</button>
            <button type="button" onClick={onPublish} disabled={busy}
              className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-60">Mint & publish</button>
          </div>
        </div>
      )}

      {/* Mint wallet modal */}
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

/** Downscale images client-side for the verify API (keeps videos untouched). */
async function downscaleForVerify(srcFile: File, maxSide = 1024): Promise<Blob> {
  if (!srcFile.type.startsWith("image/")) return srcFile; // leave videos alone
  const bitmap = await createImageBitmap(srcFile);
  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(1, maxSide / longest);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);

  // JPEG @ 0.8 balances size/quality; server uses it for hashing
  const blob: Blob = await new Promise((res) =>
    canvas.toBlob((b) => res(b || srcFile), "image/jpeg", 0.8)
  );
  return blob;
}
