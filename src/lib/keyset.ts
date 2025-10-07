// src/lib/keyset.ts
export type Keyset = { cursor?: string | null; pageSize?: number };

export function encodeCursor(obj: Record<string, any>): string {
  return btoa(JSON.stringify(obj));
}
export function decodeCursor<T = any>(cur?: string | null): T | null {
  if (!cur) return null;
  try { return JSON.parse(atob(cur)); } catch { return null; }
}
