import React from "react";
export default function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 w-6 rounded-full ${i < step ? "bg-white" : "bg-neutral-700"}`}
          aria-hidden
        />
      ))}
    </div>
  );
}
