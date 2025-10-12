// src/pages/CheckoutSuccess.tsx
import React, { useEffect, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api"; // ensures Authorization header is sent with the Supabase access token
import { useAuth } from "../state/AuthContext"; // for session/token if your apiFetch doesn't inject it

export default function CheckoutSuccess() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const sid = params.get("sid") || "";

  const { user } = useAuth(); // only to conditionally show CTA; not strictly required
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState("");
  const [artworkId, setArtworkId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // Hit the finalize endpoint (verifies paid, fills listing, transfers ownership, logs activity)
        const out = await apiFetch(`/api/checkout/finalize?sid=${encodeURIComponent(sid)}`, {
          method: "POST",
        });

        // Optionally navigate to the artwork page immediately
        const newArtworkId = out?.artwork?.id ?? null;
        setArtworkId(newArtworkId);
        setStatus("ok");
        setMessage(`Payment confirmed. Session: ${sid}`);

        // Auto redirect after a short delay (optional)
        // if (newArtworkId) setTimeout(() => navigate(`/a/${newArtworkId}`), 1500);
      } catch (e: any) {
        setStatus("error");
        setMessage(e?.message || "Could not finalize your purchase.");
      }
    })();
  }, [sid, navigate]);

  return (
    <div className="mx-auto max-w-xl p-8 text-center">
      {status === "loading" && <div>Confirming your payment…</div>}

      {status === "ok" && (
        <>
          <h1 className="mb-2 text-2xl font-semibold">Payment successful 🎉</h1>
          <p className="mb-6 text-sm text-neutral-400">{message}</p>

          <div className="flex items-center justify-center gap-3">
            {artworkId ? (
              <Link to={`/a/${artworkId}`} className="rounded-xl bg-white px-4 py-2 text-black">
                View your artwork
              </Link>
            ) : null}
            <Link to="/" className="rounded-xl border border-neutral-700 px-4 py-2">
              Go home
            </Link>
          </div>

          {user ? (
            <div className="mt-4 text-sm text-neutral-500">
              You’ll find it under <Link to={`/u/${user.id}`} className="underline">your profile</Link> → Owned.
            </div>
          ) : null}
        </>
      )}

      {status === "error" && (
        <>
          <h1 className="mb-2 text-2xl font-semibold">We couldn’t confirm that</h1>
          <p className="mb-6 text-sm text-red-400">{message}</p>
          <Link to="/" className="rounded-xl border border-neutral-700 px-4 py-2">
            Back
          </Link>
        </>
      )}
    </div>
  );
}
