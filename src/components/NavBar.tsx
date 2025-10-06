import { Link, useNavigate } from 'react-router-dom'
import ConnectWallet from './ConnectWallet'
import { useAuth } from '../state/AuthContext'
import { useProfile } from '../hooks/useProfile'
import { supabase } from '../lib/supabase'
import { DEFAULT_AVATAR_URL } from '../lib/config'
import { useEffect, useState } from 'react'

function avatarLetter(email?: string | null) {
  if (!email) return 'U'
  return email.charAt(0).toUpperCase()
}

export default function NavBar() {
  const { user } = useAuth()
  const { profile } = useProfile()
  const nav = useNavigate()

  // bust the avatar cache whenever settings are saved
  const [bustKey, setBustKey] = useState<number>(0)
  useEffect(() => {
    const onUpd = () => setBustKey(Date.now())
    window.addEventListener('profile-updated', onUpd)
    return () => window.removeEventListener('profile-updated', onUpd)
  }, [])

  async function onLogout() {
    try { await supabase.auth.signOut() } finally { nav('/', { replace: true }) }
  }

  const myHref = profile?.username ? `/@${profile.username}` : '/settings'
  const avatarSrc =
    (profile?.avatar_url ? `${profile.avatar_url}${profile.avatar_url.includes('?') ? '&' : '?'}v=${bustKey}` : null) ||
    DEFAULT_AVATAR_URL

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
              {/* Profile avatar → public profile */}
              <Link to={myHref} className="flex items-center gap-2">
                <div className="grid h-7 w-7 place-items-center overflow-hidden rounded-full bg-elev1 ring-1 ring-border">
                  {profile?.avatar_url ? (
                    <img src={avatarSrc} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs">{avatarLetter(user.email)}</span>
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
