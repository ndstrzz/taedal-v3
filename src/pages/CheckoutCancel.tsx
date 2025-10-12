import React from "react";
import { Link } from "react-router-dom";
export default function CheckoutCancel() {
  return (
    <div className="mx-auto max-w-xl p-8 text-center">
      <h1 className="text-2xl font-semibold mb-2">Payment canceled</h1>
      <p className="text-sm text-neutral-400 mb-6">You can try again anytime.</p>
      <Link to="/" className="rounded-xl border border-neutral-700 px-4 py-2">Back home</Link>
    </div>
  );
}
