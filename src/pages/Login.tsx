import React, { useEffect, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { useAuth } from "../state/AuthContext"
import { supabase } from "../lib/supabase"
import "../index.css"

export default function Login() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get("next") || "/"
  const confirmed = params.get("confirmed")
  const noticeParam = params.get("notice")

  const { user, loading } = useAuth()

  const [form, setForm] = useState({ email: "", password: "" })
  const [showPw, setShowPw] = useState(false)
  const [msg, setMsg] = useState<string | null>(noticeParam ? decodeURIComponent(noticeParam) : null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // If auth hash tokens came back (after clicking email link), Supabase will
    // recover the session on first load. Then we can redirect.
    if (!loading && user) {
      navigate(next, { replace: true })
    }
  }, [loading, user, next, navigate])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const { data, error } = await supabase.auth.signInWithPassword({
      email: form.email.trim(),
      password: form.password,
    })
    setBusy(false)
    if (error) {
      // Special UX for unconfirmed email
      if (/Email not confirmed/i.test(error.message)) {
        setMsg("Email not confirmed. Check your inbox, or resend the confirmation email below.")
      } else {
        setMsg(error.message)
      }
      return
    }
    if (data.user) {
      navigate(next, { replace: true })
    }
  }

  async function googleSignIn() {
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/login?confirmed=1" },
    })
    setBusy(false)
    if (error) setMsg(error.message)
  }

  async function resendConfirmation() {
    if (!form.email) {
      setMsg("Enter your email above, then click Resend confirmation.")
      return
    }
    try {
      setBusy(true)
      setMsg(null)
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: form.email.trim(),
        options: { emailRedirectTo: window.location.origin + "/login?confirmed=1" },
      })
      setBusy(false)
      if (error) throw error
      setMsg("Confirmation email sent. Check your inbox.")
    } catch (e: any) {
      setMsg(e?.message || "Failed to resend confirmation.")
    }
  }

  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-semibold mb-4">Log in</h1>

      {(confirmed || msg) && (
        <div className="mb-3 rounded-lg border border-green-600/40 bg-green-500/10 p-3 text-sm text-green-200">
          {confirmed ? "Email confirmed! You can sign in now." : msg}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block">
          <span className="text-sm">Email</span>
          <input
            type="email"
            className="mt-1 w-full rounded-xl bg-neutral-900 border border-neutral-800 px-3 py-2"
            value={form.email}
            onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
            required
          />
        </label>

        <label className="block">
          <span className="text-sm">Password</span>
          <div className="mt-1 flex">
            <input
              type={showPw ? "text" : "password"}
              className="flex-1 rounded-l-xl bg-neutral-900 border border-neutral-800 px-3 py-2"
              value={form.password}
              onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))}
              required
            />
            <button
              type="button"
              className="rounded-r-xl border border-l-0 border-neutral-800 px-3 text-xs"
              onClick={() => setShowPw((s) => !s)}
            >
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
        </label>

        <button
          className="w-full rounded-xl bg-white text-black py-2 font-medium disabled:opacity-60"
          disabled={busy}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <button
          type="button"
          onClick={googleSignIn}
          className="w-full rounded-xl border border-neutral-700 py-2 text-sm"
          disabled={busy}
        >
          Continue with Google
        </button>
      </form>

      <div className="mt-3">
        <button
          type="button"
          onClick={resendConfirmation}
          className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-900"
          disabled={busy}
        >
          Resend confirmation email
        </button>
      </div>

      <p className="mt-4 text-sm text-neutral-400">
        Don’t have an account?{" "}
        <Link className="underline" to={`/signup?next=${encodeURIComponent(next)}`}>
          Sign up
        </Link>
      </p>
    </div>
  )
}
