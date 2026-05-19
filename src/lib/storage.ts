import type { StoredTokenCoreWallet } from "./types";

const STORAGE_KEY = "tokencore-cli.tokencore-wallets";

export function loadStoredWallets(): StoredTokenCoreWallet[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StoredTokenCoreWallet[];
  } catch {
    return [];
  }
}

export function saveStoredWallets(wallets: StoredTokenCoreWallet[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(wallets));
}

export function clearStoredWallets() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
