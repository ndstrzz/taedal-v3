// src/sentry.ts
import * as Sentry from "@sentry/browser";

/**
 * Safe Sentry bootstrapping for Vite apps.
 * - Works in dev and prod
 * - Works even if DSN is undefined
 * - Avoids SSR/`window` issues
 */
export function initSentry() {
  // Prefer Vite env, fall back to the global config you already inject
  // (window.__CONFIG__.*). The cast keeps TS happy without extra deps.
  const dsn =
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SENTRY_DSN ||
    (globalThis as any)?.__CONFIG__?.SENTRY_DSN;

  if (!dsn) return; // no DSN → don't init

  Sentry.init({
    dsn,
    tracesSampleRate: 0.2,
    integrations: [Sentry.browserTracingIntegration()],
  });
}
