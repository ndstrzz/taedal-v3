// src/sentry.ts
import * as Sentry from "@sentry/react";

/**
 * Initialize Sentry once on app boot.
 * Looks for a DSN in either:
 *  - Vite env (VITE_SENTRY_DSN)                    e.g. Vercel Project Env
 *  - window.__CONFIG__.SENTRY_DSN                  e.g. your index.html bootstrap
 */
export function initSentry() {
  // read DSN from env first, then from window.__CONFIG__
  const dsn =
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SENTRY_DSN ||
    (globalThis as any)?.__CONFIG__?.SENTRY_DSN;

  if (!dsn) return; // no DSN, do nothing

  Sentry.init({
    dsn,
    tracesSampleRate: 0.2,
    integrations: [Sentry.browserTracingIntegration()],
  });

  // Optional: expose to window so you can test in the DevTools console
  (window as any).Sentry = Sentry;
}
