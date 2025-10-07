import { useState } from "react";
import { supabase } from "../lib/supabase";

type Props = {
  userId: string;
  initial: {
    display_name: string | null;
    bio: string | null;
    avatar_url: string | null;
    cover_url: string | null;
    website?: string | null;
    instagram?: string | null;
    twitter?: string | null;
  };
  onSaved?: () => void;
};

export default function EditProfileInline({ userId, initial, onSaved }: Props) {
  const [form, setForm] = useState({ ...initial });
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: form.display_name,
        bio: form.bio,
        avatar_url: form.avatar_url,
        cover_url: form.cover_url,
        website: (form as any).website ?? null,
        instagram: (form as any).instagram ?? null,
        twitter: (form as any).twitter ?? null,
      })
      .eq("id", userId);
    setBusy(false);
    if (!error) onSaved?.();
  }

  return (
    <div className="rounded-2xl border border-neutral-800 p-4">
      <div className="mb-2 text-sm font-medium">Edit profile</div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          <div className="mb-1 text-neutral-300">Display name</div>
          <input
            value={form.display_name || ""}
            onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm outline-none"
          />
        </label>
        <label className="text-sm">
          <div className="mb-1 text-neutral-300">Website</div>
          <input
            value={(form as any).website || ""}
            onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm outline-none"
            placeholder="https://…"
          />
        </label>
        <label className="md:col-span-2 text-sm">
          <div className="mb-1 text-neutral-300">Bio</div>
          <textarea
            value={form.bio || ""}
            onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
            rows={3}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none"
          />
        </label>

        <label className="text-sm">
          <div className="mb-1 text-neutral-300">Avatar URL</div>
          <input
            value={form.avatar_url || ""}
            onChange={(e) => setForm((f) => ({ ...f, avatar_url: e.target.value }))}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm outline-none"
          />
        </label>
        <label className="text-sm">
          <div className="mb-1 text-neutral-300">Cover URL</div>
          <input
            value={form.cover_url || ""}
            onChange={(e) => setForm((f) => ({ ...f, cover_url: e.target.value }))}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm outline-none"
          />
        </label>

        <label className="text-sm">
          <div className="mb-1 text-neutral-300">Instagram</div>
          <input
            value={(form as any).instagram || ""}
            onChange={(e) => setForm((f) => ({ ...f, instagram: e.target.value }))}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm outline-none"
            placeholder="@handle"
          />
        </label>
        <label className="text-sm">
          <div className="mb-1 text-neutral-300">Twitter / X</div>
          <input
            value={(form as any).twitter || ""}
            onChange={(e) => setForm((f) => ({ ...f, twitter: e.target.value }))}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm outline-none"
            placeholder="@handle"
          />
        </label>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          disabled={busy}
          onClick={save}
          className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-900 disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
