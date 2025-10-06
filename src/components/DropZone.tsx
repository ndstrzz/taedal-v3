import React, { useCallback, useRef, useState } from "react";

type Props = {
  onSelect: (file: File) => void;
  accept?: string;            // e.g. "image/png,image/jpeg"
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode; // optional: custom inner content
  ariaLabel?: string;
};

export default function DropZone({
  onSelect,
  accept,
  disabled,
  className = "",
  children,
  ariaLabel = "Upload file",
}: Props) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onBrowse = useCallback(() => {
    if (disabled) return;
    inputRef.current?.click();
  }, [disabled]);

  const onInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) onSelect(f);
      // reset so the same file can be re-picked later
      e.currentTarget.value = "";
    },
    [onSelect]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    setDragOver(true);
  }, [disabled]);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const f = e.dataTransfer.files?.[0];
    if (f) onSelect(f);
  }, [disabled, onSelect]);

  return (
    <div
      role="button"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onBrowse();
        }
      }}
      onClick={onBrowse}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={[
        "rounded-2xl border border-dashed transition-all",
        dragOver ? "border-white/70 bg-white/5" : "border-neutral-700",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        className,
      ].join(" ")}
    >
      {/* Hidden input for browsing */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={onInput}
        className="hidden"
        disabled={disabled}
      />
      {children}
    </div>
  );
}
