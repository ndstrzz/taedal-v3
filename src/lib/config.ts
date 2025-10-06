// src/lib/config.ts
type WConf = {
  API_BASE?: string
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  DEFAULT_COVER_URL?: string
  DEFAULT_AVATAR_URL?: string
  CHAIN_ID?: number | string
  NFT_ADDRESS?: string
}

const WIN: WConf =
  (typeof window !== 'undefined' ? ((window as any).__CONFIG__ as WConf) : undefined) || {}

const VITE = typeof import.meta !== 'undefined' ? (import.meta as any).env || {} : {}
const CRA  = typeof process !== 'undefined' ? (process as any).env || {} : {}

const toNum = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

export const API_BASE =
  WIN.API_BASE ||
  (VITE.VITE_API_BASE as string) ||
  (CRA.REACT_APP_API_BASE as string) ||
  'http://localhost:5000'

export const SUPABASE_URL =
  WIN.SUPABASE_URL ||
  (VITE.VITE_SUPABASE_URL as string) ||
  (CRA.REACT_APP_SUPABASE_URL as string) ||
  ''

export const SUPABASE_ANON_KEY =
  WIN.SUPABASE_ANON_KEY ||
  (VITE.VITE_SUPABASE_ANON_KEY as string) ||
  (CRA.REACT_APP_SUPABASE_ANON_KEY as string) ||
  ''

export const DEFAULT_COVER_URL =
  WIN.DEFAULT_COVER_URL ||
  (VITE.VITE_DEFAULT_COVER_URL as string) ||
  '/brand/taedal-logo.svg'

export const DEFAULT_AVATAR_URL =
  WIN.DEFAULT_AVATAR_URL ||
  (VITE.VITE_DEFAULT_AVATAR_URL as string) ||
  '/brand/taedal-logo.svg'

export const CHAIN_ID =
  toNum(WIN.CHAIN_ID) ??
  toNum(VITE.VITE_CHAIN_ID) ??
  toNum(CRA.REACT_APP_CHAIN_ID) ??
  11155111 // default: Sepolia

export const NFT_ADDRESS = (
  WIN.NFT_ADDRESS ||
  (VITE.VITE_NFT_ADDRESS as string) ||
  (CRA.REACT_APP_NFT_ADDRESS as string) ||
  ''
).trim()
