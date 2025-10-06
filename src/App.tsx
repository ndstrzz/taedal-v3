import { Routes, Route } from 'react-router-dom'
import NavBar from './components/NavBar'
import Account from './pages/Account'
import CreateArtwork from './pages/CreateArtwork'
import Login from './pages/Login'
import Signup from './pages/Signup'
import PublicProfile from './routes/PublicProfile'
import PublicArtwork from './routes/PublicArtwork'
import SettingsProfile from './pages/SettingsProfile'

function NotFound() {
  return (
    <div className="mx-auto max-w-4xl p-6">
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
          <Route path="/" element={<Account />} />
          <Route path="/create" element={<CreateArtwork />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* profile settings page */}
          <Route path="/settings" element={<SettingsProfile />} />

          {/* public profile by handle like /@andy */}
          <Route path="/@:handle" element={<PublicProfile />} />

          {/* other public pages */}
          <Route path="/portfolio" element={<PublicArtwork />} />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </>
  )
}
