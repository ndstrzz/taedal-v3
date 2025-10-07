// src/App.tsx
import { Routes, Route } from "react-router-dom";
import NavBar from "./components/NavBar";
import Home from "./pages/Home";
import CreateArtwork from "./pages/CreateArtwork";
import SettingsProfile from "./pages/SettingsProfile";
import PublicArtwork from "./routes/PublicArtwork";
import PublicProfile from "./routes/PublicProfile";
import Login from "./pages/Login";
import Signup from "./pages/Signup";

export default function App() {
  return (
    <div className="min-h-screen bg-black text-white">
      <NavBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/create" element={<CreateArtwork />} />
        <Route path="/settings" element={<SettingsProfile />} />
        <Route path="/a/:id" element={<PublicArtwork />} />
        <Route path="/@:handle" element={<PublicProfile />} />
        {/* auth pages if you have them */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        {/* 404 */}
        <Route path="*" element={<div className="p-8 text-neutral-400">Not found.</div>} />
      </Routes>
    </div>
  );
}
