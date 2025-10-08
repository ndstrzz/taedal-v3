import React, { useState } from "react";
import { useAuth } from "../state/AuthContext";

type Props = {
  artworkId: string;
  onClose: () => void;
  onDone: () => void;
};

export default function MakeOfferModal({ artworkId, onClose, onDone }: Props) {
  const { session } = useAuth();
  const [currency, setCurrency] = useState<"WETH" | "ETH">("WETH");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitOffer() {
    if (!price) return;
    setBusy(true);
    try {
      const r = await fetch("/api/market/offer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: session?.access_token ? `Bearer ${session.access_token}` : "",
        },
        body: JSON.stringify({ artwork_id: artworkId, price, currency }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Offer failed");
      onDone();
      onClose();
    } catch (e: any) {
      alert(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950">
        <div className="border-b border-neutral-800 p-4 text-lg font-semibold">Make an offer</div>

        <div className="space-y-4 p-4">
          <label className="block">
            <div className="mb-1 text-sm text-neutral-400">Amount</div>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.05"
              className="w-full rounded-xl border border-neutral-800 bg-transparent p-2 text-sm outline-none"
            />
          </label>

          <div className="rounded-xl border border-neutral-800 p-3">
            <div className="text-sm text-neutral-400">Payment token</div>
            <div className="mt-2 flex gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={currency === "WETH"} onChange={() => setCurrency("WETH")} />
                WETH (recommended)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={currency === "ETH"} onChange={() => setCurrency("ETH")} />
                ETH
              </label>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-neutral-800 p-4">
          <button onClick={onClose} className="rounded-xl border border-neutral-700 px-4 py-2 text-sm" disabled={busy}>
            Cancel
          </button>
          <button
            onClick={submitOffer}
            className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
            disabled={busy || !price}
          >
            {busy ? "Submitting…" : "Place offer"}
          </button>
        </div>
      </div>
    </div>
  );
}
