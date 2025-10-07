import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import useDebounce from "../hooks/useDebounce";
import { ensureProfileRow } from "../lib/profile";

const roles = [
  { key: "artist", label: "Artist" },
  { key: "collector", label: "Collector" },
  { key: "brand", label: "Brand" },
] as const;

export default function Signup() {
  const [params] = useSearchParams();
  const next = params.get("next") || undefined;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const dUsername = useDebounce(username.toLowerCase().trim(), 400);
  const [usernameFree, setUsernameFree] = useState<boolean | null>(null);

  const [role, setRole] = useState<typeof roles[number]["key"]>("artist");
  const [invite, setInvite] = useState("");
  const [agree, setAgree] = useState(false);

  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  function validateUsername(u: string) {
    return /^[a-z0-9_]{3,20}$/.test(u);
  }

  // Username availability (HEAD count)
  useEffect(() => {
    let cancelled = false;
    async function run() {
      setUsernameFree(null);
      if (!validateUsername(dUsername)) return;
      const { count, error } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("username", dUsername);
      if (!cancelled) setUsernameFree(!error && (count ?? 0) === 0);
    }
    if (dUsername) run();
    return () => {
      cancelled = true;
    };
  }, [dUsername]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");

    const uname = username.toLowerCase().trim();
    if (!validateUsername(uname)) {
      setErr("Username must be 3–20 chars a–z 0–9 _.");
      return;
    }
    if (usernameFree === false) {
      setErr("That username is taken.");
      return;
    }
    if (!agree) {
      setErr("Please agree to the Terms & Privacy.");
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;

      // If email confirmations are ON, there is no session yet
      if (!data.session) {
        nav("/login", {
          state: { notice: "Check your email to confirm your account, then log in." },
        });
        return;
      }

      // We have a session → upsert profile immediately
      const user = data.session.user;
      await ensureProfileRow(user.id);

      const { error: upErr } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          username: uname,
          display_name: displayName.trim(),
          role,
          invite_code: invite || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );
      if (upErr) throw upErr;

      // Straight to their profile
      nav(`/@${uname}`, { replace: true });
    } catch (e: any) {
      setErr(e?.message || "Sign up failed");
    } finally {
      setBusy(false);
    }
  }

  async function signupWithGoogle() {
    setErr("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/login?next=${encodeURIComponent(next || "")}`,
        },
      });
      if (error) throw error;
    } catch (e: any) {
      setErr(e?.message || "Google sign-in failed");
    }
  }

  const unameHint = useMemo(() => {
    if (!username) return "";
    if (!validateUsername(username)) return "Use 3–20 lowercase letters, numbers, or _.";
    if (usernameFree === null) return "Checking availability…";
    return usernameFree ? "Available ✓" : "Taken ✕";
  }, [username, usernameFree]);

  return (
    <div className="mx-auto max-w-lg p-6">
      <h1 className="mb-2 text-h1">Create your account</h1>
      <p className="mb-6 text-subtle">A few details to get you started. You can refine your profile after.</p>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <input
            type="text"
            placeholder="Display name (e.g., KURO Studio)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-lg bg-elev1 p-3 ring-1 ring-border focus:outline-none focus:ring-brand"
            required
          />
          <div className="space-y-1">
            <div className="flex items-center">
              <span className="mr-2 text-subtle">@</span>
              <input
                type="text"
                placeholder="username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                className="w-full rounded-lg bg-elev1 p-3 ring-1 ring-border focus:outline-none focus:ring-brand"
                required
              />
            </div>
            <div
              className={`text-xs ${
                usernameFree ? "text-success" : usernameFree === false ? "text-error" : "text-subtle"
              }`}
            >
              {unameHint}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
            placeholder="Password (min 6 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg bg-elev1 p-3 ring-1 ring-border focus:outline-none focus:ring-brand"
            required
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-2 text-sm text-subtle">I am a</span>
          {roles.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRole(r.key)}
              className={`rounded-full px-3 py-1 text-sm ring-1 ${
                role === r.key ? "bg-brand/20 ring-brand/50" : "bg-elev1 ring-border hover:bg-elev2"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Invite code (optional)"
          value={invite}
          onChange={(e) => setInvite(e.target.value)}
          className="w-full rounded-lg bg-elev1 p-3 ring-1 ring-border focus:outline-none focus:ring-brand"
        />

        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>
            I agree to the{" "}
            <a className="underline" href="#" onClick={(e) => e.preventDefault()}>
              Terms
            </a>{" "}
            and{" "}
            <a className="underline" href="#" onClick={(e) => e.preventDefault()}>
              Privacy
            </a>
            .
          </span>
        </label>

        {err && <div className="text-error text-sm">{err}</div>}

        <button
          disabled={busy}
          className="w-full rounded-lg bg-brand/20 p-3 text-sm ring-1 ring-brand/50 hover:bg-brand/30"
        >
          {busy ? "Creating…" : "Create account"}
        </button>

        <button
          type="button"
          onClick={signupWithGoogle}
          className="w-full rounded-lg bg-elev1 p-3 text-sm ring-1 ring-border hover:bg-elev2"
        >
          Continue with Google
        </button>
      </form>

      <p className="mt-6 text-sm text-subtle">
        Already have an account? <Link to="/login" className="text-text underline">Log in</Link>
      </p>
    </div>
  );
}
