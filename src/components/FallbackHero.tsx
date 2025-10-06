export default function FallbackHero() {
  return (
    <div className="flex h-[60vh] w-full items-center justify-center rounded-xl bg-elev1 shadow-card">
      <div className="text-center">
        <div className="mx-auto mb-4 h-24 w-24 rounded-full bg-brand/15 ring-1 ring-brand/40" />
        <p className="text-h2 text-subtle">3D disabled for performance</p>
      </div>
    </div>
  )
}
