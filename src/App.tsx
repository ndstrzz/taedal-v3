import React from "react";
import { Routes, Route } from "react-router-dom";
import NavBar from "./components/NavBar";
import Account from "./pages/Account";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import SettingsProfile from "./pages/SettingsProfile";
import CreateArtwork from "./pages/CreateArtwork";
import PublicProfile from "./routes/PublicProfile";
import PublicArtwork from "./routes/PublicArtwork";
import RequireAuth from "./components/RequireAuth";

export default function App() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <NavBar />
      <Routes>
        <Route path="/" element={<Account />} />
        <Route
          path="/create"
          element={
            <RequireAuth>
              <CreateArtwork />
            </RequireAuth>
          }
        />
        <Route path="/settings" element={<RequireAuth><SettingsProfile /></RequireAuth>} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/@:handle" element={<PublicProfile />} />
        <Route path="/a/:id" element={<PublicArtwork />} />
        {/* 404 fallback (optional) */}
        <Route path="*" element={<div className="p-8 text-neutral-400">Not found.</div>} />
      </Routes>
    </div>
  );
}
