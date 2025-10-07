// src/components/SuggestionsRail.tsx
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../state/AuthContext";
import UserCard from "./UserCard";

type Row = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export default function SuggestionsRail({ ownerId }: { ownerId: string }) {
  const { user } = useAuth();
  const viewerId = user?.id || null;
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);

      // 1) who follows the owner?
      const { data: followers } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("target_id", ownerId)
        .limit(100);

      const followerIds = (followers || []).map((x: any) => x.follower_id) as string[];
      if (followerIds.length === 0) {
        if (!cancel) {
          setRows([]);
          setLoading(false);
        }
        return;
      }

      // 2) who do THEY follow? (friends-of-friends)
      const { data: fof } = await supabase
        .from("follows")
        .select("target_id")
        .in("follower_id", followerIds)
        .limit(500);

      let candidates = new Set((fof || []).map((x: any) => x.target_id as string));
      // remove the owner and viewer
      candidates.delete(ownerId);
      if (viewerId) candidates.delete(viewerId);

      // 3) exclude already-followed-by-viewer
      if (viewerId) {
        const { data: youFollow } = await supabase
          .from("follows")
          .select("target_id")
          .eq("follower_id", viewerId)
          .in("target_id", Array.from(candidates));
        (youFollow || []).forEach((x: any) => candidates.delete(x.target_id));
      }

      const ids = Array.from(candidates).slice(0, 12);
      if (ids.length === 0) {
        if (!cancel) {
          setRows([]);
          setLoading(false);
        }
        return;
      }

      const { data: users } = await supabase
        .from("profiles")
        .select("id,username,display_name,avatar_url")
        .in("id", ids);

      if (!cancel) {
        setRows(((users || []) as Row[]).sort((a, b) => (a.username || "").localeCompare(b.username || "")));
        setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [ownerId, viewerId]);

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="h-4 w-24 animate-pulse rounded bg-neutral-800" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 w-full animate-pulse rounded-xl bg-neutral-900" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) return null;

  return (
    <aside className="sticky top-20 hidden h-fit w-72 shrink-0 space-y-2 md:block">
      <div className="text-sm font-semibold text-neutral-300">People also follow</div>
      <div className="divide-y divide-neutral-800 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950">
        {rows.map((u) => (
          <div key={u.id} className="px-2 py-1">
            <UserCard {...u} />
          </div>
        ))}
      </div>
    </aside>
  );
}
