import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, useNavigate } from 'react-router-dom'
import App from './App'
import './index.css'
import { AuthProvider } from './state/AuthContext'

function HashHealer() {
  const nav = useNavigate()
  React.useEffect(() => {
    // e.g. /create#/@andy  ->  /@andy
    if (location.hash.startsWith('#/@')) {
      nav(location.hash.slice(1), { replace: true })
    }
  }, [nav])
  return null
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <HashHealer />
        <App />
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
)
