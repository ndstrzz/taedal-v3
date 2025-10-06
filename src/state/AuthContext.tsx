import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'      // ✅ type-only import
import { supabase } from '../lib/supabase'
import type { Session, User } from '@supabase/supabase-js'

type AuthCtx = {
  user: User | null
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
  error?: string
}

const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {}
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (!mounted) return
        setSession(data.session ?? null)
        setUser(data.session?.user ?? null)
      } catch (e: any) {
        setError(e?.message || 'Auth init failed')
      } finally {
        setLoading(false)
      }
    })()

    const { data: sub } =
      supabase.auth.onAuthStateChange?.((_e, sess) => {
        setSession(sess ?? null)
        setUser(sess?.user ?? null)
      }) || { data: { subscription: { unsubscribe() {} } } }

    return () => {
      mounted = false
      sub?.subscription?.unsubscribe?.()
    }
  }, [])

  async function signOut() {
    try { await supabase.auth.signOut() } catch { /* ignore */ }
  }

  return (
    <Ctx.Provider value={{ user, session, loading, signOut, error }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() {
  return useContext(Ctx)
}
