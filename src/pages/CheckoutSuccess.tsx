// src/pages/CheckoutSuccess.tsx
import React, { useEffect, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../state/AuthContext";

export default function CheckoutSuccess() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  // Stripe sends `session_id` — keep a fallback to `sid` just in case
  const sid = params.get("session_id") || params.get("sid") || "";

  const { user } = useAuth();
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState("");
  const [artworkId, setArtworkId] = useState<string | null>(null);

  useEffect(() => {
    if (!sid) {
      setStatus("error");
      setMessage("Missing Stripe session id.");
      return;
    }

    (async () => {
      try {
        // Confirm the Stripe session (server talks to Stripe)
        const out = await apiFetch(`/api/checkout/session?session_id=${encodeURIComponent(sid)}`, {
          method: "GET",
        });

        // If your webhook already transferred ownership & closed the listing,
        // we can read the artwork id straight from metadata for the redirect/CTA.
        const md = out?.session?.metadata || {};
        const aId = md.artwork_id || null;

        setArtworkId(aId);
        setStatus("ok");
        setMessage("Payment confirmed. You now own the artwork.");
      } catch (e: any) {
        setStatus("error");
        setMessage(e?.message || "Could not confirm your payment.");
      }
    })();
  }, [sid]);

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
              You’ll also find it under{" "}
              <Link to={`/u/${user.id}`} className="underline">
                your profile
              </Link>{" "}
              → Owned.
            </div>
          ) : null}
        </>
      )}

      {status === "error" && (
        <>
          <h1 className="mb-2 text-2xl font-semibold">We couldn’t confirm that</h1>
          <p className="mb-6 text-sm text-red-400">{message}</p>
          <button
            className="rounded-xl border border-neutral-700 px-4 py-2"
            onClick={() => navigate("/")}
          >
            Back
          </button>
        </>
      )}
    </div>
  );
}
