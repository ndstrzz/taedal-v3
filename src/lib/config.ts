// src/lib/config.ts

type WConf = {
  API_BASE?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  DEFAULT_COVER_URL?: string;
  DEFAULT_AVATAR_URL?: string;
  CHAIN_ID?: number | string;
  NFT_ADDRESS?: string;
  NFT_MINT_PRICE_WEI?: string; // optional
  NFT_MINT_PRICE_ETH?: string; // optional (decimal string)
};

// Read from a window-injected config if present (e.g. <script>window.__CONFIG__=...</script>)
const WIN: WConf =
  (typeof window !== "undefined" ? ((window as any).__CONFIG__ as WConf) : undefined) || {};

// Guarded access to Vite/Cra envs (covers SSR/tests too)
const VITE = typeof import.meta !== "undefined" ? ((import.meta as any).env || {}) : {};
const CRA = typeof process !== "undefined" ? ((process as any).env || {}) : {};

const toNum = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const stripTrailingSlash = (s: string) => s.replace(/\/+$/, "");

/** Resolve API base:
 * 1) window.__CONFIG__.API_BASE
 * 2) VITE_API_BASE / REACT_APP_API_BASE
 * 3) default to '/api' so you can add a Vercel rewrite and avoid CORS in prod.
 *    (In local dev, set up a Vite proxy for '/api' -> 'http://localhost:5000')
 */
const RAW_API_BASE =
  WIN.API_BASE ||
  (VITE.VITE_API_BASE as string) ||
  (CRA.REACT_APP_API_BASE as string) ||
  "/api";

export const API_BASE = stripTrailingSlash(RAW_API_BASE);

/** Convenience: build a full API URL from a path segment. */
export const API_URL = (path = "") =>
  `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;

// --- Supabase ---
export const SUPABASE_URL =
  WIN.SUPABASE_URL ||
  (VITE.VITE_SUPABASE_URL as string) ||
  (CRA.REACT_APP_SUPABASE_URL as string) ||
  "";

export const SUPABASE_ANON_KEY =
  WIN.SUPABASE_ANON_KEY ||
  (VITE.VITE_SUPABASE_ANON_KEY as string) ||
  (CRA.REACT_APP_SUPABASE_ANON_KEY as string) ||
  "";

// --- UI defaults ---
export const DEFAULT_COVER_URL =
  WIN.DEFAULT_COVER_URL ||
  (VITE.VITE_DEFAULT_COVER_URL as string) ||
  "/brand/taedal-logo.svg";

export const DEFAULT_AVATAR_URL =
  WIN.DEFAULT_AVATAR_URL ||
  (VITE.VITE_DEFAULT_AVATAR_URL as string) ||
  "/brand/taedal-logo.svg";

// --- Chain / contract config ---
export const CHAIN_ID =
  toNum(WIN.CHAIN_ID) ??
  toNum(VITE.VITE_CHAIN_ID) ??
  toNum(CRA.REACT_APP_CHAIN_ID) ??
  11155111; // sepolia default

export const NFT_ADDRESS = (
  WIN.NFT_ADDRESS ||
  (VITE.VITE_NFT_ADDRESS as string) ||
  (CRA.REACT_APP_NFT_ADDRESS as string) ||
  ""
).trim();

/** Optional mint price. Prefer WEI; ETH is a convenience for UIs. */
export const NFT_MINT_PRICE_WEI =
  (WIN.NFT_MINT_PRICE_WEI as string) ||
  (VITE.VITE_NFT_MINT_PRICE_WEI as string) ||
  (CRA.REACT_APP_NFT_MINT_PRICE_WEI as string) ||
  "";

export const NFT_MINT_PRICE_ETH =
  (WIN.NFT_MINT_PRICE_ETH as string) ||
  (VITE.VITE_NFT_MINT_PRICE_ETH as string) ||
  (CRA.REACT_APP_NFT_MINT_PRICE_ETH as string) ||
  "";
