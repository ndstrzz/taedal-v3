// src/App.tsx
import { Routes, Route } from 'react-router-dom'
import NavBar from './components/NavBar'
import Home from './pages/Home'                 // ✅ new landing page
import Account from './pages/Account'           // was your old "home"
import CreateArtwork from './pages/CreateArtwork'
import Login from './pages/Login'
import Signup from './pages/Signup'
import PublicProfile from './routes/PublicProfile'
import PublicArtwork from './routes/PublicArtwork'
import SettingsProfile from './pages/SettingsProfile'

export default function App() {
  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-6xl px-4">
        <Routes>
          <Route path="/" element={<Home />} />                 {/* landing */}
          <Route path="/account" element={<Account />} />       {/* account */}
          <Route path="/create" element={<CreateArtwork />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/settings" element={<SettingsProfile />} />
          <Route path="/@:handle" element={<PublicProfile />} />{/* profile */}
          <Route path="/portfolio" element={<PublicProfile />} />
          <Route path="/community" element={<PublicArtwork />} />
        </Routes>
      </main>
    </>
  )
}
