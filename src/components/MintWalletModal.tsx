import React from "react";

type Props = {
  open: boolean;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onPickMetaMask: () => void;
};

export default function MintWalletModal({
  open,
  busy,
  error,
  onClose,
  onPickMetaMask,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="mb-3 text-lg font-semibold">Choose a wallet to mint</div>

        <div className="space-y-3">
          <button
            onClick={onPickMetaMask}
            disabled={busy}
            className="flex w-full items-center gap-3 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-left hover:bg-neutral-800 disabled:opacity-60"
          >
            <img src="/brand/metamask.svg" alt="" className="h-6 w-6" />
            <div>
              <div className="font-medium">MetaMask</div>
              <div className="text-xs text-neutral-400">
                Connect and confirm the mint transaction
              </div>
            </div>
          </button>

          {["Coinbase Wallet", "WalletConnect", "Rainbow"].map((name) => (
            <div
              key={name}
              className="flex w-full items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 opacity-50"
              aria-disabled
            >
              <div className="h-6 w-6 rounded bg-neutral-800" />
              <div>
                <div className="font-medium">{name}</div>
                <div className="text-xs text-neutral-500">Coming soon</div>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-red-600/40 bg-red-500/10 p-2 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-900 disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
