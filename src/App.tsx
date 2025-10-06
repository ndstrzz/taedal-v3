import { Routes, Route } from 'react-router-dom'
import NavBar from './components/NavBar'
import Home from './pages/Account'               // your current home/account page
import CreateArtwork from './pages/CreateArtwork'
import Login from './pages/Login'
import Signup from './pages/Signup'
import PublicProfile from './routes/PublicProfile'
import PublicArtwork from './routes/PublicArtwork'
import SettingsProfile from './pages/SettingsProfile'

function NotFound() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-h1 mb-2">Not found</h1>
      <p className="text-subtle">That page doesn’t exist.</p>
    </div>
  )
}

export default function App() {
  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-6xl px-4">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create" element={<CreateArtwork />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* ✅ Public profile by username, e.g. /@andy */}
          <Route path="/@:handle" element={<PublicProfile />} />

          {/* Settings for editing profile */}
          <Route path="/settings" element={<SettingsProfile />} />

          {/* other public routes */}
          <Route path="/portfolio" element={<PublicArtwork />} />
          <Route path="/community" element={<PublicArtwork />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </>
  )
}
