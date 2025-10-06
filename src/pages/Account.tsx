import { useAuth } from '../state/AuthContext'
import { supabase } from '../lib/supabase'

export default function Account() {
  const { user } = useAuth()

  async function signOut() {
    await supabase.auth.signOut()
  }

  if (!user) return null

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-h1">Account</h1>
      <div className="rounded-xl bg-elev1 p-4 ring-1 ring-border">
        <div className="mb-2 text-sm text-subtle">Email</div>
        <div className="mb-4">{user.email}</div>

        <div className="mb-2 text-sm text-subtle">User ID</div>
        <div className="mb-6 break-all">{user.id}</div>

        <button onClick={signOut} className="rounded-lg bg-elev2 px-4 py-2 text-sm ring-1 ring-border hover:bg-bg">
          Sign out
        </button>
      </div>
    </div>
  )
}
