import React, { useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";

export default function CheckoutSuccess() {
  const [sp] = useSearchParams();
  const sid = sp.get("sid");

  useEffect(() => {
    // Optional: call your API to verify session or mark order paid
    // For now we just show a message.
    console.log("Stripe session:", sid);
  }, [sid]);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold mb-2">Payment successful</h1>
      <p className="text-neutral-400 mb-4">Thanks! Your payment was processed.</p>
      <Link to="/" className="inline-block rounded-xl border border-neutral-700 px-4 py-2 hover:bg-neutral-900">
        Back home
      </Link>
    </div>
  );
}
