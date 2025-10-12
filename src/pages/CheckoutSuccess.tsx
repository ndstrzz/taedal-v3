import React, { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { apiFetch } from "../lib/api"; // same helper you used on ArtworkDetail

export default function CheckoutSuccess() {
  const [params] = useSearchParams();
  const sid = params.get("sid") || "";
  const [status, setStatus] = useState<"loading"|"ok"|"error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      try {
        // optional: tell your server to verify/finalize the session
        const res = await apiFetch(`/api/checkout/session?sid=${encodeURIComponent(sid)}`);
        // or `/api/checkout/verify?sid=...` depending on your checkout.cjs
        setStatus("ok");
        setMessage(`Payment confirmed. Session: ${sid}`);
      } catch (e: any) {
        setStatus("error");
        setMessage(e?.message || "Could not verify payment.");
      }
    })();
  }, [sid]);

  return (
    <div className="mx-auto max-w-xl p-8 text-center">
      {status === "loading" && <div>Confirming your payment…</div>}
      {status === "ok" && (
        <>
          <h1 className="text-2xl font-semibold mb-2">Payment successful 🎉</h1>
          <p className="text-sm text-neutral-400 mb-6">{message}</p>
          <Link to="/" className="rounded-xl bg-white text-black px-4 py-2">Go home</Link>
        </>
      )}
      {status === "error" && (
        <>
          <h1 className="text-2xl font-semibold mb-2">We couldn’t confirm that</h1>
          <p className="text-sm text-red-400 mb-6">{message}</p>
          <Link to="/" className="rounded-xl border border-neutral-700 px-4 py-2">Back</Link>
        </>
      )}
    </div>
  );
}
