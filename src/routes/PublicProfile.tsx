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
  const { handle } = useParams<{ handle: string }>()
  const [p, setP] = useState<Profile | null>(null)
  const uname = handle?.replace(/^@/, '')

  useEffect(() => {
    if (!uname) return
    ;(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', uname)
        .maybeSingle()
      setP(data as any)
    })()
  }, [uname])

  const title = p?.display_name
    ? `${p.display_name} (@${p.username}) – Taedal`
    : uname ? `@${uname} – Taedal` : 'Profile – Taedal'

  return (
    <>
      <Helmet><title>{title}</title></Helmet>

      <div className="mx-auto max-w-5xl p-6">
        {/* cover */}
        <div className="h-40 w-full overflow-hidden rounded-lg ring-1 ring-border bg-elev1">
          <img
            src={p?.cover_url || DEFAULT_COVER_URL}
            className="h-full w-full object-cover"
          />
        </div>

        {/* avatar + meta */}
        <div className="mt-4 flex items-center gap-4">
          <div className="h-20 w-20 overflow-hidden rounded-full ring-1 ring-border bg-elev1">
            <img
              src={p?.avatar_url || DEFAULT_AVATAR_URL}
              className="h-full w-full object-cover"
            />
          </div>
          <div>
            <div className="text-h2">{p?.display_name || uname || 'Untitled'}</div>
            <div className="text-subtle">@{p?.username || uname}</div>
          </div>
        </div>

        {p?.bio && <p className="mt-4 max-w-2xl text-body">{p.bio}</p>}

        {/* TODO: show artwork grid here */}
        <div className="mt-8 text-subtle">Artwork grid coming soon…</div>
      </div>
    </>
  )
}
