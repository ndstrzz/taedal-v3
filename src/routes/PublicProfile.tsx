import { useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Helmet } from 'react-helmet-async'

type Profile = {
  id: string
  username: string | null
  display_name: string | null
  bio: string | null
  avatar_url: string | null
  cover_url: string | null
}

export default function PublicProfile() {
  const params = useParams()
  // support /@:handle and /u/:handle (router gives just the string after '@')
  const handleRaw = (params.handle || '').trim()
  const handle = handleRaw.replace(/^@/, '') // safe if already clean

  const [p, setP] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string>('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setErr('')
      setLoading(true)
      try {
        if (!handle) {
          setP(null)
          setLoading(false)
          return
        }
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('username', handle)
          .maybeSingle()

        if (!mounted) return
        if (error) throw error
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
  }, [handle])

  const title =
    p?.display_name
      ? `${p.display_name} (@${p.username}) – Taedal`
      : handle
        ? `@${handle} – Taedal`
        : 'Profile – Taedal'

  return (
    <>
      <Helmet><title>{title}</title></Helmet>

      <div className="mx-auto max-w-5xl p-6">
        {loading && (
          <div className="rounded-lg bg-elev1 p-4 ring-1 ring-border">
            <div className="h-40 w-full animate-pulse rounded-lg bg-elev2" />
            <div className="mt-4 flex items-center gap-4">
              <div className="h-20 w-20 animate-pulse rounded-full bg-elev2" />
              <div className="space-y-2">
                <div className="h-5 w-40 animate-pulse rounded bg-elev2" />
                <div className="h-4 w-24 animate-pulse rounded bg-elev2" />
              </div>
            </div>
          </div>
        )}

        {!loading && (err || !p) && (
          <div className="rounded-lg bg-elev1 p-4 ring-1 ring-border">
            <div className="text-h2 mb-1">Profile not found</div>
            <div className="text-subtle">
              {err ? err : `No user with handle “${handle}”.`}
            </div>
          </div>
        )}

        {!loading && p && (
          <>
            <div className="h-40 w-full overflow-hidden rounded-lg ring-1 ring-border bg-elev1">
              {p.cover_url && <img src={p.cover_url} className="h-full w-full object-cover" />}
            </div>

            <div className="mt-4 flex items-center gap-4">
              <div className="h-20 w-20 overflow-hidden rounded-full ring-1 ring-border bg-elev1">
                {p.avatar_url && <img src={p.avatar_url} className="h-full w-full object-cover" />}
              </div>
              <div>
                <div className="text-h2">{p.display_name || 'Untitled'}</div>
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
