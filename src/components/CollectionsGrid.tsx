import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Collection = {
  id: string;
  owner_id: string;
  title: string | null;
  cover_url: string | null;
  is_public: boolean;
  created_at: string;
};

type Props = { ownerId: string; isOwner?: boolean };

export default function CollectionsGrid({ ownerId, isOwner }: Props) {
  const [rows, setRows] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  async function fetchAll() {
    setLoading(true);
    const { data } = await supabase
      .from("collections")
      .select("*")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false });
    const list = ((data || []) as Collection[]).filter((c) => isOwner || c.is_public);
    setRows(list);
    setLoading(false);
  }

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, isOwner]);

  async function createCollection() {
    if (!title.trim()) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("collections")
      .insert({ owner_id: ownerId, title: title.trim(), is_public: isPublic })
      .select("*")
      .single();
    setBusy(false);
    if (error) return;
    if (data) {
      setRows((r) => [data as Collection, ...r]);
      setTitle("");
      setIsPublic(true);
      setShowNew(false);
    }
  }

  async function togglePublic(id: string, next: boolean) {
    setRows((r) => r.map((c) => (c.id === id ? { ...c, is_public: next } : c)));
    await supabase.from("collections").update({ is_public: next }).eq("id", id);
  }

  const empty = useMemo(() => rows.length === 0, [rows]);

  return (
    <div>
      {isOwner && (
        <div className="mb-4">
          {!showNew ? (
            <button
              onClick={() => setShowNew(true)}
              className="rounded-xl border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-900"
            >
              New collection
            </button>
          ) : (
            <div className="rounded-2xl border border-neutral-800 p-3">
              <div className="mb-2 text-sm font-medium">Create collection</div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Title"
                  className="min-w-[220px] rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm outline-none"
                />
                <label className="flex items-center gap-2 text-sm text-neutral-300">
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                  />
                  Public
                </label>
                <button
                  disabled={busy}
                  onClick={createCollection}
                  className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-900 disabled:opacity-60"
                >
                  {busy ? "Saving…" : "Create"}
                </button>
                <button
                  onClick={() => setShowNew(false)}
                  className="rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-900"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {loading && <div className="text-sm text-neutral-400">Loading collections…</div>}
      {!loading && empty && (
        <div className="text-neutral-400">
          {isOwner ? "No collections yet. Create one." : "No public collections yet."}
        </div>
      )}

      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {rows.map((c) => (
          <li key={c.id} className="group">
            <div className="aspect-square w-full overflow-hidden rounded-2xl bg-neutral-900">
              {c.cover_url ? (
                <img
                  src={c.cover_url}
                  alt={c.title ?? ""}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
              ) : (
                <div className="grid h-full w-full place-items-center text-sm text-neutral-500">
                  No cover
                </div>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="truncate text-sm text-neutral-200">
                {c.title || "Untitled"}
                {!c.is_public && (
                  <span className="ml-2 rounded-full border border-neutral-700 px-2 py-[2px] text-[10px] text-neutral-300">
                    Private
                  </span>
                )}
              </div>
              {isOwner && (
                <button
                  onClick={() => togglePublic(c.id, !c.is_public)}
                  className="shrink-0 rounded-lg border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-900"
                  title={c.is_public ? "Make private" : "Make public"}
                >
                  {c.is_public ? "Public" : "Private"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
