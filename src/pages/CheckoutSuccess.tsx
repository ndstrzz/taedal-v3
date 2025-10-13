// src/pages/CheckoutSuccess.tsx
import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { API_BASE } from "../lib/config";

type StripeSession = {
  id: string;
  payment_status?: "paid" | "no_payment_required" | "unpaid";
  status?: string | null;
  metadata?: Record<string, string>;
  amount_total?: number | null;
  currency?: string | null;
};

export default function CheckoutSuccess() {
  const [sp] = useSearchParams();
  const sid = sp.get("session_id") || sp.get("sid") || "";

  const [state, setState] = useState<"loading" | "ok" | "fail">("loading");
  const [msg, setMsg] = useState<string>("");
  const [artworkId, setArtworkId] = useState<string | null>(null);
  const [amount, setAmount] = useState<string | null>(null);

  useEffect(() => {
    if (!sid) {
      setState("fail");
      setMsg("Missing session_id in URL.");
      return;
    }

    (async () => {
      try {
        const url = `${API_BASE.replace(/\/$/, "")}/api/checkout/session?session_id=${encodeURIComponent(
          sid
        )}`;
        const r = await fetch(url, { method: "GET" });
        const j = await r.json();

        if (!r.ok || !j?.ok) {
          throw new Error(j?.error || `HTTP ${r.status}`);
        }

        const s: StripeSession = j.session;
        // Success if Stripe marks it paid (or no payment required)
        const isPaid =
          s?.payment_status === "paid" || s?.payment_status === "no_payment_required";

        // Optional: parse artwork/listing metadata if you set it during session creation
        const metaArtworkId =
          (s?.metadata?.artwork_id && s.metadata.artwork_id.trim()) || null;

        // Optional: display amount
        if (typeof s?.amount_total === "number" && s?.currency) {
          const dollars = s.amount_total / 100;
          setAmount(
            new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: s.currency.toUpperCase(),
            }).format(dollars)
          );
        }

        setArtworkId(metaArtworkId);
        setState(isPaid ? "ok" : "fail");
        setMsg(isPaid ? "Payment confirmed." : "Payment not completed.");
      } catch (e: any) {
        setState("fail");
        setMsg(e?.message || "Could not confirm your payment.");
      }
    })();
  }, [sid]);

  if (state === "loading") {
    return (
      <div className="mx-auto max-w-xl p-10 text-center">
        <div className="text-xl font-semibold">Confirming your payment…</div>
        <div className="mt-2 text-sm text-neutral-400">Talking to Stripe now.</div>
      </div>
    );
  }

  if (state === "ok") {
    return (
      <div className="mx-auto max-w-xl p-10 text-center">
        <div className="text-2xl font-semibold">Payment successful 🎉</div>
        <div className="mt-2 text-sm text-neutral-400">
          {msg} {amount ? `Total: ${amount}.` : null}
        </div>

        <div className="mt-6 flex items-center justify-center gap-3">
          {artworkId ? (
            <Link
              to={`/a/${artworkId}`}
              className="rounded-xl bg-white px-4 py-2 text-black"
            >
              View your artwork
            </Link>
          ) : null}
          <Link
            to="/"
            className="rounded-xl border border-neutral-700 px-4 py-2 hover:bg-neutral-900"
          >
            Go home
          </Link>
        </div>

        <div className="mt-4 text-xs text-neutral-500">
          If this purchase relates to a listing, the webhook will mark it as{" "}
          <span className="italic">filled</span> shortly.
        </div>
      </div>
    );
  }

  // fail
  return (
    <div className="mx-auto max-w-xl p-10 text-center">
      <div className="text-2xl font-semibold">We couldn’t confirm that</div>
      <div className="mt-2 text-sm text-red-400">{msg || "Unknown error"}</div>
      <Link
        to="/"
        className="mt-6 inline-block rounded-xl border border-neutral-700 px-4 py-2 hover:bg-neutral-900"
      >
        Back
      </Link>
    </div>
  );
}
