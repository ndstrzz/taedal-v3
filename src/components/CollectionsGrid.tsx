// src/components/CollectionsGrid.tsx
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Row = {
  id: string;
  title: string | null;
  cover_url: string | null;
  is_public: boolean | null;
  created_at: string;
};

export default function CollectionsGrid({ profileId }: { profileId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("collections")
          .select("id,title,cover_url,is_public,created_at")
          .eq("owner_id", profileId)
          .order("created_at", { ascending: false })
          .limit(100);
        if (error) throw error;
        if (!cancel) setRows((data as Row[]) || []);
      } catch (e: any) {
        // If table doesn't exist yet, show empty state rather than throwing
        if (!cancel) { setRows([]); setError(null); }
      }
    })();
    return () => { cancel = true; };
  }, [profileId]);

  if (rows === null) {
    return <div className="h-24 animate-pulse rounded-xl bg-neutral-900" />;
  }
  if (rows.length === 0) {
    return <div className="text-neutral-400">No collections yet.</div>;
  }
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
      {rows.map((c) => (
        <li key={c.id} className="group">
          <div className="aspect-square w-full overflow-hidden rounded-2xl bg-neutral-900">
            {c.cover_url ? (
              <img src={c.cover_url} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="grid h-full w-full place-items-center text-sm text-neutral-500">No cover</div>
            )}
          </div>
          <div className="mt-2 truncate text-sm text-neutral-200">{c.title || "Untitled"}</div>
        </li>
      ))}
    </ul>
  );
}
