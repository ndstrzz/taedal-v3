// src/components/CheckoutModal.tsx
import React, { useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { supabase } from "../lib/supabase";
import { useToast } from "./Toaster";
import { API_BASE } from "../lib/config";

type Props = {
  open: boolean;
  onClose: () => void;
  onPurchased?: () => Promise<void> | void;
  artworkId: string;
  listingId: string;
  title: string;
  price: string;
  currency: "ETH" | "WETH" | "USD";
  imageUrl?: string;
};

type Method = "card" | "crypto";

const STRIPE_PK = import.meta.env.VITE_STRIPE_PUBKEY as string | undefined;

export default function CheckoutModal({
  open,
  onClose,
  onPurchased,
  artworkId,
  listingId,
  title,
  price,
  currency,
  imageUrl,
}: Props) {
  const { toast } = useToast();
  const [method, setMethod] = useState<Method>("card");
  const [busy, setBusy] = useState(false);

  const displayPrice = useMemo(() => {
    if (currency === "USD") return `$${Number(price).toLocaleString()}`;
    return `${price} ${currency}`;
  }, [price, currency]);

  if (!open) return null;

  async function handleCardCheckout() {
    try {
      if (!STRIPE_PK) {
        toast({
          variant: "error",
          title: "Stripe not configured",
          description: "Set VITE_STRIPE_PUBKEY in your frontend env.",
        });
        return;
      }
      setBusy(true);

      const r = await fetch(
        `${API_BASE.replace(/\/$/, "")}/api/checkout/create-stripe-session`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ artworkId, listingId, title, price, currency, imageUrl }),
        }
      );
      if (!r.ok) throw new Error(`Failed (${r.status})`);
      const { sessionId } = await r.json();

      // Keep this `any` cast to dodge the Stripe server-vs-browser type collision
      const stripe = await loadStripe(STRIPE_PK);
      if (!stripe) throw new Error("Stripe failed to load");
      const { error } = await (stripe as any).redirectToCheckout({ sessionId });
      if (error) throw error;
    } catch (e: any) {
      toast({
        variant: "error",
        title: "Card checkout failed",
        description: String(e?.message || e),
      });
      setBusy(false);
    }
  }

  async function handleCryptoCheckout() {
    try {
      setBusy(true);
      const r = await fetch(
        `${API_BASE.replace(/\/$/, "")}/api/checkout/create-crypto-intent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ artworkId, listingId, title, price, currency, imageUrl }),
        }
      );
      if (!r.ok) throw new Error(`Failed (${r.status})`);
      const { hostedUrl, chargeId } = await r.json();

      await supabase.from("orders").insert({
        artwork_id: artworkId,
        listing_id: listingId,
        amount: price,
        currency,
        method: "crypto_hosted",
        provider_ref: chargeId,
        status: "pending",
      });

      window.location.href = hostedUrl;
    } catch (e: any) {
      toast({
        variant: "error",
        title: "Crypto checkout failed",
        description: String(e?.message || e),
      });
      setBusy(false);
    }
  }

  async function simulateSuccess() {
    try {
      setBusy(true);
      const { error } = await supabase.rpc("complete_purchase", {
        p_artwork_id: artworkId,
        p_listing_id: listingId,
        p_actor: null,
        p_tx_hash: null,
        p_price_eth: price,
      });
      if (error) throw error;
      toast({ title: "Purchase recorded" });
      await onPurchased?.();
      onClose();
    } catch (e: any) {
      toast({ variant: "error", title: "Simulate failed", description: String(e?.message || e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950">
        <div className="flex items-center gap-3 border-b border-neutral-800 p-4">
          {imageUrl ? <img src={imageUrl} className="h-12 w-12 rounded-lg object-cover" /> : null}
          <div className="min-w-0">
            <div className="truncate text-sm text-neutral-400">Buying</div>
            <div className="truncate text-neutral-100">{title}</div>
          </div>
          <div className="ml-auto text-lg font-semibold">{displayPrice}</div>
        </div>

        <div className="flex gap-2 border-b border-neutral-800 p-3">
          <button
            className={`rounded-full border px-3 py-1 text-sm ${
              method === "card" ? "border-neutral-500" : "border-neutral-800 hover:bg-neutral-900"
            }`}
            onClick={() => setMethod("card")}
          >
            Card / Apple Pay
          </button>
          <button
            className={`rounded-full border px-3 py-1 text-sm ${
              method === "crypto" ? "border-neutral-500" : "border-neutral-800 hover:bg-neutral-900"
            }`}
            onClick={() => setMethod("crypto")}
          >
            Crypto
          </button>
        </div>

        {method === "card" ? (
          <div className="space-y-3 p-4 text-sm">
            <div className="text-neutral-300">Pay securely with Stripe Checkout.</div>
            <button
              disabled={busy}
              onClick={handleCardCheckout}
              className="w-full rounded-xl bg-white px-4 py-2 font-medium text-black disabled:opacity-60"
            >
              Continue to Stripe
            </button>
            <button
              disabled={busy}
              onClick={simulateSuccess}
              className="w-full rounded-xl border border-neutral-700 px-4 py-2 hover:bg-neutral-900"
            >
              Simulate success (local)
            </button>
          </div>
        ) : (
          <div className="space-y-3 p-4 text-sm">
            <div className="text-neutral-300">Use a hosted crypto checkout (e.g., Coinbase Commerce).</div>
            <button
              disabled={busy}
              onClick={handleCryptoCheckout}
              className="w-full rounded-xl bg-white px-4 py-2 font-medium text-black disabled:opacity-60"
            >
              Continue to Crypto Checkout
            </button>
            <button
              disabled={busy}
              onClick={simulateSuccess}
              className="w-full rounded-xl border border-neutral-700 px-4 py-2 hover:bg-neutral-900"
            >
              Simulate success (local)
            </button>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-neutral-800 p-3">
          <button onClick={onClose} className="rounded-xl border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-900" disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
