import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { uploadPublicBlob } from "../lib/storage";

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  profile: Profile;
  onSaved: (patch: Partial<Profile>) => void;
};

function validateUsername(u: string) {
  return /^[a-z0-9_]{3,20}$/.test(u);
}

export default function EditProfileModal({ open, onClose, profile, onSaved }: Props) {
  const [displayName, setDisplayName] = useState(profile.display_name || "");
  const [username, setUsername] = useState((profile.username || "").toLowerCase());
  const [bio, setBio] = useState(profile.bio || "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const [checking, setChecking] = useState(false);
  const [usernameFree, setUsernameFree] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDisplayName(profile.display_name || "");
    setUsername((profile.username || "").toLowerCase());
    setBio(profile.bio || "");
    setAvatarFile(null);
    setErr(null);
    setUsernameFree(null);
  }, [open, profile]);

  // username availability
  useEffect(() => {
    let off = false;
    (async () => {
      setUsernameFree(null);
      const u = username.trim().toLowerCase();
      if (!u || !validateUsername(u)) return;
      setChecking(true);
      const { count, error } = await supabase
        .from("profiles")
        .select("id", { head: true, count: "exact" })
        .eq("username", u)
        .neq("id", profile.id);
      if (!off) {
        setChecking(false);
        setUsernameFree(!error && (count ?? 0) === 0);
      }
    })();
    return () => {
      off = true;
    };
  }, [username, profile.id]);

  async function save() {
    try {
      setBusy(true);
      setErr(null);

      const patch: Partial<Profile> = {
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
      };

      const uname = username.trim().toLowerCase();
      if (uname) {
        if (!validateUsername(uname)) throw new Error("Username must be 3–20 chars a–z 0–9 _.");
        if (usernameFree === false) throw new Error("That username is taken.");
        patch.username = uname;
      } else {
        patch.username = null;
      }

      if (avatarFile) {
        const url = await uploadPublicBlob("avatars", profile.id, avatarFile, "webp");
        patch.avatar_url = `${url}?v=${Date.now()}`;
      }

      const { error } = await supabase.from("profiles").update(patch).eq("id", profile.id);
      if (error) throw error;

      onSaved(patch);
      onClose();
    } catch (e: any) {
      setErr(e?.message || "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Edit profile</h2>
          <button
            onClick={onClose}
            className="rounded-lg border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-900"
          >
            Close
          </button>
        </div>

        {err && <div className="mb-3 rounded-lg bg-red-500/10 p-2 text-sm text-red-300">{err}</div>}

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm text-neutral-300">Avatar</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setAvatarFile(e.target.files?.[0] || null)}
            />
            {avatarFile && (
              <div className="mt-1 text-xs text-neutral-400">
                {avatarFile.type} • {(avatarFile.size / (1024 * 1024)).toFixed(1)}MB
              </div>
            )}
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-neutral-300">Display name</span>
            <input
              className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-neutral-300">Username</span>
            <div className="flex items-center gap-2">
              <span className="text-neutral-500">@</span>
              <input
                className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                placeholder="yourhandle"
              />
            </div>
            <div className="mt-1 text-xs">
              {!username ? (
                <span className="text-neutral-500">You can also leave this blank for now.</span>
              ) : !validateUsername(username) ? (
                <span className="text-red-300">Use 3–20 lowercase letters, numbers, or _.</span>
              ) : checking ? (
                <span className="text-neutral-500">Checking…</span>
              ) : usernameFree ? (
                <span className="text-green-400">Available ✓</span>
              ) : (
                <span className="text-red-300">Taken ✕</span>
              )}
            </div>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-neutral-300">Bio</span>
            <textarea
              className="min-h-[100px] w-full resize-y rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell people about yourself…"
            />
          </label>

          <div className="pt-2">
            <button
              onClick={save}
              disabled={busy}
              className="rounded-xl bg-white px-4 py-2 font-medium text-black disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
