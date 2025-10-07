import { useSearchParams } from "react-router-dom";

type Tab = { key: string; label: string; badge?: number };

export default function Tabs({ tabs }: { tabs: Tab[] }) {
  const [params, setParams] = useSearchParams();
  const active = params.get("tab") || tabs[0].key;

  function setActive(key: string) {
    const next = new URLSearchParams(params);
    if (key === tabs[0].key) next.delete("tab");
    else next.set("tab", key);
    setParams(next, { replace: true });
  }

  return (
    <div className="mt-6 flex gap-2 border-b border-neutral-800">
      {tabs.map(t => {
        const is = t.key === active;
        return (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`relative -mb-px rounded-t-lg px-3 py-2 text-sm ${
              is
                ? "border-b-2 border-white text-white"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {t.label}
            {typeof t.badge === "number" && (
              <span className="ml-2 rounded-full border border-neutral-700 px-1.5 text-xs text-neutral-300">
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
