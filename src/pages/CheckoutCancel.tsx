import React from "react";
import { Link } from "react-router-dom";

export default function CheckoutCancel() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold mb-2">Payment cancelled</h1>
      <p className="text-neutral-400 mb-4">No worries—you haven’t been charged.</p>
      <Link to="/" className="inline-block rounded-xl border border-neutral-700 px-4 py-2 hover:bg-neutral-900">
        Back home
      </Link>
    </div>
  );
}
