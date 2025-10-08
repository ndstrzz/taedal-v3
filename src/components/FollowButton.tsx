import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../state/AuthContext";
import { useToast } from "./Toaster";

type Props = {
  /** User id you want to follow/unfollow */
  targetId: string;
  /** Optional: called after a successful toggle */
  onToggled?: (follows: boolean) => void;
  /** Optional: extra classes */
  className?: string;
  /** If true, render compact */
  small?: boolean;
};

export default function FollowButton({ targetId, onToggled, className = "", small }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [isFollowing, setIsFollowing] = useState(false);
  const [busy, setBusy] = useState(false);

  const disabled = busy || !user || user?.id === targetId;

  // load initial follow state
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!user || !targetId || user.id === targetId) {
        setIsFollowing(false);
        return;
      }
      const { count, error } = await supabase
        .from("follows")
        .select("follower_id", { count: "exact", head: true })
        .eq("follower_id", user.id)
        .eq("target_id", targetId);
      if (!cancel && !error) setIsFollowing((count ?? 0) > 0);
    })();
    return () => {
      cancel = true;
    };
  }, [user, targetId]);

  async function toggle() {
    if (!user) {
      toast({ variant: "error", title: "Please log in to follow users." });
      return;
    }
    if (user.id === targetId) return;

    setBusy(true);
    const prev = isFollowing;
    setIsFollowing(!prev); // optimistic flip

    try {
      if (prev) {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", user.id)
          .eq("target_id", targetId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("follows")
          .insert({ follower_id: user.id, target_id: targetId });
        if (error) throw error;
      }
      onToggled?.(!prev);
    } catch (e: any) {
      // undo optimistic
      setIsFollowing(prev);
      toast({
        variant: "error",
        title: "Follow action failed",
        description: e?.message || String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  const base =
    "rounded-xl border px-3 py-1.5 text-sm transition-colors " +
    (small ? "px-2 py-1 text-xs" : "");

  const style = isFollowing
    ? "border-neutral-600 bg-neutral-800 hover:bg-neutral-700"
    : "border-neutral-700 hover:bg-neutral-900";

  return (
    <button onClick={toggle} disabled={disabled} className={`${base} ${style} ${className}`}>
      {busy ? "…" : isFollowing ? "Following" : "Follow"}
    </button>
  );
}
