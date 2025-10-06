import { useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Helmet } from 'react-helmet-async'
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
  const uname = (handle || '').toLowerCase()

  const [p, setP] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setErr(null)
        setLoading(true)
        if (!uname) { setP(null); setLoading(false); return }
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, display_name, bio, avatar_url, cover_url')
          .eq('username', uname)
          .maybeSingle()
        if (error) throw error
        if (!mounted) return
        setP((data as any) || null)
      } catch (e: any) {
        if (!mounted) return
        setErr(e?.message || 'Failed to load profile')
        setP(null)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [uname])

  const title = p?.display_name
    ? `${p.display_name} (@${p.username}) – Taedal`
    : uname ? `@${uname} – Taedal` : 'Profile – Taedal'

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <div className="h-40 w-full animate-pulse rounded-lg bg-elev1 ring-1 ring-border" />
        <div className="mt-4 flex items-center gap-4">
          <div className="h-20 w-20 animate-pulse rounded-full bg-elev1 ring-1 ring-border" />
          <div className="space-y-2">
            <div className="h-4 w-48 animate-pulse rounded bg-elev1" />
            <div className="h-3 w-32 animate-pulse rounded bg-elev1" />
          </div>
        </div>
      </div>
    )
  }

  if (err || !p) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <Helmet><title>{title}</title></Helmet>
        <div className="rounded-xl bg-elev1 p-6 ring-1 ring-border">
          <div className="text-h2 mb-2">Not found</div>
          <p className="text-subtle">That user doesn’t exist.</p>
          {err && <p className="mt-2 text-error text-sm">{err}</p>}
        </div>
      </div>
    )
  }

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
          <div>
            <div className="text-h2">{p.display_name || p.username || 'Untitled'}</div>
            <div className="text-subtle">@{p.username}</div>
          </div>
        </div>

        {p.bio && <p className="mt-4 max-w-2xl text-body">{p.bio}</p>}

        <div className="mt-8 text-subtle">Artworks will appear here.</div>
      </div>
    </>
  )
}
