import { Routes, Route } from 'react-router-dom'
import NavBar from './components/NavBar'
import Home from './pages/Account'           // your current "home"
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
          <Route path="/" element={<Home />} />
          <Route path="/create" element={<CreateArtwork />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* ✅ Public profile by username */}
          <Route path="/@:handle" element={<PublicProfile />} />

          {/* other public routes */}
          <Route path="/portfolio" element={<PublicProfile />} />
          <Route path="/community" element={<PublicArtwork />} />
        </Routes>
      </main>
    </>
  )
}
