// src/lib/storage.ts
import { supabase } from "./supabase";

/**
 * Uploads a blob to a public Storage bucket under <userId>/<random>.<ext>
 * and returns a cache-busted public URL.
 */
export async function uploadPublicBlob(
  bucket: "avatars" | "covers",
  userId: string,
  blob: Blob,
  ext = "webp"
): Promise<string> {
  if (!userId) throw new Error("uploadPublicBlob: missing userId");

  // key must begin with the user's UUID or RLS will reject
  const key = `${userId}/${crypto.randomUUID()}.${ext.replace(/^\./, "")}`;

  // pick a content type
  const contentType =
    blob.type ||
    (ext === "png"
      ? "image/png"
      : ext === "jpg" || ext === "jpeg"
      ? "image/jpeg"
      : "image/webp");

  const { error } = await supabase.storage.from(bucket).upload(key, blob, {
    contentType,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(key);
  // add a cache-buster so the new image shows immediately
  return `${data.publicUrl}?v=${Date.now()}`;
}
