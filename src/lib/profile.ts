// src/lib/profile.ts
import { supabase } from "./supabase";

/**
 * Ensure the signed-in user has a row in public.profiles.
 * Returns the profile row (may have null username).
 */
export async function ensureProfileRow(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;

  if (data) return data;

  // Create minimal placeholder profile
  const { data: ins, error: insErr } = await supabase
    .from("profiles")
    .insert({ id: userId })
    .select("*")
    .single();

  if (insErr) throw insErr;
  return ins;
}

/**
 * Fetch the profile for a user id (returns null if none).
 */
export async function getProfileById(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * After successful auth: ensure profile exists, then redirect.
 * - next provided -> next
 * - else username exists -> /@username
 * - else -> /settings
 */
export async function destinationAfterAuth(userId: string, next?: string | null) {
  const profile = await ensureProfileRow(userId);
  if (next) return next;
  if (profile?.username) return `/@${profile.username}`;
  return "/settings";
}
