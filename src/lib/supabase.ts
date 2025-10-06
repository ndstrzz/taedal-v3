import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config'

function makeStub(): SupabaseClient {
  // Minimal proxy that rejects calls with a friendly message
  const err = new Error(
    'Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in index.html → window.__CONFIG__.'
  )
  const stub: any = {
    auth: {
      getSession: async () => { throw err },
      signOut: async () => { throw err },
      signInWithPassword: async () => { throw err },
      signUp: async () => { throw err },
      signInWithOAuth: async () => { throw err },
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
    }
  }
  return stub as SupabaseClient
}

export const supabase: SupabaseClient =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      })
    : makeStub()
