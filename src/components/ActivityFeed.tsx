// src/components/ActivityFeed.tsx
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Item = { id: string; type: "followed" | "minted"; created_at: string; title?: string | null };

export default function ActivityFeed({ profileId }: { profileId: string }) {
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const out: Item[] = [];
      // Follows they made
      const { data: f } = await supabase
        .from("follows")
        .select("target_id, created_at")
        .eq("follower_id", profileId)
        .order("created_at", { ascending: false })
        .limit(20);
      (f || []).forEach((x: any, i: number) =>
        out.push({ id: `f-${i}-${x.target_id}`, type: "followed", created_at: x.created_at })
      );

      // Art they minted (published)
      const { data: a } = await supabase
        .from("artworks")
        .select("id, title, created_at")
        .eq("owner", profileId)
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(20);
      (a || []).forEach((x: any) =>
        out.push({ id: `a-${x.id}`, type: "minted", created_at: x.created_at, title: x.title })
      );

      out.sort((x, y) => (x.created_at < y.created_at ? 1 : -1));
      if (!cancel) setItems(out.slice(0, 30));
    })();
    return () => { cancel = true; };
  }, [profileId]);

  if (items === null) return <div className="h-24 animate-pulse rounded-xl bg-neutral-900" />;
  if (items.length === 0) return <div className="text-neutral-400">No recent activity.</div>;

  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={it.id} className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm">
          <span className="text-neutral-400">
            {new Date(it.created_at).toLocaleString()} —{" "}
            {it.type === "followed" ? "Followed someone" : `Published “${it.title || "Untitled"}”`}
          </span>
        </li>
      ))}
    </ul>
  );
}
