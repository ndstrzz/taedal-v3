import { useParams, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { supabase } from '../lib/supabase'
import { DEFAULT_AVATAR_URL, DEFAULT_COVER_URL } from '../lib/config'

type ProfileRow = {
  id: string
  username: string
  display_name: string | null
  role: 'artist' | 'collector' | 'brand' | null
  bio: string | null
  website: string | null
  instagram: string | null
  behance: string | null
  twitter: string | null
  avatar_url: string | null
  cover_url: string | null
  verified_at: string | null
}

export default function PublicProfile() {
  const { username } = useParams()
  const [p, setP] = useState<ProfileRow | null>(null)
  const [err, setErr] = useState<string>('')

  useEffect(() => {
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('username', (username || '').toLowerCase())
          .maybeSingle()
        if (error) throw error
        if (!data) { setErr('Not found'); return }
        setP(data as any)
      } catch (e: any) {
        setErr(e.message || 'Failed to load')
      }
    })()
  }, [username])

  if (err && !p) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="mb-2 text-h1">Profile not found</h1>
        <p className="text-subtle">We couldn’t find <span className="text-text">@{username}</span>.</p>
        <div className="mt-4">
          <Link className="underline" to="/">Go home</Link>
        </div>
      </div>
    )
  }

  if (!p) return <div className="p-6 text-subtle">Loading…</div>

  const title = `${p.display_name || '@' + p.username} — Taedal`
  const desc = p.bio || 'Artist profile on Taedal'

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={desc} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={desc} />
        <meta property="og:image" content={p.cover_url || p.avatar_url || DEFAULT_COVER_URL} />
      </Helmet>

      {/* Cover */}
      <div className="mb-6 h-48 w-full bg-elev1 ring-1 ring-border">
        <img
          src={p.cover_url || DEFAULT_COVER_URL}
          alt="cover"
          className="h-full w-full object-cover"
        />
      </div>

      <div className="mx-auto max-w-6xl px-4">
        {/* Header */}
        <div className="mb-6 flex items-end gap-4">
          <div className="h-24 w-24 -mt-16 overflow-hidden rounded-full ring-2 ring-bg shadow-card">
            <img
              src={p.avatar_url || DEFAULT_AVATAR_URL}
              alt="avatar"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="text-h1">{p.display_name || '@' + p.username}</h1>
              {p.verified_at && (
                <span title="Verified" className="grid h-6 w-6 place-items-center rounded-full bg-brand/20 ring-1 ring-brand/40">
                  ✓
                </span>
              )}
            </div>
            <div className="text-subtle">@{p.username}{p.role ? ` • ${p.role}` : ''}</div>
          </div>
        </div>

        {/* Bio */}
        {p.bio && <p className="mb-6 max-w-3xl text-body">{p.bio}</p>}

        {/* Socials */}
        <div className="mb-10 flex flex-wrap items-center gap-4 text-sm">
          {p.website && <a className="underline text-text/90 hover:text-text" href={p.website} target="_blank">Website</a>}
          {p.instagram && <a className="underline text-text/90 hover:text-text" href={p.instagram} target="_blank">Instagram</a>}
          {p.behance && <a className="underline text-text/90 hover:text-text" href={p.behance} target="_blank">Behance</a>}
          {p.twitter && <a className="underline text-text/90 hover:text-text" href={p.twitter} target="_blank">X / Twitter</a>}
        </div>

        {/* Artworks */}
        <h2 className="mb-3 text-h2">Artworks</h2>
        <ProfileArtworks userId={p.id} />
      </div>
    </>
  )
}

/* ---- Helper component: latest artworks grid for this user ---- */
function ProfileArtworks({ userId }: { userId: string }) {
  const [rows, setRows] = useState<any[]>([])

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('artworks')
        .select('id, title, cover_url, status, created_at')
        .eq('owner', userId)
        .in('status', ['published','unlisted'])
        .order('created_at', { ascending: false })
        .limit(12)
      setRows(data || [])
    })()
  }, [userId])

  if (!rows.length) return <div className="text-subtle">No artworks yet.</div>

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {rows.map((a) => (
        <Link key={a.id} to={`/a/${a.id}`} className="group">
          <div className="aspect-[4/5] overflow-hidden rounded-lg ring-1 ring-border bg-elev1">
            <img
              src={a.cover_url || DEFAULT_COVER_URL}
              className="h-full w-full object-cover group-hover:scale-[1.02] transition-transform"
            />
          </div>
          <div className="mt-2 line-clamp-1 text-sm">{a.title}</div>
        </Link>
      ))}
    </div>
  )
}
