import { Link } from "react-router-dom";

type Props = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  subtitle?: string;
};

export default function UserCard({ username, display_name, avatar_url, subtitle }: Props) {
  const name = display_name || (username ? `@${username}` : "User");
  const href = username ? `/u/${encodeURIComponent(username)}` : "#";
  return (
    <Link
      to={href}
      className="flex items-center gap-3 rounded-xl border border-neutral-800 p-2 hover:bg-neutral-900"
    >
      <img
        src={avatar_url || "/brand/taedal-logo.svg"}
        className="h-9 w-9 rounded-full object-cover"
        alt=""
      />
      <div className="min-w-0">
        <div className="truncate text-sm">{name}</div>
        {username && <div className="truncate text-xs text-neutral-400">@{username}</div>}
        {subtitle && <div className="truncate text-xs text-neutral-500">{subtitle}</div>}
      </div>
    </Link>
  );
}
