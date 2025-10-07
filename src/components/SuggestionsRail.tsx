import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../state/AuthContext";
import UserCard from "./UserCard";

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type SuggestRow = {
  user_id?: string;
  suggested_id?: string;
  strength?: number;
  // joined variant (if your view already returns profiles data)
  id?: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

export default function SuggestionsRail({ ownerId }: { ownerId: string }) {
  const { user } = useAuth();
  const viewerId = user?.id || null;

  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;

    async function fromJoinedView(ownerId: string): Promise<ProfileRow[] | null> {
      // If your view already SELECTs profile fields, this will “just work”
      const { data, error } = await supabase
        .from("suggested_follows")
        .select("id,username,display_name,avatar_url")
        .eq("user_id", ownerId)
        .limit(12);

      if (error) return null;
      const list = ((data || []) as any[]).filter((r) => r.id);
      if (list.length === 0) return null;

      // Optional: drop the viewer + owner
      const cleaned = list.filter((r) => r.id !== ownerId && r.id !== viewerId);
      return cleaned;
    }

    async function fromIdOnlyView(ownerId: string): Promise<ProfileRow[] | null> {
      // If your view returns only {user_id, suggested_id, strength}
      const { data, error } = await supabase
        .from("suggested_follows")
        .select("suggested_id")
        .eq("user_id", ownerId)
        .order("strength", { ascending: false })
        .limit(24);

      if (error) return null;

      let ids = Array.from(
        new Set(
          (data || [])
            .map((r: SuggestRow) => r.suggested_id!)
            .filter(Boolean)
            .filter((id) => id !== ownerId && id !== viewerId)
        )
      );

      if (ids.length === 0) return [];

      // Exclude accounts the viewer already follows
      if (viewerId) {
        const { data: youFollow } = await supabase
          .from("follows")
          .select("target_id")
          .eq("follower_id", viewerId)
          .in("target_id", ids);
        const followed = new Set((youFollow || []).map((r: any) => r.target_id as string));
        ids = ids.filter((id) => !followed.has(id));
      }

      ids = ids.slice(0, 12);

      const { data: users } = await supabase
        .from("profiles")
        .select("id,username,display_name,avatar_url")
        .in("id", ids);

      return ((users || []) as ProfileRow[]) ?? [];
    }

    async function fallbackFoF(ownerId: string): Promise<ProfileRow[]> {
      // Pure client fallback (no view)
      const { data: followers } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("target_id", ownerId)
        .limit(100);

      const followerIds = (followers || []).map((x: any) => x.follower_id) as string[];
      if (followerIds.length === 0) return [];

      const { data: fof } = await supabase
        .from("follows")
        .select("target_id")
        .in("follower_id", followerIds)
        .limit(500);

      let candidates = new Set((fof || []).map((x: any) => x.target_id as string));
      candidates.delete(ownerId);
      if (viewerId) candidates.delete(viewerId);

      if (viewerId) {
        const { data: youFollow } = await supabase
          .from("follows")
          .select("target_id")
          .eq("follower_id", viewerId)
          .in("target_id", Array.from(candidates));
        (youFollow || []).forEach((x: any) => candidates.delete(x.target_id));
      }

      const ids = Array.from(candidates).slice(0, 12);
      if (ids.length === 0) return [];

      const { data: users } = await supabase
        .from("profiles")
        .select("id,username,display_name,avatar_url")
        .in("id", ids);

      return (((users || []) as ProfileRow[]) ?? []).sort((a, b) =>
        (a.username || "").localeCompare(b.username || "")
      );
    }

    (async () => {
      setLoading(true);

      // Try “joined” view → then id-only view → then fallback
      const a = await fromJoinedView(ownerId);
      const b = a ?? (await fromIdOnlyView(ownerId));
      const c = b ?? (await fallbackFoF(ownerId));

      if (!cancel) {
        setRows(c || []);
        setLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [ownerId, viewerId]);

  const show = useMemo(() => rows.slice(0, 6), [rows]);

  if (loading) {
    return (
      <aside className="sticky top-20 hidden h-fit w-72 shrink-0 md:block">
        <div className="mb-2 h-4 w-28 animate-pulse rounded bg-neutral-800" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="mb-2 h-12 w-full animate-pulse rounded-xl bg-neutral-900" />
        ))}
      </aside>
    );
  }

  if (show.length === 0) return null;

  return (
    <aside className="sticky top-20 hidden h-fit w-72 shrink-0 space-y-2 md:block">
      <div className="text-sm font-semibold text-neutral-300">People also follow</div>
      <div className="divide-y divide-neutral-800 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950">
        {show.map((u) => (
          <div key={u.id} className="px-2 py-1">
            <UserCard {...u} />
          </div>
        ))}
      </div>
    </aside>
  );
}
