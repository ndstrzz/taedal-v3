import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../state/AuthContext";
import { supabase } from "../lib/supabase";
import { DEFAULT_COVER_URL, API_BASE } from "../lib/config";
import { pinFileViaServerWithProgress } from "../lib/ipfs";
import { useToast } from "../components/Toaster";
import { Skeleton } from "../components/Skeleton";

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
  const [mustConfirmSimilar, setMustConfirmSimilar] = useState(false);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number>(0);

  // skeleton for first mount
  const [initializing, setInitializing] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setInitializing(false), 200);
    return () => clearTimeout(t);
  }, []);

  // Preview blob URL management
  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const canSubmit = useMemo(
    () => !!file && !!title.trim() && !busy && (!mustConfirmSimilar || candidates?.length === 0),
    [file, title, busy, mustConfirmSimilar, candidates]
  );

  // --- handlers ---

  const onPick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    if (!ACCEPT.split(",").includes(f.type)) {
      toast({
        variant: "error",
        title: "Unsupported file type",
        description: `Got ${f.type}. Allowed: ${ACCEPT.replaceAll("image/", "").replaceAll("video/", "")}`,
      });
      e.target.value = "";
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      toast({
        variant: "error",
        title: "File too large",
        description: `Max ${MAX_MB}MB, got ${fmtMB(f.size)}.`,
      });
      e.target.value = "";
      return;
    }
    setFile(f);
    setCandidates(null);
    setMustConfirmSimilar(false);
  }, [toast]);

  const api = (path: string) => {
    const base = API_BASE?.replace(/\/$/, "");
    return `${base}${path}`;
  };

  const runSimilarityCheck = useCallback(async () => {
    if (!file) return;
    if (!API_BASE) {
      toast({ variant: "error", title: "API not configured", description: "Missing API_BASE in window.__CONFIG__" });
      return;
    }
    setChecking(true);
    setCandidates(null);
    setMustConfirmSimilar(false);

    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(api("/api/verify"), {
        method: "POST",
        body: fd,
      });
      if (!r.ok) throw new Error(`Similarity check failed (${r.status})`);
      const out = (await r.json()) as { matches: SimilarRecord[] };
      const results = Array.isArray(out?.matches) ? out.matches : [];
      setCandidates(results);
      if (results.length > 0) {
        setMustConfirmSimilar(true);
        toast({
          title: "Similar artworks found",
          description: "Review the results below. Continue only if you confirm yours is original.",
        });
      } else {
        toast({ variant: "success", title: "No near-duplicates found" });
      }
    } catch (err: any) {
      toast({ variant: "error", title: "Similarity check error", description: String(err.message || err) });
    } finally {
      setChecking(false);
    }
  }, [file, toast]);

  const onSubmit = useCallback(async (e: React.FormEvent) => {
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
      toast({ variant: "error", title: "API not configured", description: "Missing API_BASE in window.__CONFIG__" });
      return;
    }

    setBusy(true);
    setProgress(0);

    try {
      // 1) Pin primary media (this call already uses API_BASE inside pinFileViaServerWithProgress if you built it that way;
      // if not, pass the base here)
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

      // 2) Hashes
      const fd1 = new FormData();
      fd1.append("file", file);
      const r1 = await fetch(api("/api/hashes"), { method: "POST", body: fd1 });
      if (!r1.ok) throw new Error(`Failed to compute hashes (${r1.status})`);
      const { dhash64, sha256 } = await r1.json();
      toast({ title: "Computed hashes", description: "Perceptual + SHA256" });

      // 3) Metadata
      const metadata = {
        name: title.trim(),
        description: description.trim(),
        image: pin.ipfsUri ?? `ipfs://${pin.cid}`,
        properties: {
          bytes: file.size,
          mime_type: file.type,
        },
      };
      const r2 = await fetch(api("/api/metadata"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metadata),
      });
      if (!r2.ok) throw new Error(`Failed to pin metadata (${r2.status})`);
      const { metadata_cid, metadata_url } = await r2.json();
      toast({ variant: "success", title: "Pinned metadata" });

      // 4) Insert DB row
      const { data: inserted, error: dberr } = await supabase
        .from("artworks")
        .insert({
          owner: user.id,
          title: title.trim(),
          description: description.trim(),
          cover_url: DEFAULT_COVER_URL,
          status: "published",
          image_cid: pin.cid,
          metadata_url: metadata_url ?? `ipfs://${metadata_cid}`,
          dhash64,
          sha256,
        })
        .select("*")
        .single();

      if (dberr) throw dberr;

      toast({
        variant: "success",
        title: "Artwork saved",
        description: "Redirecting to your artwork…",
      });

      navigate(`/a/${inserted.id}`, { replace: true });
    } catch (err: any) {
      toast({ variant: "error", title: "Create failed", description: String(err.message || err) });
      setBusy(false);
      setProgress(0);
    }
  }, [user, file, title, description, navigate, toast]);

  // --- UI (unchanged from previous version) ---

  if (initializing) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Skeleton className="h-8 w-2/3 mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
        <div>
          <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900">
            {previewUrl ? (
              <img src={previewUrl} alt="preview" className="w-full object-cover" />
            ) : (
              <div className="aspect-square grid place-items-center text-neutral-500">
                Select an image or video
              </div>
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
              <span className="text-xs text-neutral-400">{file.type} • {fmtMB(file.size)}</span>
            )}
          </div>

          <div className="mt-3">
            <button
              type="button"
              disabled={!file || checking}
              onClick={runSimilarityCheck}
              className="rounded-xl border border-neutral-700 px-3 py-2 text-sm disabled:opacity-60"
            >
              {checking ? "Checking…" : "Run similarity check"}
            </button>
          </div>
        </div>

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

          {mustConfirmSimilar && candidates && candidates.length > 0 && (
            <div className="rounded-2xl border border-yellow-600/40 bg-yellow-500/10 p-3 text-sm text-yellow-200">
              We found possible similar works. Please review below. Only continue if you’re sure
              this is your original work.
            </div>
          )}

          <div className="pt-2">
            <button
              className="rounded-xl bg-white px-4 py-2 font-medium text-black disabled:opacity-60"
              disabled={!canSubmit}
            >
              {busy ? "Creating…" : "Create & publish"}
            </button>
          </div>
        </div>
      </form>

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
                    <div className="mt-1 text-xs text-neutral-500">score: {c.score}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
