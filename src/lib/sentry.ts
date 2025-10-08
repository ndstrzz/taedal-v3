import * as Sentry from "@sentry/browser";

export function initSentry() {
  const dsn = (window as any).__CONFIG__?.SENTRY_DSN || import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    tracesSampleRate: 0.2,
    integrations: [Sentry.browserTracingIntegration()],
  });
}
