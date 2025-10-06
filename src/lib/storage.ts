import { supabase } from './supabase'

export type BucketName = 'avatars' | 'covers' | 'artworks'

export async function uploadPublicFile(bucket: BucketName, userId: string, file: File) {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'dat'
  const safe = file.name.replace(/[^\w.-]+/g, '_').slice(0, 64)
  const path = `${userId}/${Date.now()}_${safe}.${ext}`
  const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false
  })
  if (upErr) throw upErr
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return { publicUrl: data.publicUrl, path }
}
