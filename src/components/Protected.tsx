import { type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../state/AuthContext'

type ProtectedProps = {
  children: ReactNode
  /** where to send unauthenticated users */
  redirectTo?: string
}

export default function Protected({ children, redirectTo = '/login' }: ProtectedProps) {
  const { user, loading } = useAuth()
  const loc = useLocation()

  if (loading) return null // or a spinner/skeleton
  if (!user) {
    return <Navigate to={redirectTo} replace state={{ from: loc }} />
  }
  return <>{children}</>
}
