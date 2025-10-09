// src/pages/CheckoutCancel.tsx
import React from "react";
import { Link } from "react-router-dom";

export default function CheckoutCancel() {
  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-6">
        <div className="text-2xl font-semibold text-neutral-100">Payment cancelled</div>
        <p className="mt-2 text-neutral-300">
          Your card was not charged. You can try again anytime.
        </p>

        <div className="mt-6">
          <Link
            to="/"
            className="inline-block rounded-xl border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-900"
            replace
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
