import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { DEFAULT_AVATAR_URL, DEFAULT_COVER_URL } from '../lib/config'
import { useAuth } from '../state/AuthContext'

type Profile = {
  id: string
  username: string | null
  display_name: string | null
  bio: string | null
  avatar_url: string | null
  cover_url: string | null
}

type Artwork = {
  id: string
  title: string | null
  cover_url: string | null
  status: string | null
  owner: string
}

export default function PublicProfile() {
  const { handle } = useParams()
  const { user } = useAuth()
  const [p, setP] = useState<Profile | null>(null)
  const [arts, setArts] = useState<Artwork[]>([])
  const [loading, setLoading] = useState(true)

  // Load profile + artworks
  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      const uname = (handle || '').replace(/^@/, '')
      if (!uname) { setP(null); setArts([]); setLoading(false); return }

      const { data: prof } = await supabase
        .from('profiles')
        .select('id, username, display_name, bio, avatar_url, cover_url')
        .eq('username', uname)
        .maybeSingle()

      if (!mounted) return
      setP((prof as any) || null)

      if (prof?.id) {
        const { data: rows } = await supabase
          .from('artworks')
          .select('id, title, cover_url, status, owner')
          .eq('owner', prof.id)
          .eq('status', 'published')
          .order('created_at', { ascending: false })
        setArts((rows as any) || [])
      } else {
        setArts([])
      }

      setLoading(false)
    })()
    return () => { mounted = false }
  }, [handle])

  const isOwner = useMemo(() => !!(user && p && user.id === p.id), [user, p])

  const posts = arts.length
  const followers = 0   // TODO: hook up when follow system exists
  const following = 0   // TODO: hook up when follow system exists

  if (loading) {
    return <div className="py-10 text-subtle">Loading…</div>
  }

  if (!p) {
    return (
      <div className="py-10">
        <div className="text-h2 mb-2">User not found</div>
        <p className="text-subtle">We couldn’t find this profile.</p>
      </div>
    )
  }

  return (
    <div className="pb-10">
      {/* Cover */}
      <div className="mt-4 h-40 w-full overflow-hidden rounded-lg ring-1 ring-border bg-elev1">
        <img
          src={p.cover_url || DEFAULT_COVER_URL}
          className="h-full w-full object-cover"
        />
      </div>

      {/* Header */}
      <div className="mt-4 flex items-center gap-4">
        <div className="h-24 w-24 overflow-hidden rounded-full ring-1 ring-border bg-elev1">
          <img
            src={p.avatar_url || DEFAULT_AVATAR_URL}
            className="h-full w-full object-cover"
          />
        </div>
        <div className="flex-1">
          <div className="text-h2">{p.display_name || p.username || 'Untitled'}</div>
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

      {/* Bio */}
      {p.bio && <p className="mt-3 max-w-2xl text-body">{p.bio}</p>}

      {/* Stats */}
      <div className="mt-4 flex items-center gap-6 text-sm">
        <div><span className="font-medium">{posts}</span> posts</div>
        <div><span className="font-medium">{followers}</span> followers</div>
        <div><span className="font-medium">{following}</span> following</div>
      </div>

      {/* Grid */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        {arts.map(a => (
          <Link
            key={a.id}
            to={`/a/${a.id}`}
            className="group block overflow-hidden rounded-lg ring-1 ring-border bg-elev1"
            title={a.title || 'Artwork'}
          >
            <img
              src={a.cover_url || '/brand/taedal-logo.svg'}
              className="aspect-square w-full object-cover transition-transform group-hover:scale-[1.03]"
            />
          </Link>
        ))}
        {arts.length === 0 && (
          <div className="col-span-full rounded-lg bg-elev1 p-6 text-subtle ring-1 ring-border">
            No published artworks yet.
          </div>
        )}
      </div>
    </div>
  )
}
