import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../state/AuthContext";

export default function LikeButton({
  artworkId,
  className = "",
}: {
  artworkId: string;
  className?: string;
}) {
  const { user } = useAuth();
  const [liked, setLiked] = useState(false);
  const [busy, setBusy] = useState(false);

  // preload like state
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!user) return setLiked(false);
      const { count } = await supabase
        .from("likes")
        .select("artwork_id", { count: "exact", head: true })
        .eq("profile_id", user.id)
        .eq("artwork_id", artworkId);
      if (!cancel) setLiked((count ?? 0) > 0);
    })();
    return () => { cancel = true; };
  }, [user, artworkId]);

  async function toggle() {
    if (!user || busy) return;
    setBusy(true);
    const was = liked;
    setLiked(!was);
    try {
      if (was) {
        const { error } = await supabase
          .from("likes")
          .delete()
          .eq("profile_id", user.id)
          .eq("artwork_id", artworkId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("likes")
          .insert({ profile_id: user.id, artwork_id: artworkId });
        if (error) throw error;
      }
    } catch (e) {
      setLiked(was);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={!user || busy}
      className={`rounded-xl border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-900 ${className}`}
      title={user ? "Like" : "Log in to like"}
    >
      {busy ? "…" : liked ? "♥ Liked" : "♡ Like"}
    </button>
  );
}
