// src/pages/Analytics.tsx
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../state/AuthContext";

type Row = { day: string; profile_views: number; artwork_views: number; follows: number; likes: number };

export default function Analytics() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("events_daily")
        .select("*")
        .eq("user_id", user.id)
        .order("day", { ascending: false })
        .limit(30);
      setRows((data || []) as Row[]);
      setLoading(false);
    })();
  }, [user]);

  if (!user) return <div className="p-6 text-neutral-400">Log in to see analytics.</div>;
  if (loading) return <div className="p-6 text-neutral-400">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">Analytics</h1>
      <div className="overflow-hidden rounded-2xl border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-950">
            <tr className="text-left text-neutral-300">
              <th className="px-3 py-2">Day</th>
              <th className="px-3 py-2">Profile views</th>
              <th className="px-3 py-2">Artwork views</th>
              <th className="px-3 py-2">Follows</th>
              <th className="px-3 py-2">Likes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {rows.map((r) => (
              <tr key={r.day} className="text-neutral-300">
                <td className="px-3 py-2">{new Date(r.day).toLocaleDateString()}</td>
                <td className="px-3 py-2">{r.profile_views}</td>
                <td className="px-3 py-2">{r.artwork_views}</td>
                <td className="px-3 py-2">{r.follows}</td>
                <td className="px-3 py-2">{r.likes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
