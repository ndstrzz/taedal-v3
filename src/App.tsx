import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import NavBar from './components/NavBar'
import Home from './pages/Account'
import CreateArtwork from './pages/CreateArtwork'
import Login from './pages/Login'
import Signup from './pages/Signup'
import PublicProfile from './routes/PublicProfile'
import PublicArtwork from './routes/PublicArtwork'
import SettingsProfile from './pages/SettingsProfile'
import { useAuth } from './state/AuthContext'

function NotFound() {
  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="text-h1 mb-2">Not found</h1>
      <p className="text-subtle">That page doesn’t exist.</p>
    </div>
  )
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return null
  if (!user) return <Navigate to="/login" state={{ redirectTo: loc.pathname }} replace />
  return <>{children}</>
}

export default function App() {
  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-6xl px-4">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create" element={<RequireAuth><CreateArtwork /></RequireAuth>} />
          <Route path="/settings" element={<RequireAuth><SettingsProfile /></RequireAuth>} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* Public profile routes */}
          <Route path="/@:handle" element={<PublicProfile />} />
          <Route path="/u/:handle" element={<PublicProfile />} />

          <Route path="/portfolio" element={<PublicProfile />} />
          <Route path="/community" element={<PublicArtwork />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </>
  )
}
