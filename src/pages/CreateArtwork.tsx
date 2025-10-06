import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../state/AuthContext'
import { supabase } from '../lib/supabase'
import { DEFAULT_COVER_URL, API_BASE } from '../lib/config'
import { pinFileViaServerWithProgress } from '../lib/ipfs'
import { mintOnChain, txUrl, tokenUrl } from '../lib/eth'

type SimilarRecord = {
  id: string | number
  title: string
  username: string
  user_id: string
  image_url: string
  score?: number
}

const ACCEPT = 'image/png,image/jpeg,image/webp,video/mp4'
const MAX_MB = 25

export default function CreateArtwork() {
  const { user } = useAuth()
  const nav = useNavigate()

  // Form
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  // File
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const pickRef = useRef<HTMLInputElement>(null)

  // UX state
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'minting' | 'complete'>('idle')
  const [pct, setPct] = useState(0)

  // Outputs
  const [ipfsCid, setIpfsCid] = useState<string | null>(null)
  const [metadataCid, setMetadataCid] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [tokenId, setTokenId] = useState<string | null>(null)

  // Similarity + rights gate
  const [similar, setSimilar] = useState<SimilarRecord[]>([])
  const [similarBusy, setSimilarBusy] = useState(false)
  const [similarErr, setSimilarErr] = useState<string | null>(null)
  const [reviewChecked, setReviewChecked] = useState(true)
  const [consent, setConsent] = useState(false)

  // Hashes we’ll persist in DB
  const [dhash, setDhash] = useState<string | null>(null)
  const [sha256, setSha256] = useState<string | null>(null)

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null
    setFile(f)
    setPreview(f ? URL.createObjectURL(f) : null)
    setIpfsCid(null)
    setMetadataCid(null)
    setTxHash(null)
    setTokenId(null)
    setErr('')
    setDhash(null)
    setSha256(null)

    if (f) {
      runSimilarCheck(f) // async; doesn’t block
    } else {
      setSimilar([])
      setReviewChecked(true)
    }
  }

  async function runSimilarCheck(f: File) {
    setSimilarBusy(true)
    setSimilarErr(null)
    try {
      const fd = new FormData()
      fd.append('artwork', f)
      const res = await fetch(`${API_BASE}/api/verify`, { method: 'POST', body: fd })
      if (!res.ok) throw new Error(`Similarity check failed (${res.status})`)
      const data = await res.json()
      const matches: SimilarRecord[] = Array.isArray(data?.similar) ? data.similar : []
      setSimilar(matches)
      setReviewChecked(matches.length === 0)
    } catch (e: any) {
      setSimilarErr(e?.message || 'Similarity service unavailable')
      setSimilar([])
      setReviewChecked(true)
    } finally {
      setSimilarBusy(false)
    }
  }

  async function computeHashes(f: File) {
    const fd = new FormData()
    fd.append('file', f)
    const res = await fetch(`${API_BASE}/api/hashes`, { method: 'POST', body: fd })
    if (!res.ok) throw new Error('hashing failed')
    const j = await res.json()
    setDhash(j.dhash64 || null)
    setSha256(j.sha256 || null)
    return { dhash64: j.dhash64 || null, sha256: j.sha256 || null }
  }

  async function publish() {
    setErr('')

    // Refresh session before deciding to bounce
    let uid = user?.id || null
    if (!uid) {
      try {
        const { data } = await supabase.auth.getUser()
        uid = data.user?.id ?? null
      } catch {
        /* ignore */
      }
    }
    if (!uid) {
      setErr('Your session expired. Please log in again.')
      nav('/login', { replace: true })
      return
    }

    if (!title.trim()) return setErr('Title is required.')
    if (!file) return setErr('Please choose an image or video.')
    if (file.size > MAX_MB * 1024 * 1024) return setErr(`Max file size is ${MAX_MB}MB.`)
    if (!consent) return setErr('Please confirm you are the rights holder.')
    if (similar.length > 0 && !reviewChecked) return setErr('Please review matches and confirm.')

    setBusy(true)
    setPhase('uploading')
    setPct(0)

    try {
      // 1) Pin media
      const pin = await pinFileViaServerWithProgress(file, title.trim(), (p) => setPct(p))
      setIpfsCid(pin.cid)

      // 2) Compute hashes (for DB)
      const hashes = await computeHashes(file)

      // 3) Pin metadata
      const metaRes = await fetch(`${API_BASE}/api/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: title.trim(),
          description: description.trim(),
          imageCid: pin.cid,
        }),
      })
      if (!metaRes.ok) throw new Error('Failed to pin metadata')
      const { metadata_cid } = await metaRes.json()
      setMetadataCid(metadata_cid)
      const metadataURI = `ipfs://${metadata_cid}`

      // 4) Create DB row
      const { data: a, error } = await supabase
        .from('artworks')
        .insert({
          owner: uid,
          title: title.trim(),
          description: description.trim() || null,
          cover_url: pin.gatewayUrl || DEFAULT_COVER_URL,
          status: 'published',
          metadata_uri: metadataURI,
          image_cid: pin.cid,
          dhash64: hashes.dhash64,
          sha256: hashes.sha256,
        })
        .select('id')
        .single()
      if (error) throw error
      const artworkId = a.id as string

      // 5) Mint
      setPhase('minting')
      setPct((p) => Math.max(p, 40))
      const res = await mintOnChain(metadataURI, 0)
      setTxHash(res.hash || null)
      setTokenId(res.tokenId || null)
      setPct(100)
      setPhase('complete')

      // 6) Portfolio sync
      await supabase
        .from('artworks')
        .update({ token_id: res.tokenId ?? null, tx_hash: res.hash ?? null })
        .eq('id', artworkId)

      // 7) Go to detail
      nav(`/a/${artworkId}`, { replace: true })
    } catch (e: any) {
      setErr(e?.message || 'Publish failed')
      setPhase('idle')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-2 text-h1">Create artwork</h1>
      <p className="mb-6 text-subtle">
        Upload a cover image or short video, add a title and description.
      </p>

      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Media picker */}
        <div>
          <div className="aspect-[4/3] w-full overflow-hidden rounded-lg ring-1 ring-border bg-elev1 grid place-items-center">
            {preview ? (
              file?.type.startsWith('video/') ? (
                <video src={preview} className="h-full w-full object-cover" controls />
              ) : (
                <img src={preview} className="h-full w-full object-cover" />
              )
            ) : (
              <img src={DEFAULT_COVER_URL} className="h-24 w-24 opacity-60" />
            )}
          </div>
          <input ref={pickRef} type="file" accept={ACCEPT} className="hidden" onChange={onPick} />
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={() => pickRef.current?.click()}
              className="rounded-lg bg-elev1 px-3 py-1.5 text-sm ring-1 ring-border hover:bg-elev2"
            >
              Choose file
            </button>
            {file && <span className="text-xs text-subtle">{file.name}</span>}
          </div>

          {(phase === 'uploading' || phase === 'minting') && (
            <div className="mt-3 h-2 w-full overflow-hidden rounded bg-elev1 ring-1 ring-border">
              <div className="h-full bg-brand/60 transition-all" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>

        {/* Form side */}
        <div className="space-y-4">
          <input
            className="w-full rounded-lg bg-elev1 p-3 ring-1 ring-border focus:ring-brand"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="w-full rounded-lg bg-elev1 p-3 ring-1 ring-border focus:ring-brand min-h-[120px]"
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            I am the rights holder or have permission to upload this artwork.
          </label>

          <div className="rounded-lg bg-elev1 p-3 ring-1 ring-border">
            <div className="font-medium mb-2">Similarity check</div>
            {similarBusy ? (
              <div className="text-sm text-subtle">Checking…</div>
            ) : similarErr ? (
              <div className="text-sm text-error">{similarErr}</div>
            ) : similar.length === 0 ? (
              <div className="text-sm text-subtle">No matches found.</div>
            ) : (
              <>
                <div className="text-sm mb-2">
                  Found {similar.length} potential match{similar.length > 1 ? 'es' : ''}. Please review before minting.
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {similar.map((m) => (
                    <a
                      key={`${m.id}-${m.user_id}`}
                      href={`/user/${m.user_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden rounded border border-border"
                    >
                      <img src={m.image_url} alt={m.title} className="h-24 w-full object-cover" />
                      <div className="p-2 text-xs">
                        <div className="font-medium truncate">{m.title}</div>
                        <div className="opacity-70 truncate">@{m.username}</div>
                        {typeof m.score === 'number' && (
                          <div className="opacity-60">sim: {(m.score * 100).toFixed(0)}%</div>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={reviewChecked}
                    onChange={(e) => setReviewChecked(e.target.checked)}
                  />
                  I reviewed the possible matches and confirm this upload is original or permitted.
                </label>
              </>
            )}
          </div>

          {err && <div className="text-error text-sm">{err}</div>}

          <div className="flex gap-3">
            <button
              disabled={busy}
              onClick={publish}
              className="rounded-lg bg-brand/20 px-4 py-2 text-sm ring-1 ring-brand/50 hover:bg-brand/30"
            >
              {phase === 'uploading' ? `Uploading ${pct}%…` : phase === 'minting' ? 'Waiting for wallet…' : 'Publish'}
            </button>
            <button
              disabled={busy}
              className="rounded-lg bg-elev1 px-4 py-2 text-sm ring-1 ring-border hover:bg-elev2"
              onClick={() => setErr('Saving drafts will be added next.')}
            >
              Save draft
            </button>
          </div>
        </div>
      </div>

      {/* Wallet chooser (visual) */}
      {phase === 'minting' && (
        <div className="mt-6 rounded-lg border border-border p-4">
          <div className="mb-2 text-sm uppercase tracking-wide text-subtle">Payment method → Select wallet</div>
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded bg-elev1 p-3 ring-1 ring-border">
              <div className="flex items-center gap-3">
                <span className="h-6 w-6 rounded bg-orange-500/80 grid place-items-center text-[10px]">MM</span>
                <div>MetaMask</div>
              </div>
              <span className="rounded-full bg-elev2 px-2 py-0.5 text-xs text-subtle">Installed</span>
            </div>
            {['Embedded Wallet', 'Base Account', 'Abstract'].map((name) => (
              <div
                key={name}
                className="flex items-center justify-between rounded bg-elev1/60 p-3 ring-1 ring-border/60 opacity-50"
              >
                <div className="flex items-center gap-3">
                  <span className="h-6 w-6 rounded bg-elev2 grid place-items-center text-[10px]">—</span>
                  <div>{name}</div>
                </div>
                <div className="h-4 w-4 rounded-full border border-border" />
              </div>
            ))}
            <div className="mt-2 h-2 w-full overflow-hidden rounded bg-elev1 ring-1 ring-border">
              <div className="h-full bg-brand/60 transition-all" style={{ width: `${pct}%` }} />
            </div>
            {(txHash || tokenId) && (
              <div className="mt-2 text-sm">
                {txHash && (
                  <a className="underline" href={txUrl(txHash)} target="_blank" rel="noreferrer">
                    View transaction
                  </a>
                )}
                {tokenId && (
                  <>
                    <span className="mx-2">•</span>
                    <a className="underline" href={tokenUrl(tokenId) || '#'} target="_blank" rel="noreferrer">
                      View token
                    </a>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
