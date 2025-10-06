import { useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { supabase } from '../lib/supabase'
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
  const { handle } = useParams<{ handle: string }>()
  const [p, setP] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const uname = (handle || '').replace(/^@/, '').trim()

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setErr(null)
      setLoading(true)
      setP(null)
      try {
        if (!uname) {
          setErr('No username provided.')
          return
        }
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, display_name, bio, avatar_url, cover_url')
          .eq('username', uname)
          .maybeSingle()
        if (error) throw error
        if (mounted) setP((data as any) ?? null)
        if (mounted && !data) setErr('Profile not found')
      } catch (e: any) {
        if (mounted) setErr(e?.message || 'Failed to load profile')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [uname])

  const title = p?.display_name
    ? `${p.display_name} (@${p.username}) – Taedal`
    : uname ? `@${uname} – Taedal` : 'Profile – Taedal'

  return (
    <>
      <Helmet><title>{title}</title></Helmet>

      <div className="mx-auto max-w-5xl p-6">
        {loading && (
          <div className="space-y-4 animate-pulse">
            <div className="h-40 w-full rounded-lg bg-elev1 ring-1 ring-border" />
            <div className="mt-4 flex items-center gap-4">
              <div className="h-20 w-20 rounded-full bg-elev1 ring-1 ring-border" />
              <div className="space-y-2">
                <div className="h-6 w-48 rounded bg-elev1" />
                <div className="h-4 w-32 rounded bg-elev1" />
              </div>
            </div>
            <div className="h-24 w-full rounded bg-elev1" />
          </div>
        )}

        {!loading && err && (
          <div className="rounded-lg bg-elev1 p-4 ring-1 ring-border">
            <div className="text-error">{err}</div>
          </div>
        )}

        {!loading && !err && p && (
          <>
            <div className="h-40 w-full overflow-hidden rounded-lg ring-1 ring-border bg-elev1">
              <img
                src={p.cover_url || DEFAULT_COVER_URL}
                className="h-full w-full object-cover"
                alt="cover"
              />
            </div>

            <div className="mt-4 flex items-center gap-4">
              <div className="h-20 w-20 overflow-hidden rounded-full ring-1 ring-border bg-elev1">
                <img
                  src={p.avatar_url || DEFAULT_AVATAR_URL}
                  className="h-full w-full object-cover"
                  alt="avatar"
                />
              </div>
              <div>
                <div className="text-h2">{p.display_name || p.username || 'Untitled'}</div>
                <div className="text-subtle">@{p.username}</div>
              </div>
            </div>

            {p.bio && <p className="mt-4 max-w-2xl text-body">{p.bio}</p>}
          </>
        )}
      </div>
    </>
  )
}
