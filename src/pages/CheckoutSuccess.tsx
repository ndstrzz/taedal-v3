// src/pages/CheckoutSuccess.tsx
import React, { useEffect, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";

type S = "loading" | "ok" | "error";

export default function CheckoutSuccess() {
  const [params] = useSearchParams();
  const sid = params.get("sid") || "";
  const navigate = useNavigate();

  const [status, setStatus] = useState<S>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancel = false;

    (async () => {
      try {
        if (!sid) throw new Error("Missing session id.");

        // 1) Read the session from the server (server talks to Stripe)
        const s = await apiFetch(`/api/checkout/session?sid=${encodeURIComponent(sid)}`);
        const isPaid = s?.session?.payment_status === "paid";
        if (!isPaid) throw new Error("Payment not confirmed yet.");

        // 2) Ask server to finalize: mark listing filled, write activity, transfer owner, etc.
        //    This is idempotent — safe to call multiple times.
        const confirm = await apiFetch(`/api/checkout/confirm`, {
          method: "POST",
          body: JSON.stringify({ sid }),
          headers: { "Content-Type": "application/json" },
        });

        if (cancel) return;

        // Optional: If server returns listing/artwork id, route back to it
        const listing = confirm?.listing;
        setStatus("ok");
        setMessage(`Payment confirmed. Session: ${sid}`);

        // Small delay so user sees the success state, then navigate back to artwork
        if (listing?.artwork_id) {
          setTimeout(() => navigate(`/a/${listing.artwork_id}`), 1200);
        }
      } catch (e: any) {
        if (cancel) return;
        setStatus("error");
        setMessage(e?.message || "Could not verify payment.");
      }
    })();

    return () => {
      cancel = true;
    };
  }, [sid, navigate]);

  return (
    <div className="mx-auto max-w-xl p-8 text-center">
      {status === "loading" && <div>Confirming your payment…</div>}
      {status === "ok" && (
        <>
          <h1 className="mb-2 text-2xl font-semibold">Payment successful 🎉</h1>
          <p className="mb-6 text-sm text-neutral-400">{message}</p>
          <Link to="/" className="rounded-xl bg-white px-4 py-2 text-black">
            Go home
          </Link>
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
