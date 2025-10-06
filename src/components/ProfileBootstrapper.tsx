import { useEffect, useRef } from 'react'
import { useAuth } from '../state/AuthContext'
import { supabase } from '../lib/supabase'
import { loadDraft, clearDraft } from '../lib/draft'

// Make a username safe and, if taken, add a suffix once.
async function ensureUsernameAvailable(base: string, myId: string) {
  const uname = base.toLowerCase()
  // Is it taken by someone else?
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', uname)
  if (error) return uname // best effort; let server validate
  const takenByOther = (data || []).some(r => r.id !== myId)
  if (!takenByOther) return uname
  // add a 4-digit suffix
  const suffix = Math.floor(1000 + Math.random() * 9000)
  return `${uname}_${suffix}`
}

/**
 * Mount this once globally. After the user logs in, it:
 * 1) loads the signup draft,
 * 2) fills missing profile fields (username, display_name, role),
 * 3) clears the draft.
 */
export default function ProfileBootstrapper() {
  const { user } = useAuth()
  const doneRef = useRef(false)

  useEffect(() => {
    async function run() {
      if (!user || doneRef.current) return
      const draft = loadDraft()
      if (!draft) { doneRef.current = true; return }

      // Fetch current row
      const { data: row } = await supabase
        .from('profiles')
        .select('id, username, display_name, role')
        .eq('id', user.id)
        .maybeSingle()

      // Determine what to write (only if missing)
      const toUpdate: any = {}
      if (row && !row.username && draft.username) {
        toUpdate.username = await ensureUsernameAvailable(draft.username, user.id)
      }
      if (row && !row.display_name && draft.displayName) {
        toUpdate.display_name = draft.displayName
      }
      if (row && !row.role && draft.role) {
        toUpdate.role = draft.role
      }
      if (Object.keys(toUpdate).length > 0) {
        await supabase.from('profiles').update(toUpdate).eq('id', user.id)
      }
      clearDraft()
      doneRef.current = true
    }
    run()
  }, [user])

  return null
}
