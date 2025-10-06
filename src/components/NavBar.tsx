// src/components/NavBar.tsx
import { Link, useNavigate } from 'react-router-dom'
import ConnectWallet from './ConnectWallet'
import { useAuth } from '../state/AuthContext'
import { supabase } from '../lib/supabase'
import { useProfile } from '../hooks/useProfile'

function avatarLabel(email?: string | null) {
  if (!email) return 'U'
  return email.charAt(0).toUpperCase()
}

export default function NavBar() {
  const { user } = useAuth()
  const { profile } = useProfile()
  const nav = useNavigate()

  async function onLogout() {
    await supabase.auth.signOut()
    nav('/', { replace: true })
  }

  const profileHref = profile?.username ? `/@${profile.username}` : '/settings'

  return (
    <header className="sticky top-0 z-50 h-14 border-b border-border bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4">
        {/* ✅ Logo -> landing page */}
        <Link to="/" className="flex items-center gap-3">
          <img src="/brand/taedal-logo.svg" className="h-6 w-6 rounded-md ring-1 ring-brand/40" alt="logo" />
          <span className="text-body font-medium tracking-wide">taedal</span>
        </Link>

        <nav className="flex items-center gap-6">
          <Link to="/community" className="text-sm text-text/80 hover:text-text">Community</Link>
          <Link to="/portfolio" className="text-sm text-text/80 hover:text-text">Portfolio</Link>
          <Link to="/create" className="rounded-lg bg-brand/20 px-3 py-1.5 text-sm text-text ring-1 ring-brand/50 hover:bg-brand/30">
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
              {/* ✅ Profile link smartly points to public profile or settings */}
              <Link to={profileHref} className="flex items-center gap-2">
                <div className="grid h-7 w-7 place-items-center overflow-hidden rounded-full bg-elev1 ring-1 ring-border">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} className="h-full w-full object-cover" alt="avatar" />
                  ) : (
                    <span className="text-xs">{avatarLabel(user.email)}</span>
                  )}
                </div>
                <span className="text-sm text-text/85 hover:text-text">Profile</span>
              </Link>

              <button onClick={onLogout} className="text-sm text-subtle hover:text-text">Logout</button>
            </div>
          )}

          <ConnectWallet />
        </nav>
      </div>
    </header>
  )
}
