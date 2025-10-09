// src/pages/CheckoutSuccess.tsx
import React, { useEffect, useState } from "react";

export default function CheckoutSuccess() {
  const [sid, setSid] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setSid(p.get("sid"));
  }, []);

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold text-neutral-100">Payment successful</h1>
      <p className="mt-2 text-neutral-300">Thanks! Your payment was processed.</p>
      {sid && <div className="mt-3 text-xs text-neutral-500">Session: {sid}</div>}
    </div>
  );
}
