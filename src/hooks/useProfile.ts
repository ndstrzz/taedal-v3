import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../state/AuthContext'

export type Profile = {
  id: string
  username: string | null
  display_name: string | null
  role: 'artist' | 'collector' | 'brand' | null
  bio: string | null
  country: string | null
  currency: string | null
  website: string | null
  instagram: string | null
  behance: string | null
  twitter: string | null
  avatar_url: string | null
  cover_url: string | null
  verified_at: string | null
  updated_at?: string | null
}

export function useProfile() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async () => {
    if (!user) { setProfile(null); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()
    setProfile((data as any) || null)
    setLoading(false)
  }, [user])

  useEffect(() => { fetchProfile() }, [fetchProfile])

  // 🔔 listen for “profile-updated” to refetch immediately
  useEffect(() => {
    function onRefresh() { fetchProfile() }
    window.addEventListener('profile-updated', onRefresh)
    return () => window.removeEventListener('profile-updated', onRefresh)
  }, [fetchProfile])

  return { profile, loading }
}
