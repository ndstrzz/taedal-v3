import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../state/AuthContext'
import { useProfile } from '../hooks/useProfile'
import { supabase } from '../lib/supabase'
import { DEFAULT_AVATAR_URL } from '../lib/config'

function avatarSrc(url?: string | null) {
  return url && url.length > 0 ? url : DEFAULT_AVATAR_URL
}

export default function NavBar() {
  const { user } = useAuth()
  const { profile } = useProfile()
  const nav = useNavigate()

  async function onLogout() {
    await supabase.auth.signOut()
    nav('/', { replace: true })
  }

  // ✅ change target to /u/<username>
  const myProfileHref = profile?.username ? `/u/${profile.username}` : '/account'

  return (
    <header className="sticky top-0 z-50 h-14 border-b border-border bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-3">
          <img src="/brand/taedal-logo.svg" className="h-6 w-6 rounded-md ring-1 ring-brand/40" alt="logo" />
          <span className="text-body font-medium tracking-wide">taedal</span>
        </Link>

        <nav className="flex items-center gap-6">
          <Link to="/community" className="text-sm text-text/80 hover:text-text">Community</Link>
          <Link to="/portfolio" className="text-sm text-text/80 hover:text-text">Portfolio</Link>
          <Link to="/create" className="rounded-lg bg-brand/20 px-3 py-1.5 text-sm ring-1 ring-brand/50 hover:bg-brand/30">
            Create
          </Link>

          {!user ? (
            <div className="flex items-center gap-3">
              <Link to="/login" className="text-sm text-text/80 hover:text-text">Log in</Link>
              <Link to="/signup" className="rounded-lg bg-elev1 px-3 py-1.5 text-sm ring-1 ring-border hover:bg-elev2">
                Sign up
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Link to={myProfileHref} className="flex items-center gap-2">
                <img
                  src={avatarSrc(profile?.avatar_url)}
                  className="h-7 w-7 rounded-full ring-1 ring-border object-cover"
                  alt="me"
                />
                <span className="text-sm text-text/85 hover:text-text">Profile</span>
              </Link>
              <button onClick={onLogout} className="text-sm text-subtle hover:text-text">Logout</button>
            </div>
          )}
        </nav>
      </div>
    </header>
  )
}
