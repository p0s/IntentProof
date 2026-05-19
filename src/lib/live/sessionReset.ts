const SESSION_KEY_PATTERNS = [
  "walletconnect",
  "wc@",
  "wc:",
  "reown",
  "intentproof-live",
  "intentproof-dapp-inbound",
  "intentproof-imtoken-signer",
];

export async function resetLiveWalletConnectSessions() {
  if (typeof window !== "undefined") {
    clearWebStorage(window.localStorage);
    clearWebStorage(window.sessionStorage);
  }
  await clearIndexedDbSessions();
}

function clearWebStorage(storage: Storage) {
  for (const key of Object.keys(storage)) {
    const normalized = key.toLowerCase();
    if (SESSION_KEY_PATTERNS.some((pattern) => normalized.includes(pattern))) {
      storage.removeItem(key);
    }
  }
}

async function clearIndexedDbSessions() {
  if (typeof indexedDB === "undefined" || !indexedDB.databases) return;
  const databases = await indexedDB.databases();
  await Promise.all(
    databases
      .map((database) => database.name)
      .filter((name): name is string => Boolean(name))
      .filter((name) => {
        const normalized = name.toLowerCase();
        return SESSION_KEY_PATTERNS.some((pattern) => normalized.includes(pattern));
      })
      .map((name) => deleteDatabase(name)),
  );
}

function deleteDatabase(name: string) {
  return new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}
