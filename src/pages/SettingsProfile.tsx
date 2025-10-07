// src/pages/SettingsProfile.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../state/AuthContext";
import { supabase } from "../lib/supabase";
import { uploadPublicBlob } from "../lib/storage";
import CropModal from "../components/CropModal";
import { useToast } from "../components/Toaster";
import { ensureProfileRow } from "../lib/profile";

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  website?: string | null;
  instagram?: string | null;
  twitter?: string | null;
};

type FormState = {
  username: string;
  display_name: string;
  bio: string;
  website: string;
  instagram: string;
  twitter: string;
};

function normalizeWebsite(url: string) {
  const s = url.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

function normalizeHandle(h: string) {
  return h.replace(/^@+/, "").trim();
}

export default function SettingsProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState<FormState>({
    username: "",
    display_name: "",
    bio: "",
    website: "",
    instagram: "",
    twitter: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [cropOpen, setCropOpen] =
    useState<null | { kind: "avatar" | "cover"; file: File }>(null);

  // Load (and create if missing) the profile row
  useEffect(() => {
    (async () => {
      if (!user) return;
      setLoading(true);
      try {
        await ensureProfileRow(user.id);
        const { data, error } = await supabase
          .from("profiles")
          .select(
            "id,username,display_name,bio,avatar_url,cover_url,website,instagram,twitter"
          )
          .eq("id", user.id)
          .maybeSingle();
        if (error) throw error;
        const p = (data as Profile) || null;
        setProfile(p);
        setForm({
          username: p?.username || "",
          display_name: p?.display_name || "",
          bio: p?.bio || "",
          website: p?.website || "",
          instagram: p?.instagram || "",
          twitter: p?.twitter || "",
        });
      } catch (e: any) {
        toast({
          variant: "error",
          title: "Failed to load profile",
          description: e.message,
        });
      } finally {
        setLoading(false);
      }
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
    try {
      const payload = {
        id: user.id,
        username: form.username.trim() || null,
        display_name: form.display_name.trim() || null,
        bio: form.bio.trim() || null,
        website: normalizeWebsite(form.website) || null,
        instagram: normalizeHandle(form.instagram) || null,
        twitter: normalizeHandle(form.twitter) || null,
        updated_at: new Date().toISOString(),
      };

      // upsert so it works whether the row exists or not
      const { error } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "id" });
      if (error) throw error;

      toast({ variant: "success", title: "Profile saved" });
      navigate("/me", { replace: true });
    } catch (err: any) {
      toast({
        variant: "error",
        title: "Couldn’t save",
        description: err.message,
      });
    } finally {
      setSaving(false);
    }
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

  async function onCropDone(cropped: Blob) {
    if (!user || !cropOpen) return;

    try {
      const ext = "webp";
      const bucket = cropOpen.kind === "avatar" ? "avatars" : "covers";
      const url = await uploadPublicBlob(bucket, user.id, cropped, ext);
      const busted = `${url}?v=${Date.now()}`; // cache-bust so UI refreshes

      const patch =
        cropOpen.kind === "avatar" ? { avatar_url: busted } : { cover_url: busted };

      const { error } = await supabase
        .from("profiles")
        .upsert({ id: user.id, ...patch }, { onConflict: "id" });
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

  if (loading) return <div className="p-8 text-neutral-400">Loading…</div>;

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
            onChange={(e) =>
              setForm((s) => ({ ...s, display_name: e.target.value }))
            }
            className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2"
            placeholder="Your name"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-neutral-300">Username</span>
          <input
            value={form.username}
            onChange={(e) =>
              setForm((s) => ({ ...s, username: e.target.value }))
            }
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

        {/* Socials */}
        <label className="block">
          <span className="mb-1 block text-sm text-neutral-300">Website</span>
          <input
            value={form.website}
            onChange={(e) => setForm((s) => ({ ...s, website: e.target.value }))}
            placeholder="https://example.com"
            className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm text-neutral-300">Instagram</span>
            <div className="flex">
              <span className="inline-flex items-center rounded-l-xl border border-neutral-800 bg-neutral-900 px-3 text-sm text-neutral-400">
                @
              </span>
              <input
                value={form.instagram}
                onChange={(e) =>
                  setForm((s) => ({ ...s, instagram: e.target.value }))
                }
                placeholder="handle"
                className="w-full rounded-r-xl border border-l-0 border-neutral-800 bg-neutral-900 px-3 py-2"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-neutral-300">Twitter / X</span>
            <div className="flex">
              <span className="inline-flex items-center rounded-l-xl border border-neutral-800 bg-neutral-900 px-3 text-sm text-neutral-400">
                @
              </span>
              <input
                value={form.twitter}
                onChange={(e) =>
                  setForm((s) => ({ ...s, twitter: e.target.value }))
                }
                placeholder="handle"
                className="w-full rounded-r-xl border border-l-0 border-neutral-800 bg-neutral-900 px-3 py-2"
              />
            </div>
          </label>
        </div>

        <div className="pt-2">
          <button
            disabled={saving}
            className="rounded-xl bg-white px-4 py-2 font-medium text-black disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>

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
