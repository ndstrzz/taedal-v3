// src/App.tsx
import { Routes, Route } from 'react-router-dom'
import NavBar from './components/NavBar'
import Home from './pages/Home'                 // ✅ new landing page
import Account from './pages/Account'
import SettingsProfile from './pages/SettingsProfile'
import CreateArtwork from './pages/CreateArtwork'
import Login from './pages/Login'
import Signup from './pages/Signup'
import PublicProfile from './routes/PublicProfile'
import PublicArtwork from './routes/PublicArtwork'

export default function App() {
  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-6xl px-4">
        <Routes>
          <Route path="/" element={<Home />} />                 {/* ← landing */}
          <Route path="/account" element={<Account />} />       {/* account card */}
          <Route path="/settings" element={<SettingsProfile />} />
          <Route path="/create" element={<CreateArtwork />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* public */}
          <Route path="/@:handle" element={<PublicProfile />} />
          <Route path="/community" element={<PublicArtwork />} />
          <Route path="/portfolio" element={<PublicArtwork />} />
        </Routes>
      </main>
    </>
  )
}
