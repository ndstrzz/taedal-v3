import { useAuth } from '../state/AuthContext'

export default function VerifyEmailBanner() {
  const { user } = useAuth()
  const confirmed = (user as any)?.email_confirmed_at
  if (!user || confirmed) return null

  return (
    <div className="mx-auto mb-6 max-w-6xl rounded-lg bg-elev1 p-3 text-sm ring-1 ring-border">
      Verify your email to unlock all features. Check your inbox for the confirmation link.
    </div>
  )
}
