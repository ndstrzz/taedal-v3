import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import CreateArtwork from "./pages/CreateArtwork";
import SettingsProfile from "./pages/SettingsProfile";
import PublicProfile from "./routes/PublicProfile";
import MyProfile from "./pages/MyProfile";
// ...other imports

export default function App() {
  return (
    <>
      {/* your NavBar etc */}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/create" element={<CreateArtwork />} />
        <Route path="/settings" element={<SettingsProfile />} />
        {/* 🔹 New: go to your own profile */}
        <Route path="/me" element={<MyProfile />} />
        {/* public profile by @handle */}
        <Route path="/@:handle" element={<PublicProfile />} />
        {/* ...other routes */}
      </Routes>
    </>
  );
}
