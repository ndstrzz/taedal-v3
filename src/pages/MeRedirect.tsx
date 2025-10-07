import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../state/AuthContext";
import { getProfileById } from "../lib/profile";

export default function MeRedirect() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      if (loading) return;
      if (!user) {
        navigate("/login?next=/me", { replace: true });
        return;
      }
      const prof = await getProfileById(user.id);
      if (prof?.username) navigate(`/@${prof.username}`, { replace: true });
      else navigate("/settings", { replace: true });
    })();
  }, [user, loading, navigate]);

  return <div className="p-8 text-neutral-400">Loading…</div>;
}
