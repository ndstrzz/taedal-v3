import { Link, useNavigate } from 'react-router-dom'
import ConnectWallet from './ConnectWallet'
import { useAuth } from '../state/AuthContext'
import { supabase } from '../lib/supabase'
import { useProfile } from '../hooks/useProfile'

function avatarLetter(email?: string | null) {
  return (email?.[0] || 'U').toUpperCase()
}

export default function NavBar() {
  const { user, loading } = useAuth()
  const { profile } = useProfile()
  const nav = useNavigate()

  async function onLogout() {
    try { await supabase.auth.signOut() } finally {
      nav('/', { replace: true })
    }
  }

  const myProfileHref = profile?.username ? `/@${profile.username}` : '/account'

  return (
    <header className="sticky top-0 z-50 h-14 border-b border-border bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-3">
          <img src="/brand/taedal-logo.svg" className="h-6 w-6 rounded-md ring-1 ring-brand/40" alt="logo" />
          <span className="text-body font-medium tracking-wide text-text">taedal</span>
        </Link>

        <nav className="flex items-center gap-6">
          <Link to="/community" className="text-sm text-text/80 hover:text-text">Community</Link>
          <Link to="/portfolio" className="text-sm text-text/80 hover:text-text">Portfolio</Link>

          {/* Mint pill always visible; send authed users straight to Create */}
          <Link
            to={user ? '/create' : '/login'}
            className="rounded-lg bg-brand/20 px-3 py-1.5 text-sm text-text ring-1 ring-brand/50 hover:bg-brand/30"
          >
            Mint
          </Link>

          {/* Right side */}
          {loading ? (
            // Small skeleton to avoid flicker
            <div className="flex items-center gap-3">
              <div className="h-7 w-20 rounded bg-elev1 animate-pulse" />
              <div className="h-7 w-24 rounded bg-elev1 animate-pulse" />
            </div>
          ) : user ? (
            <div className="flex items-center gap-3">
              <Link
                to="/create"
                className="rounded-lg bg-brand/20 px-3 py-1.5 text-sm ring-1 ring-brand/50 hover:bg-brand/30"
              >
                Create
              </Link>

              <Link to={myProfileHref} className="flex items-center gap-2">
                <div className="grid h-7 w-7 place-items-center rounded-full bg-elev1 ring-1 ring-border">
                  <span className="text-xs">{avatarLetter(user.email)}</span>
                </div>
                <span className="text-sm text-text/85 hover:text-text">Profile</span>
              </Link>

              <button onClick={onLogout} className="text-sm text-subtle hover:text-text">Logout</button>

              <ConnectWallet />
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Link to="/login" className="text-sm text-text/80 hover:text-text">Log in</Link>
              <Link to="/signup" className="rounded-lg bg-elev1 px-3 py-1.5 text-sm ring-1 ring-border hover:bg-elev2">
                Sign up
              </Link>
              <ConnectWallet />
            </div>
          )}
        </nav>
      </div>
    </header>
  )
}
