import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../state/AuthContext";

type Props = {
  targetId: string;                       // the profile.id of the profile you are viewing
  onChange?: (isFollowing: boolean) => void;
};

export default function FollowButton({ targetId, onChange }: Props) {
  const { user } = useAuth();
  const me = user?.id;
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!me || !targetId || me === targetId) {
        setFollowing(false);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data, error } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("follower_id", me)
        .eq("target_id", targetId)
        .maybeSingle();
      if (!cancelled) {
        setFollowing(!!data && !error);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me, targetId]);

  async function toggle() {
    if (!me) return;
    setLoading(true);
    try {
      if (following) {
        await supabase
          .from("follows")
          .delete()
          .eq("follower_id", me)
          .eq("target_id", targetId);
        setFollowing(false);
        onChange?.(false);
      } else {
        await supabase
          .from("follows")
          .insert({ follower_id: me, target_id: targetId });
        setFollowing(true);
        onChange?.(true);
      }
    } finally {
      setLoading(false);
    }
  }

  if (!me || me === targetId) return null;

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`rounded-xl px-3 py-1.5 text-sm border ${
        following
          ? "border-neutral-600 bg-neutral-800 hover:bg-neutral-700"
          : "border-neutral-700 hover:bg-neutral-900"
      }`}
      title={following ? "Unfollow" : "Follow"}
    >
      {loading ? "…" : following ? "Following" : "Follow"}
    </button>
  );
}
