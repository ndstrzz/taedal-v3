const KEY = 'signupDraftV1'

export type SignupDraft = {
  displayName?: string
  username?: string
  role?: 'artist' | 'collector' | 'brand'
  invite?: string
}

export function saveDraft(d: SignupDraft) {
  try { localStorage.setItem(KEY, JSON.stringify(d)) } catch {}
}

export function loadDraft(): SignupDraft | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as SignupDraft) : null
  } catch { return null }
}

export function clearDraft() {
  try { localStorage.removeItem(KEY) } catch {}
}
