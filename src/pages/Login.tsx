import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../state/AuthContext'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const nav = useNavigate()
  const loc = useLocation() as any
  const { error: bootError } = useAuth()

  useEffect(() => {
    if (bootError) setErr(bootError)
    if (loc.state?.notice) setNotice(loc.state.notice)
  }, [bootError, loc.state])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        // Common case when email confirmation is enabled
        if (/confirm/i.test(error.message)) {
          setErr('Please confirm your email first. Check your inbox.')
          return
        }
        throw error
      }

      // Navigate home; quick fallback to force UI to pick up session if needed
      nav('/', { replace: true })
      setTimeout(() => {
        if (window.location.pathname !== '/') {
          window.location.replace('/')
        }
      }, 0)
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to sign in')
    } finally {
      setBusy(false)
    }
  }

  async function loginWithGoogle() {
    setErr('')
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      })
      if (error) throw error
      // Supabase will redirect; nothing else to do.
    } catch (e: any) {
      setErr(e?.message ?? 'Google sign-in failed')
    }
  }

  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="mb-6 text-h1">Log in</h1>

      {notice && <div className="mb-4 rounded-lg bg-elev1 p-3 text-sm ring-1 ring-border">{notice}</div>}

      <form onSubmit={onSubmit} className="space-y-4">
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg bg-elev1 p-3 ring-1 ring-border focus:outline-none focus:ring-brand"
          required
        />
        <input
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg bg-elev1 p-3 ring-1 ring-border focus:outline-none focus:ring-brand"
          required
        />
        {err && <div className="text-error text-sm">{err}</div>}
        <button
          disabled={busy}
          className="w-full rounded-lg bg-brand/20 p-3 text-sm ring-1 ring-brand/50 hover:bg-brand/30"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <button
        onClick={loginWithGoogle}
        className="mt-4 w-full rounded-lg bg-elev1 p-3 text-sm ring-1 ring-border hover:bg-elev2"
      >
        Continue with Google
      </button>

      <p className="mt-4 text-sm text-subtle">
        Don’t have an account?{' '}
        <Link to="/signup" className="text-text underline">
          Sign up
        </Link>
      </p>
    </div>
  )
}
