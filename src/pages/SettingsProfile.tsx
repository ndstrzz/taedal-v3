// src/pages/SettingsProfile.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../state/AuthContext";
import { supabase } from "../lib/supabase";
import { uploadPublicBlob } from "../lib/storage";
import CropModal from "../components/CropModal";
import { useToast } from "../components/Toaster";

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
};

export default function SettingsProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState({
    username: "",
    display_name: "",
    bio: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [cropOpen, setCropOpen] =
    useState<null | { kind: "avatar" | "cover"; file: File }>(null);

  // Load existing profile
  useEffect(() => {
    (async () => {
      if (!user) return;
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("id,username,display_name,bio,avatar_url,cover_url")
        .eq("id", user.id)
        .maybeSingle();
      setLoading(false);
      if (error) {
        toast({
          variant: "error",
          title: "Failed to load profile",
          description: error.message,
        });
        return;
      }
      const p = (data as Profile) || null;
      setProfile(p);
      setForm({
        username: p?.username || "",
        display_name: p?.display_name || "",
        bio: p?.bio || "",
      });
    })();
  }, [user, toast]);

  const displayName = useMemo(
    () => form.display_name || (form.username ? `@${form.username}` : "You"),
    [form.display_name, form.username]
  );

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        username: form.username.trim() || null,
        display_name: form.display_name.trim() || null,
        bio: form.bio.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    setSaving(false);

    if (error) {
      toast({
        variant: "error",
        title: "Couldn’t save",
        description: error.message,
      });
      return;
    }

    toast({ variant: "success", title: "Profile saved" });
    // ✅ Go back to your profile page
    navigate("/me", { replace: true });
  }

  function onPick(kind: "avatar" | "cover") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      setCropOpen({ kind, file });
    };
    input.click();
  }

  async function onCropDone(cropped: Blob, _meta: { width: number; height: number }) {
    if (!user || !cropOpen) return;

    try {
      const ext = "webp"; // CropModal exports webp/png; use a consistent ext
      const bucket = cropOpen.kind === "avatar" ? "avatars" : "covers";
      const url = await uploadPublicBlob(bucket, user.id, cropped, ext);

      // cache-bust to avoid stale avatars/covers
      const busted = `${url}?v=${Date.now()}`;

      const patch: Record<string, any> =
        cropOpen.kind === "avatar" ? { avatar_url: busted } : { cover_url: busted };

      const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
      if (error) throw error;

      setProfile((p) => (p ? ({ ...p, ...patch } as Profile) : p));
      toast({
        variant: "success",
        title: cropOpen.kind === "avatar" ? "Avatar updated" : "Cover updated",
      });
    } catch (err: any) {
      toast({
        variant: "error",
        title: "Upload failed",
        description: String(err.message || err),
      });
    } finally {
      setCropOpen(null);
    }
  }

  function onCropCancel() {
    setCropOpen(null);
  }

  if (loading) {
    return <div className="p-8 text-neutral-400">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-2xl font-semibold">Edit profile</h1>

      {/* Cover */}
      <div className="relative mb-8">
        <div className="h-40 w-full overflow-hidden rounded-2xl bg-neutral-900">
          {profile?.cover_url ? (
            <img src={profile.cover_url} className="h-40 w-full object-cover" />
          ) : (
            <div className="grid h-40 w-full place-items-center text-neutral-500">
              No cover
            </div>
          )}
        </div>
        <button
          onClick={() => onPick("cover")}
          className="absolute bottom-3 right-3 rounded-xl border border-neutral-700 bg-neutral-900/70 px-3 py-1.5 text-sm backdrop-blur hover:bg-neutral-800"
        >
          Change cover
        </button>
      </div>

      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <img
          src={profile?.avatar_url || "/brand/taedal-logo.svg"}
          className="h-20 w-20 rounded-full object-cover ring-4 ring-neutral-950"
        />
        <div className="flex-1">
          <div className="text-lg font-medium">{displayName}</div>
          <div className="text-sm text-neutral-400">
            {form.username ? `@${form.username}` : "Set a username"}
          </div>
        </div>
        <button
          onClick={() => onPick("avatar")}
          className="rounded-xl border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-900"
        >
          Change avatar
        </button>
      </div>

      {/* Form */}
      <form className="space-y-4" onSubmit={onSave}>
        <label className="block">
          <span className="mb-1 block text-sm text-neutral-300">Display name</span>
          <input
            value={form.display_name}
            onChange={(e) => setForm((s) => ({ ...s, display_name: e.target.value }))}
            className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2"
            placeholder="Your name"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-neutral-300">Username</span>
          <input
            value={form.username}
            onChange={(e) => setForm((s) => ({ ...s, username: e.target.value }))}
            className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2"
            placeholder="yourhandle"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-neutral-300">Bio</span>
          <textarea
            value={form.bio}
            onChange={(e) => setForm((s) => ({ ...s, bio: e.target.value }))}
            className="min-h-[100px] w-full resize-y rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2"
            placeholder="Tell collectors about yourself…"
          />
        </label>

        <div className="pt-2">
          <button
            disabled={saving}
            className="rounded-xl bg-white px-4 py-2 font-medium text-black disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>

      {/* Crop modal */}
      {cropOpen && (
        <CropModal
          file={cropOpen.file}
          aspect={cropOpen.kind === "avatar" ? 1 : 5 / 2}
          onCancel={onCropCancel}
          onDone={onCropDone}
        />
      )}
    </div>
  );
}
