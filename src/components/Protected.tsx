import { Navigate } from 'react-router-dom'
import { useAuth } from '../state/AuthContext'

export default function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-subtle">
        Loading…
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ notice: 'Please log in to continue.' }} />
  }

  return <>{children}</>
}
