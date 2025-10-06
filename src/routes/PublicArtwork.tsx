import { useParams, Link, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DEFAULT_COVER_URL } from '../lib/config'
import { useAuth } from '../state/AuthContext'
import { pinFileViaServerWithProgress } from '../lib/ipfs'

type Artwork = {
  id: string
  owner: string
  title: string
  description: string | null
  cover_url: string | null
  status: 'draft' | 'published' | 'unlisted'
  created_at: string
}
type OwnerRow = { id: string; username: string | null; display_name: string | null }

export default function PublicArtwork() {
  const { id } = useParams()
  const nav = useNavigate()
  const { user } = useAuth()

  const [art, setArt] = useState<Artwork | null>(null)
  const [owner, setOwner] = useState<OwnerRow | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [pct, setPct] = useState(0)

  const isOwner = !!(art && user && art.owner === user.id)

  useEffect(() => {
    ;(async () => {
      try {
        const { data, error } = await supabase.from('artworks').select('*').eq('id', id).maybeSingle()
        if (error) throw error
        if (!data) {
          setErr('Not found')
          return
        }
        if (data.status === 'draft' && data.owner !== user?.id) {
          setErr('This artwork is not public.')
          return
        }
        setArt(data as Artwork)
        setTitle(data.title)
        setDescription(data.description || '')

        const { data: p } = await supabase
          .from('profiles')
          .select('id, username, display_name')
          .eq('id', data.owner)
          .maybeSingle()
        setOwner((p || null) as OwnerRow | null)
      } catch (e: any) {
        setErr(e.message || 'Failed to load')
      }
    })()
  }, [id, user?.id])

  async function onToggleStatus() {
    if (!art) return
    setBusy(true)
    setErr('')
    try {
      const next = art.status === 'published' ? 'unlisted' : 'published'
      const { error } = await supabase.from('artworks').update({ status: next }).eq('id', art.id)
      if (error) throw error
      setArt({ ...art, status: next })
    } catch (e: any) {
      setErr(e.message || 'Failed to update status')
    } finally {
      setBusy(false)
    }
  }

  async function onSaveMeta() {
    if (!art) return
    setBusy(true)
    setErr('')
    try {
      const payload = {
        title: title.trim() || art.title,
        description: description.trim() || null,
      }
      const { error } = await supabase.from('artworks').update(payload).eq('id', art.id)
      if (error) throw error
      setArt({ ...art, ...payload })
      setEditOpen(false)
    } catch (e: any) {
      setErr(e.message || 'Failed to save')
    } finally {
      setBusy(false)
    }
  }

  async function onChangeCover(file: File) {
    if (!art) return
    setBusy(true)
    setPct(0)
    setErr('')
    try {
      const pin = await pinFileViaServerWithProgress(file, `cover-${art.id}`, (p) => setPct(p))
      const { error } = await supabase.from('artworks').update({ cover_url: pin.gatewayUrl }).eq('id', art.id)
      if (error) throw error
      setArt({ ...art, cover_url: pin.gatewayUrl })
    } catch (e: any) {
      setErr(e.message || 'Failed to update cover')
    } finally {
      setBusy(false)
      setPct(0)
    }
  }

  async function onDelete() {
    if (!art) return
    if (!confirm('Delete this artwork? This action cannot be undone.')) return
    setBusy(true)
    setErr('')
    try {
      const { error } = await supabase.from('artworks').delete().eq('id', art.id)
      if (error) throw error
      const to = owner?.username ? `/@${owner.username}` : '/'
      nav(to, { replace: true })
    } catch (e: any) {
      setErr(e.message || 'Failed to delete')
    } finally {
      setBusy(false)
    }
  }

  if (err && !art) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="mb-2 text-h1">Artwork</h1>
        <p className="text-subtle">{err}</p>
      </div>
    )
  }

  if (!art) return <div className="p-6 text-subtle">Loading…</div>

  const ownerName = owner?.display_name || (owner?.username ? '@' + owner.username : 'Unknown')

  return (
    <div className="mx-auto max-w-5xl p-6">
      {/* Cover */}
      <div className="mb-4 aspect-[4/3] overflow-hidden rounded-lg ring-1 ring-border bg-elev1 relative">
        <img src={art.cover_url || DEFAULT_COVER_URL} className="h-full w-full object-cover" />
        {isOwner && (
          <label className="absolute right-3 top-3 cursor-pointer rounded bg-bg/80 px-2 py-1 text-xs ring-1 ring-border hover:bg-bg">
            <input
              type="file"
              accept="image/*,video/mp4"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onChangeCover(f)
              }}
            />
            Change cover
          </label>
        )}
      </div>

      {busy && pct > 0 && (
        <div className="mb-4 h-2 w-full overflow-hidden rounded bg-elev1 ring-1 ring-border">
          <div className="h-full bg-brand/60 transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}

      {/* Heading */}
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h1 className="text-h1">{art.title}</h1>
        {isOwner && (
          <>
            <button
              onClick={() => setEditOpen(true)}
              className="rounded bg-elev1 px-2 py-1 text-xs ring-1 ring-border hover:bg-elev2"
            >
              Edit
            </button>
            <button
              onClick={onToggleStatus}
              disabled={busy}
              className="rounded bg-elev1 px-2 py-1 text-xs ring-1 ring-border hover:bg-elev2"
            >
              {art.status === 'published' ? 'Unlist' : 'Publish'}
            </button>
            <button
              onClick={onDelete}
              disabled={busy}
              className="rounded bg-red-500/20 px-2 py-1 text-xs ring-1 ring-red-500/50 hover:bg-red-500/30"
            >
              Delete
            </button>
          </>
        )}
      </div>

      <div className="mb-6 text-subtle">
        by{' '}
        {owner?.username ? (
          <Link to={`/@${owner.username}`} className="underline">
            {ownerName}
          </Link>
        ) : (
          ownerName
        )}
        <span className="mx-2">•</span>
        {new Date(art.created_at).toLocaleDateString()}
        <span className="mx-2">•</span>
        <span className="uppercase text-xs">{art.status}</span>
      </div>

      {art.description && <p className="max-w-3xl text-body">{art.description}</p>}
      {err && <div className="mt-4 text-sm text-error">{err}</div>}

      {/* Edit modal */}
      {editOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-lg bg-bg p-4 ring-1 ring-border">
            <h3 className="mb-3 text-h3">Edit artwork</h3>
            <input
              className="mb-3 w-full rounded bg-elev1 p-3 ring-1 ring-border focus:ring-brand"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
            />
            <textarea
              className="mb-4 w-full min-h-[120px] rounded bg-elev1 p-3 ring-1 ring-border focus:ring-brand"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditOpen(false)}
                className="rounded bg-elev1 px-3 py-1.5 text-sm ring-1 ring-border hover:bg-elev2"
              >
                Cancel
              </button>
              <button
                onClick={onSaveMeta}
                disabled={busy}
                className="rounded bg-brand/20 px-3 py-1.5 text-sm ring-1 ring-brand/50 hover:bg-brand/30"
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
