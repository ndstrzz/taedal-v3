// src/components/AttributeEditor.tsx
import React from "react";

export type Attribute = { trait_type: string; value: string };

export default function AttributeEditor({
  value,
  onChange,
}: { value: Attribute[]; onChange: (v: Attribute[]) => void }) {
  const add = () => onChange([...value, { trait_type: "", value: "" }]);
  const set = (i: number, patch: Partial<Attribute>) =>
    onChange(value.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  const del = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      {value.map((a, i) => (
        <div key={i} className="grid grid-cols-2 gap-2">
          <input
            className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm"
            placeholder="Trait"
            value={a.trait_type}
            onChange={(e) => set(i, { trait_type: e.target.value })}
          />
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm"
              placeholder="Value"
              value={a.value}
              onChange={(e) => set(i, { value: e.target.value })}
            />
            <button
              type="button"
              onClick={() => del(i)}
              className="rounded-xl border border-neutral-700 px-3 text-sm hover:bg-neutral-900"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="rounded-xl border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-900"
      >
        + Add attribute
      </button>
    </div>
  );
}
