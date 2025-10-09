// client/src/components/BuyNowModal.tsx
import React, { useState } from "react";
import { useAuth } from "../state/AuthContext";

type Props = {
  artworkId: string;
  listingId: string;
  defaultPrice: string;
  defaultCurrency: string;
  onClose: () => void;
  onDone: () => void; // refetch caller
};

export default function BuyNowModal({
  artworkId,
  listingId,
  defaultPrice,
  defaultCurrency,
  onClose,
  onDone,
}: Props) {
  const { session } = useAuth();
  const [currency, setCurrency] = useState<"ETH" | "WETH">(defaultCurrency as any);
  const [busy, setBusy] = useState(false);
  const [tx, setTx] = useState("");

  async function confirmBuy() {
    setBusy(true);
    try {
      const r = await fetch("/api/market/buy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: session?.access_token ? `Bearer ${session.access_token}` : "",
        },
        body: JSON.stringify({ listing_id: listingId, tx_hash: tx || null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Buy failed");
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
        <div className="border-b border-neutral-800 p-4 text-lg font-semibold">Buy now</div>

        <div className="space-y-4 p-4">
          <div className="rounded-xl border border-neutral-800 p-3">
            <div className="text-sm text-neutral-400">Item</div>
            <div className="mt-1 text-neutral-200">
              {defaultPrice} {defaultCurrency}
            </div>
          </div>

          <div className="rounded-xl border border-neutral-800 p-3">
            <div className="text-sm text-neutral-400">Payment method</div>
            <div className="mt-2 flex gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={currency === "ETH"} onChange={() => setCurrency("ETH")} />
                ETH (wallet)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={currency === "WETH"} onChange={() => setCurrency("WETH")} />
                WETH (escrow)
              </label>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              This is an off-chain purchase marker. You can paste a chain tx hash (optional) if you actually transferred
              funds.
            </p>
          </div>

          <label className="block">
            <div className="mb-1 text-sm text-neutral-400">Transaction hash (optional)</div>
            <input
              value={tx}
              onChange={(e) => setTx(e.target.value)}
              placeholder="0x…"
              className="w-full rounded-xl border border-neutral-800 bg-transparent p-2 text-sm outline-none"
            />
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-neutral-800 p-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-neutral-700 px-4 py-2 text-sm"
            disabled={busy}
          >
            Cancel
          </button>
          <button
            onClick={confirmBuy}
            className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
            disabled={busy}
          >
            {busy ? "Processing…" : `Pay ${defaultPrice} ${currency}`}
          </button>
        </div>
      </div>
    </div>
  );
}
