import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import './index.css'
import App from './App'
import PublicArtwork from './routes/PublicArtwork'
import PublicProfile from './routes/PublicProfile'
import { AuthProvider } from './state/AuthContext'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Account from './pages/Account'
import Protected from './components/Protected'
import ErrorBoundary from './components/ErrorBoundary'
import OnboardingProfile from './pages/OnboardingProfile'
import SettingsProfile from './pages/SettingsProfile'
import ProfileBootstrapper from './components/ProfileBootstrapper'
import CreateArtwork from './pages/CreateArtwork'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <HelmetProvider>
        <AuthProvider>
          {/* Auto-fill profile once after login */}
          <ProfileBootstrapper />
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<App />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/onboarding/profile" element={<Protected><OnboardingProfile /></Protected>} />
              <Route path="/settings/profile" element={<Protected><SettingsProfile /></Protected>} />
              <Route path="/account" element={<Protected><Account /></Protected>} />
              <Route path="/a/:id" element={<PublicArtwork />} />
              <Route path="/@:username" element={<PublicProfile />} />
              <Route path="/create" element={<Protected><CreateArtwork /></Protected>} />
            </Routes>
          </ErrorBoundary>
        </AuthProvider>
      </HelmetProvider>
    </BrowserRouter>
  </React.StrictMode>
)
