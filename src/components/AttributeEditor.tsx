import React from "react";

export type Attribute = {
  trait_type: string;
  value: string | number;
};

type Props = {
  value: Attribute[];
  onChange: (_next: Attribute[]) => void;
};

export default function AttributeEditor({ value, onChange }: Props) {
  const add = () => onChange([...(value || []), { trait_type: "", value: "" }]);
  const update = (i: number, patch: Partial<Attribute>) =>
    onChange(
      value.map((row, idx) => (idx === i ? { ...row, ...patch } : row))
    );
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      {(value || []).map((attr, i) => (
        <div
          key={i}
          className="flex gap-2 rounded-xl border border-neutral-800 bg-neutral-900 p-2"
        >
          <input
            className="w-40 rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-sm"
            placeholder="Trait"
            value={attr.trait_type}
            onChange={(e) => update(i, { trait_type: e.target.value })}
          />
          <input
            className="flex-1 rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1 text-sm"
            placeholder="Value"
            value={String(attr.value ?? "")}
            onChange={(e) => update(i, { value: e.target.value })}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="rounded-lg border border-neutral-700 px-2 text-sm hover:bg-neutral-800"
            aria-label="Remove attribute"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-900"
      >
        Add attribute
      </button>
    </div>
  );
}
