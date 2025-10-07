import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../state/AuthContext";

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
};

export default function PublicProfile() {
  const { handle: raw } = useParams<{ handle: string }>();
  const handle = (raw || "").replace(/^@/, "");
  const { user } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // 1) primary table
        let { data, error } = await supabase
          .from("profiles")
          .select("id,username,display_name,bio,avatar_url,cover_url")
          .eq("username", handle)
          .maybeSingle();

        // 2) optional safe view
        if (!data || error) {
          const tryView = await supabase
            .from("public_profiles")
            .select("id,username,display_name,bio,avatar_url,cover_url")
            .eq("username", handle)
            .maybeSingle();
          if (tryView.data) {
            data = tryView.data as any;
          }
        }

        if (!cancelled) setProfile((data as any) || null);
      } catch {
        if (!cancelled) setProfile(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handle]);

  // If the profile doesn’t exist and the viewer is the owner, send them to settings to create one
  useEffect(() => {
    if (loading) return;
    if (!profile && user) {
      // cheap check: if the user has no username or it matches the handle, send to settings
      if (!user.user_metadata?.username || user.user_metadata?.username === handle) {
        navigate("/settings", { replace: true });
      }
    }
  }, [loading, profile, user, handle, navigate]);

  if (loading) {
    return <div className="p-8 text-neutral-400">Loading…</div>;
  }

  if (!profile) {
    return <div className="p-8 text-neutral-400">Not found.</div>;
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="relative mb-8 overflow-hidden rounded-2xl">
        <img
          src={profile.cover_url || "/brand/taedal-logo.svg"}
          className="h-40 w-full object-cover"
        />
        <img
          src={profile.avatar_url || "/brand/taedal-logo.svg"}
          className="absolute -bottom-8 left-6 h-20 w-20 rounded-full ring-4 ring-neutral-950 object-cover"
        />
      </div>

      <div className="pl-28">
        <div className="text-xl font-semibold">
          {profile.display_name || `@${profile.username}`}
        </div>
        <div className="text-neutral-400">@{profile.username}</div>
        {profile.bio && <p className="mt-4 max-w-2xl text-neutral-300 whitespace-pre-wrap">{profile.bio}</p>}
      </div>
    </div>
  );
}
