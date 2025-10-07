// src/lib/profile.ts
import { supabase } from "./supabase";

/** Ensure a row exists in public.profiles for this user. Returns the row. */
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

/** Convenience fetch (returns null if missing). */
export async function getProfileById(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Decide where to send a user after auth. */
export async function destinationAfterAuth(userId: string, next?: string | null) {
  const profile = await ensureProfileRow(userId);
  if (next) return next;
  if (profile?.username) return `/@${profile.username}`;
  return "/settings";
}
