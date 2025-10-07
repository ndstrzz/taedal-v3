import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useAuth } from "../state/AuthContext";
import { supabase } from "../lib/supabase";
import { destinationAfterAuth } from "../lib/profile";
import "../index.css";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const next = params.get("next");
  const { user, loading } = useAuth();

  const [form, setForm] = useState({ email: "", password: "" });
  const [showPw, setShowPw] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // If already logged in, decide destination (/@username or /settings)
  useEffect(() => {
    (async () => {
      if (!loading && user) {
        const dest = await destinationAfterAuth(user.id, next);
        navigate(dest, { replace: true });
      }
    })();
  }, [loading, user, next, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: form.email.trim(),
      password: form.password,
    });
    setBusy(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    if (data.user) {
      const dest = await destinationAfterAuth(data.user.id, next);
      navigate(dest, { replace: true });
    }
  }

  async function googleSignIn() {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // Return to /login so this component can route you to /@username or /settings
        redirectTo: `${window.location.origin}/login?next=${encodeURIComponent(next || "")}`,
      },
    });
    setBusy(false);
    if (error) setMsg(error.message);
  }

  // Optional: show notice from redirects (e.g., from signup)
  const stateNotice = (location.state as any)?.notice;

  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="mb-4 text-2xl font-semibold">Log in</h1>

      {(stateNotice || msg) && (
        <div className="mb-3 text-sm">
          {stateNotice && <div className="text-neutral-300">{stateNotice}</div>}
          {msg && <div className="text-red-400">{msg}</div>}
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

      <p className="mt-4 text-sm text-neutral-400">
        Don’t have an account?{" "}
        <Link className="underline" to={`/signup?next=${encodeURIComponent(next || "")}`}>
          Sign up
        </Link>
      </p>
    </div>
  );
}
