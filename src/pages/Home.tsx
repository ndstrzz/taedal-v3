// src/pages/Home.tsx
export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-4 text-3xl font-semibold">Discover independent artists</h1>
      <p className="max-w-2xl text-neutral-300">
        Mint, list, and collect with provenance by default. Attach QR/NFC to physical works to bridge on-chain ownership.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <a href="/create" className="rounded-2xl border border-neutral-800 p-6 hover:bg-neutral-900">
          <div className="text-lg font-medium">Create</div>
          <div className="mt-1 text-neutral-400">Upload your artwork and mint.</div>
        </a>
        <a href="/community" className="rounded-2xl border border-neutral-800 p-6 hover:bg-neutral-900">
          <div className="text-lg font-medium">Community</div>
          <div className="mt-1 text-neutral-400">See new mints and featured artists.</div>
        </a>
        <a href="/portfolio" className="rounded-2xl border border-neutral-800 p-6 hover:bg-neutral-900">
          <div className="text-lg font-medium">Portfolio</div>
          <div className="mt-1 text-neutral-400">Tracks your mints and royalties.</div>
        </a>
      </div>
    </main>
  );
}
