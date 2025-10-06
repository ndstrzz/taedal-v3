import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
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
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    let mounted = true

    // 1) Get existing session on first mount
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return
        setSession(data.session ?? null)
        setUser(data.session?.user ?? null)
      })
      .catch((e) => setError(e?.message ?? 'Auth init failed'))
      .finally(() => {
        if (mounted) setLoading(false)
      })

    // 2) Subscribe to auth changes (sign in/out/refresh)
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess ?? null)
      setUser(sess?.user ?? null)
    })

    return () => {
      mounted = false
      subscription?.subscription?.unsubscribe?.()
    }
  }, [])

  async function signOut() {
    try {
      await supabase.auth.signOut()
    } catch {
      /* ignore */
    }
  }

  const value = useMemo<AuthCtx>(
    () => ({ user, session, loading, signOut, error }),
    [user, session, loading, error]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  return useContext(Ctx)
}
