import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../state/AuthContext'
import { supabase } from '../lib/supabase'
import { uploadPublicFile } from '../lib/storage'

export default function OnboardingProfile() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [bio, setBio] = useState('')
  const [country, setCountry] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [website, setWebsite] = useState('')
  const [instagram, setInstagram] = useState('')
  const [behance, setBehance] = useState('')
  const [twitter, setTwitter] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const avatarInput = useRef<HTMLInputElement>(null)
  const coverInput = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!user) nav('/login') }, [user, nav])

  // (optional) Prefill existing profile
  useEffect(() => {
    (async () => {
      if (!user) return
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      if (data) {
        setBio(data.bio || '')
        setCountry(data.country || '')
        setCurrency(data.currency || 'USD')
        setWebsite(data.website || '')
        setInstagram(data.instagram || '')
        setBehance(data.behance || '')
        setTwitter(data.twitter || '')
        setAvatarUrl(data.avatar_url || '')
        setCoverUrl(data.cover_url || '')
      }
    })()
  }, [user])

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    try {
      setBusy(true)
      const url = await uploadPublicFile('avatars', user.id, file)
      setAvatarUrl(url)
    } catch (e: any) {
      setErr(e.message || 'Failed to upload avatar')
    } finally {
      setBusy(false)
    }
  }

  async function onPickCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    try {
      setBusy(true)
      const url = await uploadPublicFile('covers', user.id, file)
      setCoverUrl(url)
    } catch (e: any) {
      setErr(e.message || 'Failed to upload cover')
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!user) return
    setErr(''); setBusy(true)
    try {
      const { error } = await supabase.from('profiles').update({
        bio, country, currency, website, instagram, behance, twitter,
        avatar_url: avatarUrl || null, cover_url: coverUrl || null
      }).eq('id', user.id)
      if (error) throw error
      nav('/', { replace: true })
    } catch (e: any) {
      setErr(e?.message || 'Failed to save profile')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-2 text-h1">Complete your profile</h1>
      <p className="mb-6 text-subtle">Optional, but helps collectors recognize you.</p>

      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="flex flex-col items-center gap-3">
          <div className="h-24 w-24 overflow-hidden rounded-full ring-1 ring-border">
            {avatarUrl ? <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" /> : <div className="h-full w-full bg-elev1" />}
          </div>
          <input ref={avatarInput} type="file" accept="image/*" className="hidden" onChange={onPickAvatar}/>
          <button onClick={() => avatarInput.current?.click()}
            className="rounded-lg bg-elev1 px-3 py-1.5 text-sm ring-1 ring-border hover:bg-elev2">Upload avatar</button>
        </div>

        <div className="md:col-span-2">
          <div className="h-32 w-full overflow-hidden rounded-lg ring-1 ring-border">
            {coverUrl ? <img src={coverUrl} alt="cover" className="h-full w-full object-cover" /> : <div className="h-full w-full bg-elev1" />}
          </div>
          <input ref={coverInput} type="file" accept="image/*" className="hidden" onChange={onPickCover}/>
          <div className="mt-2">
            <button onClick={() => coverInput.current?.click()}
              className="rounded-lg bg-elev1 px-3 py-1.5 text-sm ring-1 ring-border hover:bg-elev2">Upload cover</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <textarea
          placeholder="Short bio (≤ 160 chars)"
          value={bio}
          onChange={e => setBio(e.target.value.slice(0,160))}
          className="rounded-lg bg-elev1 p-3 ring-1 ring-border focus:outline-none focus:ring-brand md:col-span-2 min-h-[96px]"
        />
        <input placeholder="Country/Region" value={country} onChange={e => setCountry(e.target.value)}
          className="rounded-lg bg-elev1 p-3 ring-1 ring-border focus:outline-none focus:ring-brand" />
        <input placeholder="Preferred currency (e.g., USD, SGD)" value={currency}
          onChange={e => setCurrency(e.target.value.toUpperCase())}
          className="rounded-lg bg-elev1 p-3 ring-1 ring-border focus:outline-none focus:ring-brand" />
        <input placeholder="Website / Portfolio" value={website} onChange={e => setWebsite(e.target.value)}
          className="rounded-lg bg-elev1 p-3 ring-1 ring-border focus:outline-none focus:ring-brand md:col-span-2" />
        <input placeholder="Instagram" value={instagram} onChange={e => setInstagram(e.target.value)}
          className="rounded-lg bg-elev1 p-3 ring-1 ring-border focus:outline-none focus:ring-brand" />
        <input placeholder="Behance" value={behance} onChange={e => setBehance(e.target.value)}
          className="rounded-lg bg-elev1 p-3 ring-1 ring-border focus:outline-none focus:ring-brand" />
        <input placeholder="X / Twitter" value={twitter} onChange={e => setTwitter(e.target.value)}
          className="rounded-lg bg-elev1 p-3 ring-1 ring-border focus:outline-none focus:ring-brand md:col-span-2" />
      </div>

      {err && <div className="mt-3 text-sm text-error">{err}</div>}

      <div className="mt-6 flex items-center gap-3">
        <button onClick={save} disabled={busy}
          className="rounded-lg bg-brand/20 px-4 py-2 text-sm ring-1 ring-brand/50 hover:bg-brand/30">
          {busy ? 'Saving…' : 'Save & Continue'}
        </button>
        <button onClick={() => nav('/', { replace: true })} className="text-sm text-subtle hover:text-text">
          Skip for now
        </button>
      </div>
    </div>
  )
}
