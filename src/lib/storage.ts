// src/lib/storage.ts
import { supabase } from './supabase'

export async function uploadPublicFile(
  bucket: 'avatars' | 'covers',
  userId: string,
  file: File
): Promise<string> {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
  const path = `${userId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: true,
  })
  if (error) throw error
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

export async function uploadPublicBlob(
  bucket: 'avatars' | 'covers',
  userId: string,
  blob: Blob,
  ext = 'jpg'
): Promise<string> {
  const path = `${userId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    cacheControl: '3600',
    upsert: true,
    contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
  })
  if (error) throw error
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}
