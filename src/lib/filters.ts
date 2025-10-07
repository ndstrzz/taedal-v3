// src/lib/filters.ts
import { supabase } from "./supabase";

export async function fetchBlockedIds(viewerId?: string | null): Promise<Set<string>> {
  if (!viewerId) return new Set();
  const { data } = await supabase
    .from("blocks")
    .select("blocked")
    .eq("blocker", viewerId);
  return new Set((data || []).map((r: any) => r.blocked as string));
}
