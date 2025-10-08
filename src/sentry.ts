// src/sentry.ts
import * as Sentry from "@sentry/browser";

export function initSentry() {
  const dsn =
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SENTRY_DSN ||
    (globalThis as any)?.__CONFIG__?.SENTRY_DSN;

  if (!dsn) return;

  Sentry.init({
    dsn,
    tracesSampleRate: 0.2,
    integrations: [Sentry.browserTracingIntegration()],
  });
}
