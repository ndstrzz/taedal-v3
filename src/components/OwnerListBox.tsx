import React, { useState } from "react";
import { useAuth } from "../state/AuthContext";

export default function OwnerListBox({ artworkId, onListed }: { artworkId: string; onListed: () => void }) {
  const { session } = useAuth();
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<"ETH" | "WETH">("ETH");
  const [busy, setBusy] = useState(false);

  async function listNow() {
    if (!price) return;
    setBusy(true);
    try {
      const r = await fetch("/api/market/list", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: session?.access_token ? `Bearer ${session.access_token}` : "",
        },
        body: JSON.stringify({ artwork_id: artworkId, price, currency }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "List failed");
      onListed();
      setPrice("");
    } catch (e: any) {
      alert(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-neutral-800 p-4">
      <div className="mb-2 text-sm font-medium text-neutral-200">List for sale</div>
      <div className="flex flex-wrap items-end gap-2">
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="0.013"
          className="w-28 rounded-xl border border-neutral-800 bg-transparent p-2 text-sm outline-none"
        />
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as any)}
          className="rounded-xl border border-neutral-800 bg-transparent p-2 text-sm outline-none"
        >
          <option>ETH</option>
          <option>WETH</option>
        </select>
        <button
          onClick={listNow}
          className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
          disabled={busy || !price}
        >
          {busy ? "Listing…" : "List"}
        </button>
      </div>
    </div>
  );
}
