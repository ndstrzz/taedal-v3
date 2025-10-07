import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import CreateArtwork from "./pages/CreateArtwork";
import SettingsProfile from "./pages/SettingsProfile";
import PublicProfile from "./routes/PublicProfile";
import MyProfile from "./pages/MyProfile";
import ArtworkDetail from "./pages/ArtworkDetail"; // ⬅️ add
import NavBar from "./components/NavBar";
import { useAuth } from "./state/AuthContext";

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

        {/* Create (only if signed in) */}
        <Route
          path="/create"
          element={
            <ProtectedRoute>
              <CreateArtwork />
            </ProtectedRoute>
          }
        />

        {/* Settings */}
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsProfile />
            </ProtectedRoute>
          }
        />

        {/* Your own profile */}
        <Route
          path="/me"
          element={
            <ProtectedRoute>
              <MyProfile />
            </ProtectedRoute>
          }
        />

        {/* Artwork detail */}
        <Route path="/a/:id" element={<ArtworkDetail />} />  {/* ⬅️ FIX for your “Not found” */}

        {/* Public profile routes */}
        <Route path="/@:handle" element={<PublicProfile />} />
        <Route path="/u/:username" element={<PublicProfile />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
