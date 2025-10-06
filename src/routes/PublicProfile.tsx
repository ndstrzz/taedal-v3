// src/routes/PublicProfile.tsx
import { useParams, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Helmet } from 'react-helmet-async'
import { useAuth } from '../state/AuthContext'
import { DEFAULT_AVATAR_URL, DEFAULT_COVER_URL } from '../lib/config'

type Profile = {
  id: string
  username: string | null
  display_name: string | null
  bio: string | null
  avatar_url: string | null
  cover_url: string | null
}

export default function PublicProfile() {
  const { handle } = useParams()
  const { user } = useAuth()
  const [p, setP] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      if (!handle) { setP(null); setLoading(false); return }
      const uname = handle.replace(/^@/, '')
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', uname)
        .maybeSingle()
      if (mounted) { setP((data as any) || null); setLoading(false) }
    })()
    return () => { mounted = false }
  }, [handle])

  const title = p?.display_name
    ? `${p.display_name} (@${p.username}) – Taedal`
    : handle ? `@${handle.replace(/^@/,'')} – Taedal` : 'Profile – Taedal'

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <div className="text-subtle">Loading…</div>
      </div>
    )
  }

  if (!p) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <Helmet><title>{title}</title></Helmet>
        <div className="text-h2 mb-2">Not found</div>
        <div className="text-subtle">That page doesn’t exist.</div>
      </div>
    )
  }

  const isOwner = user?.id === p.id

  return (
    <>
      <Helmet><title>{title}</title></Helmet>

      <div className="mx-auto max-w-5xl p-6">
        <div className="h-40 w-full overflow-hidden rounded-lg ring-1 ring-border bg-elev1">
          <img src={p.cover_url || DEFAULT_COVER_URL} className="h-full w-full object-cover" />
        </div>

        <div className="mt-4 flex items-center gap-4">
          <div className="h-20 w-20 overflow-hidden rounded-full ring-1 ring-border bg-elev1">
            <img src={p.avatar_url || DEFAULT_AVATAR_URL} className="h-full w-full object-cover" />
          </div>
          <div className="flex-1">
            <div className="text-h2">{p.display_name || `@${p.username}`}</div>
            <div className="text-subtle">@{p.username}</div>
          </div>
          {isOwner && (
            <Link
              to="/settings"
              className="rounded-lg bg-elev1 px-3 py-1.5 text-sm ring-1 ring-border hover:bg-elev2"
            >
              Edit profile
            </Link>
          )}
        </div>

        {p.bio && <p className="mt-4 max-w-2xl text-body">{p.bio}</p>}

        {/* Grid of artworks can go here in the future */}
        <div className="mt-8 text-subtle">Artworks will appear here.</div>
      </div>
    </>
  )
}
