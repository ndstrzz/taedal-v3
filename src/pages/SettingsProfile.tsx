import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../state/AuthContext'
import { DEFAULT_AVATAR_URL, DEFAULT_COVER_URL } from '../lib/config'
import { uploadPublicFile } from '../lib/storage'
import useDebounce from '../hooks/useDebounce'

export default function SettingsProfile() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const dUsername = useDebounce(username.toLowerCase().trim(), 400)
  const [usernameFree, setUsernameFree] = useState<boolean | null>(null)

  const [role, setRole] = useState<'artist'|'collector'|'brand'|'none'>('artist')
  const [bio, setBio] = useState('')
  const [website, setWebsite] = useState('')
  const [instagram, setInstagram] = useState('')
  const [behance, setBehance] = useState('')
  const [twitter, setTwitter] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [coverUrl, setCoverUrl] = useState('')

  useEffect(() => {
    if (!user) { nav('/login'); return }
    (async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      if (data) {
        setDisplayName(data.display_name || '')
        setUsername(data.username || '')
        setRole((data.role || 'artist') as any)
        setBio(data.bio || '')
        setWebsite(data.website || '')
        setInstagram(data.instagram || '')
        setBehance(data.behance || '')
        setTwitter(data.twitter || '')
        setAvatarUrl(data.avatar_url || '')
        setCoverUrl(data.cover_url || '')
      }
    })()
  }, [user, nav])

  useEffect(() => {
    let cancelled = false
    async function run() {
      setUsernameFree(null)
      if (!/^[a-z0-9_]{3,20}$/.test(dUsername)) return
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('username', dUsername)
      if (!cancelled) {
        const takenByOther = (data || []).some(row => row.id !== user?.id)
        setUsernameFree(!error && !takenByOther)
      }
    }
    if (dUsername) run()
    return () => { cancelled = true }
  }, [dUsername, user?.id])

  const unameHint = useMemo(() => {
    if (!username) return ''
    if (!/^[a-z0-9_]{3,20}$/.test(username)) return 'Use 3–20 lowercase letters, numbers, or _.'
    if (usernameFree === null) return 'Checking availability…'
    return usernameFree ? 'Available ✓' : 'Taken ✕'
  }, [username, usernameFree])

  async function save() {
    if (!user) return
    if (!/^[a-z0-9_]{3,20}$/.test(username)) { setErr('Invalid username format.'); return }
    if (usernameFree === false) { setErr('That username is taken.'); return }

    setErr(''); setBusy(true)
    try {
      const { error } = await supabase.from('profiles').update({
        username: username.toLowerCase(),
        display_name: displayName,
        role: role === 'none' ? null : role,
        bio, website, instagram, behance, twitter,
        avatar_url: avatarUrl || null,
        cover_url: coverUrl || null
      }).eq('id', user.id)
      if (error) throw error
      nav(`/@${username.toLowerCase()}`, { replace: true })
    } catch (e: any) {
      setErr(e.message || 'Failed to save profile')
    } finally {
      setBusy(false)
    }
  }

  async function pickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file || !user) return
    setBusy(true); setErr('')
    try {
      const { publicUrl } = await uploadPublicFile('avatars', user.id, file)
      setAvatarUrl(publicUrl)
    } catch (e: any) {
      setErr(e.message || 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  async function pickCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file || !user) return
    setBusy(true); setErr('')
    try {
      const { publicUrl } = await uploadPublicFile('covers', user.id, file)
      setCoverUrl(publicUrl)
    } catch (e: any) {
      setErr(e.message || 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-2 text-h1">Profile settings</h1>
      <p className="mb-6 text-subtle">Make it yours.</p>

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
        <div className="space-y-1">
          <input className="w-full rounded-lg bg-elev1 p-3 ring-1 ring-border focus:ring-brand"
                 placeholder="username"
                 value={username}
                 onChange={e=>setUsername(e.target.value.toLowerCase())} />
          <div className={`text-xs ${usernameFree ? 'text-success' : usernameFree === false ? 'text-error' : 'text-subtle'}`}>
            {unameHint}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(['artist','collector','brand'] as const).map(r => (
          <button key={r} type="button" onClick={()=>setRole(r)}
            className={`rounded-full px-3 py-1 text-sm ring-1 ${role===r?'bg-brand/20 ring-brand/50':'bg-elev1 ring-border hover:bg-elev2'}`}>
            {r[0].toUpperCase()+r.slice(1)}
          </button>
        ))}
        <button type="button" onClick={()=>setRole('none')} className="rounded-full px-3 py-1 text-sm ring-1 bg-elev1 ring-border hover:bg-elev2">
          None
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <textarea className="md:col-span-2 min-h-[96px] rounded-lg bg-elev1 p-3 ring-1 ring-border focus:ring-brand"
                  placeholder="Short bio" value={bio} onChange={e=>setBio(e.target.value.slice(0,160))}/>
        <input className="rounded-lg bg-elev1 p-3 ring-1 ring-border focus:ring-brand" placeholder="Website" value={website} onChange={e=>setWebsite(e.target.value)} />
        <input className="rounded-lg bg-elev1 p-3 ring-1 ring-border focus:ring-brand" placeholder="Instagram" value={instagram} onChange={e=>setInstagram(e.target.value)} />
        <input className="rounded-lg bg-elev1 p-3 ring-1 ring-border focus:ring-brand" placeholder="Behance" value={behance} onChange={e=>setBehance(e.target.value)} />
        <input className="rounded-lg bg-elev1 p-3 ring-1 ring-border focus:ring-brand md:col-span-2" placeholder="X / Twitter" value={twitter} onChange={e=>setTwitter(e.target.value)} />
      </div>

      {err && <div className="mt-3 text-sm text-error">{err}</div>}

      <div className="mt-6 flex items-center gap-3">
        <button onClick={save} disabled={busy} className="rounded-lg bg-brand/20 px-4 py-2 text-sm ring-1 ring-brand/50 hover:bg-brand/30">
          {busy ? 'Saving…' : 'Save changes'}
        </button>
        <button onClick={()=>nav(-1)} className="text-sm text-subtle hover:text-text">Cancel</button>
      </div>
    </div>
  )
}
