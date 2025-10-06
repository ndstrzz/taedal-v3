import { Routes, Route } from 'react-router-dom'
import NavBar from './components/NavBar'

// pages
import Home from './pages/Account'
import CreateArtwork from './pages/CreateArtwork'
import Login from './pages/Login'
import Signup from './pages/Signup'
import SettingsProfile from './pages/SettingsProfile'

// public
import PublicProfile from './routes/PublicProfile'
import PublicArtwork from './routes/PublicArtwork'

// simple catch-all
function NotFound() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="text-h2 mb-2">Not found</div>
      <div className="text-subtle">That page doesn’t exist.</div>
    </div>
  )
}

export default function App() {
  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-6xl px-4">
        <Routes>
          {/* home */}
          <Route path="/" element={<Home />} />

          {/* auth */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* settings + create */}
          <Route path="/settings" element={<SettingsProfile />} />
          <Route path="/create" element={<CreateArtwork />} />

          {/* public routes */}
          <Route path="/@:handle" element={<PublicProfile />} />
          <Route path="/community" element={<PublicArtwork />} />
          <Route path="/portfolio" element={<PublicArtwork />} />

          {/* catch-all (keep last) */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </>
  )
}
