// src/App.tsx
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import CreateArtwork from "./pages/CreateArtwork";
import SettingsProfile from "./pages/SettingsProfile";
import PublicProfile from "./routes/PublicProfile"; // keep your path if that's where it lives
import MyProfile from "./pages/MyProfile";
import ArtworkDetail from "./pages/ArtworkDetail";   // ✅ NEW
import NavBar from "./components/NavBar";
import { useAuth } from "./state/AuthContext";

// ---------- Route guards ----------
function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  const loc = useLocation();

  if (loading) return <div className="p-8 text-neutral-400">Loading…</div>;
  if (!user) {
    const next = encodeURIComponent(loc.pathname + loc.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return children;
}

function RedirectIfAuthed({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="p-8 text-neutral-400">Loading…</div>;
  if (user) {
    const next = new URLSearchParams(loc.search).get("next");
    return <Navigate to={next || "/me"} replace />;
  }
  return children;
}

function NotFound() {
  return <div className="p-8 text-neutral-400">Not found.</div>;
}

// ---------- App ----------
export default function App() {
  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/" element={<Home />} />

        {/* Auth */}
        <Route
          path="/login"
          element={
            <RedirectIfAuthed>
              <Login />
            </RedirectIfAuthed>
          }
        />
        <Route
          path="/signup"
          element={
            <RedirectIfAuthed>
              <Signup />
            </RedirectIfAuthed>
          }
        />

        {/* Create (protected) */}
        <Route
          path="/create"
          element={
            <ProtectedRoute>
              <CreateArtwork />
            </ProtectedRoute>
          }
        />

        {/* Settings (protected) */}
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsProfile />
            </ProtectedRoute>
          }
        />

        {/* Your profile (protected) */}
        <Route
          path="/me"
          element={
            <ProtectedRoute>
              <MyProfile />
            </ProtectedRoute>
          }
        />

        {/* Public profile */}
        <Route path="/@:handle" element={<PublicProfile />} />

        {/* ✅ Artwork detail */}
        <Route path="/a/:id" element={<ArtworkDetail />} />

        {/* Fallback */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
