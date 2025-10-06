import { Routes, Route, Navigate } from 'react-router-dom'
import NavBar from './components/NavBar'
import Home from './pages/Account'                    // temp home
import CreateArtwork from './pages/CreateArtwork'
import Login from './pages/Login'
import Signup from './pages/Signup'
import PublicProfile from './routes/PublicProfile'
import Community from './routes/PublicArtwork'
import SettingsProfile from './pages/SettingsProfile'
import Account from './pages/Account'
import Protected from './components/Protected'
import ProfileBootstrapper from './components/ProfileBootstrapper'

export default function App() {
  return (
    <>
      {/* make sure profile basics are created right after login */}
      <ProfileBootstrapper />
      <NavBar />
      <main className="mx-auto max-w-6xl px-4">
        <Routes>
          {/* Public */}
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/community" element={<Community />} />
          {/* Public profile like /@satoshi */}
          <Route path="/@:handle" element={<PublicProfile />} />

          {/* Authed-only */}
          <Route
            path="/create"
            element={
              <Protected redirectTo="/login">
                <CreateArtwork />
              </Protected>
            }
          />
          <Route
            path="/account"
            element={
              <Protected redirectTo="/login">
                <Account />
              </Protected>
            }
          />
          <Route
            path="/settings"
            element={
              <Protected redirectTo="/login">
                <SettingsProfile />
              </Protected>
            }
          />

          {/* Backstop */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  )
}
