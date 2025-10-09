// src/pages/CheckoutSuccess.tsx
import React from "react";
import { Link, useSearchParams } from "react-router-dom";

export default function CheckoutSuccess() {
  const [sp] = useSearchParams();
  const sid = sp.get("sid"); // {CHECKOUT_SESSION_ID}

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-6">
        <div className="text-2xl font-semibold text-neutral-100">Payment successful 🎉</div>
        <p className="mt-2 text-neutral-300">
          Thanks for your purchase! You’ll see the activity update shortly.
          {sid ? (
            <>
              {" "}
              Your Stripe session id is{" "}
              <code className="rounded bg-neutral-900 px-1 py-0.5 text-xs text-neutral-300">
                {sid}
              </code>
              .
            </>
          ) : null}
        </p>

        <div className="mt-6">
          <Link
            to="/"
            className="inline-block rounded-xl bg-white px-4 py-2 text-sm font-medium text-black"
            replace
          >
            Back to home
          </Link>
        </div>

        <div className="mt-4 text-xs text-neutral-500">
          Tip: add a Stripe webhook later to mark orders complete automatically.
        </div>
      </div>
    </div>
  );
}
