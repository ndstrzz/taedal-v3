// src/components/UserCard.tsx
import { useNavigate } from "react-router-dom";

type Props = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  subtitle?: string;
  onClick?: () => void;
};

export default function UserCard({ id, username, display_name, avatar_url, subtitle, onClick }: Props) {
  const nav = useNavigate();
  const go = () => {
    if (onClick) onClick();
    if (username) nav(`/u/${encodeURIComponent(username)}`);
  };
  return (
    <button onClick={go} className="flex w-full items-center gap-3 rounded-xl p-2 hover:bg-neutral-900">
      <img
        src={avatar_url || "/brand/taedal-logo.svg"}
        className="h-9 w-9 rounded-full object-cover"
        alt=""
        loading="lazy"
      />
      <div className="min-w-0 text-left">
        <div className="truncate text-sm text-neutral-200">{display_name || (username ? `@${username}` : "User")}</div>
        {username && <div className="truncate text-xs text-neutral-400">@{username}</div>}
        {subtitle && <div className="truncate text-xs text-neutral-500">{subtitle}</div>}
      </div>
    </button>
  );
}
