import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type Toast = {
  id: string;
  title?: string;
  description?: string;
  variant?: "default" | "success" | "error";
  duration?: number; // ms
};

type Ctx = {
  toast: (t: Omit<Toast, "id">) => string;
  dismiss: (id: string) => void;
};

const ToastCtx = createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<string, any>>({});

  const dismiss = useCallback((id: string) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const toast = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = crypto.randomUUID();
      const duration = t.duration ?? 3500;
      const node: Toast = { id, ...t };
      setToasts((ts) => [node, ...ts]);
      timers.current[id] = setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  const value = useMemo<Ctx>(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
          {toasts.map((t) => {
            const tone =
              t.variant === "success"
                ? "border-green-500/50 bg-green-500/10 text-green-200"
                : t.variant === "error"
                ? "border-red-500/50 bg-red-500/10 text-red-200"
                : "border-neutral-700 bg-neutral-900/90 text-neutral-100";
            return (
              <div
                key={t.id}
                className={`pointer-events-auto overflow-hidden rounded-2xl border px-4 py-3 shadow-lg backdrop-blur ${tone}`}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0">
                    {t.title && <div className="font-medium">{t.title}</div>}
                    {t.description && (
                      <div className="text-sm/5 opacity-90">{t.description}</div>
                    )}
                  </div>
                  <button
                    onClick={() => dismiss(t.id)}
                    className="ml-auto -mr-1 -mt-1 rounded-md px-2 text-sm opacity-70 hover:opacity-100"
                    aria-label="Dismiss"
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
