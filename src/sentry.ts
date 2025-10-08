// src/sentry.ts
import * as Sentry from "@sentry/react";

/**
 * Initialize Sentry in the browser (no-op if DSN is not provided).
 * DSN resolution order:
 *   1) Vite env: import.meta.env.VITE_SENTRY_DSN
 *   2) window.__CONFIG__?.SENTRY_DSN (from index.html)
 */
export function initSentry() {
  // Read from Vite env
  const envDsn =
    (import.meta as unknown as { env?: Record<string, string> }).env
      ?.VITE_SENTRY_DSN;

  // Or from window.__CONFIG__ (if you prefer shipping via index.html)
  const winDsn =
    (globalThis as any)?.__CONFIG__?.SENTRY_DSN ||
    (window as any)?.__CONFIG__?.SENTRY_DSN;

  const dsn = envDsn || winDsn;

  if (!dsn) return; // no-op if not configured

  Sentry.init({
    dsn,
    tracesSampleRate: 0.2,
    integrations: [Sentry.browserTracingIntegration()],
  });
}
