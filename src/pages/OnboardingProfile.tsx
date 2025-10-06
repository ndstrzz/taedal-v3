import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../state/AuthContext'
import { supabase } from '../lib/supabase'
import { DEFAULT_AVATAR_URL, DEFAULT_COVER_URL } from '../lib/config'
import { uploadPublicFile } from '../lib/storage'

export default function OnboardingProfile() {
  const { user } = useAuth()
  const nav = useNavigate()

  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string>('')    // string
  const [coverUrl, setCoverUrl] = useState<string>('')      // string

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!user) return
    // Prefill from profiles if exists
    ;(async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      if (data) {
        setDisplayName(data.display_name || '')
        setUsername(data.username || '')
        setBio(data.bio || '')
        setAvatarUrl(data.avatar_url || '')
        setCoverUrl(data.cover_url || '')
      }
    })()
  }, [user])

  async function pickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f || !user) return
    setBusy(true); setErr('')
    try {
      // MUST return a string URL
      const url = await uploadPublicFile('avatars', user.id, f)
      setAvatarUrl(url) // ✅ string, not object
    } catch (e: any) {
      setErr(e.message || 'Failed to upload avatar')
    } finally {
      setBusy(false)
    }
  }

  async function pickCover(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f || !user) return
    setBusy(true); setErr('')
    try {
      const url = await uploadPublicFile('covers', user.id, f)
      setCoverUrl(url) // ✅ string, not object
    } catch (e: any) {
      setErr(e.message || 'Failed to upload cover')
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!user) return
    if (!username.trim()) { setErr('Username is required'); return }
    setBusy(true); setErr('')
    try {
      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        username: username.toLowerCase(),
        display_name: displayName || null,
        bio: bio || null,
        avatar_url: avatarUrl || null,
        cover_url: coverUrl || null,
        updated_at: new Date().toISOString(),
      })
      if (error) throw error
      nav(`/@${username.toLowerCase()}`)
    } catch (e: any) {
      setErr(e.message || 'Failed to save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-h1 mb-2">Set up your profile</h1>
      <p className="text-subtle mb-6">Welcome to Taedal.</p>

      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="flex flex-col items-center gap-3">
          <div className="h-24 w-24 overflow-hidden rounded-full ring-1 ring-border">
            <img src={avatarUrl || DEFAULT_AVATAR_URL} className="h-full w-full object-cover" />
          </div>
          <label className="rounded-lg bg-elev1 px-3 py-1.5 text-sm ring-1 ring-border hover:bg-elev2 cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={pickAvatar} />
            Upload avatar
          </label>
        </div>

        <div className="md:col-span-2">
          <div className="h-32 w-full overflow-hidden rounded-lg ring-1 ring-border">
            <img src={coverUrl || DEFAULT_COVER_URL} className="h-full w-full object-cover" />
          </div>
          <div className="mt-2">
            <label className="rounded-lg bg-elev1 px-3 py-1.5 text-sm ring-1 ring-border hover:bg-elev2 cursor-pointer">
              <input type="file" accept="image/*" className="hidden" onChange={pickCover} />
              Upload cover
            </label>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <input className="rounded-lg bg-elev1 p-3 ring-1 ring-border focus:ring-brand"
               placeholder="Display name"
               value={displayName} onChange={e=>setDisplayName(e.target.value)} />
        <input className="rounded-lg bg-elev1 p-3 ring-1 ring-border focus:ring-brand"
               placeholder="username"
               value={username} onChange={e=>setUsername(e.target.value.toLowerCase())} />
      </div>

      <textarea className="mt-4 min-h-[96px] w-full rounded-lg bg-elev1 p-3 ring-1 ring-border focus:ring-brand"
                placeholder="Short bio"
                value={bio} onChange={e=>setBio(e.target.value.slice(0,160))} />

      {err && <div className="mt-3 text-sm text-error">{err}</div>}

      <div className="mt-6 flex items-center gap-3">
        <button onClick={save} disabled={busy}
          className="rounded-lg bg-brand/20 px-4 py-2 text-sm ring-1 ring-brand/50 hover:bg-brand/30">
          {busy ? 'Saving…' : 'Save & Continue'}
        </button>
        <button onClick={()=>nav(-1)} className="text-sm text-subtle hover:text-text">Cancel</button>
      </div>
    </div>
  )
}
