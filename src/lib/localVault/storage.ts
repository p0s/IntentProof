import type { LocalTokenCoreVaultRecord } from "./types";

const DB_NAME = "intentproof-local-token-core-vault";
const DB_VERSION = 1;
const STORE_NAME = "vaults";

let memoryFallback = new Map<string, LocalTokenCoreVaultRecord>();

function indexedDbAvailable() {
  return typeof indexedDB !== "undefined";
}

function openVaultDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed."));
  });
}

function withVaultStore<T>(
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore) => IDBRequest<T> | Promise<IDBRequest<T>>,
): Promise<T> {
  return openVaultDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        let request: IDBRequest<T>;
        tx.oncomplete = () => db.close();
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error("IndexedDB transaction failed."));
        };
        Promise.resolve(runner(store))
          .then((nextRequest) => {
            request = nextRequest;
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
          })
          .catch((error) => {
            db.close();
            reject(error);
          });
      }),
  );
}

function assertNoPlaintextSecrets(record: LocalTokenCoreVaultRecord) {
  const serialized = JSON.stringify(record).toLowerCase();
  const forbidden = [
    "mnemonic",
    "privatekey",
    "private key",
    "seed phrase",
    "recovery phrase",
  ];
  const hit = forbidden.find((needle) => serialized.includes(needle));
  if (hit) {
    throw new Error(`Local vault record contains forbidden secret marker: ${hit}`);
  }
}

export function isSecretSafeLocalVaultRecord(record: LocalTokenCoreVaultRecord) {
  try {
    assertNoPlaintextSecrets(record);
    return true;
  } catch {
    return false;
  }
}

export async function loadLocalTokenCoreVaults() {
  if (!indexedDbAvailable()) return Array.from(memoryFallback.values());
  return withVaultStore<LocalTokenCoreVaultRecord[]>("readonly", (store) =>
    store.getAll() as IDBRequest<LocalTokenCoreVaultRecord[]>,
  );
}

export async function saveLocalTokenCoreVault(record: LocalTokenCoreVaultRecord) {
  assertNoPlaintextSecrets(record);
  if (!indexedDbAvailable()) {
    memoryFallback.set(record.id, record);
    return;
  }
  await withVaultStore<IDBValidKey>("readwrite", (store) => store.put(record));
}

export async function deleteLocalTokenCoreVault(id: string) {
  if (!indexedDbAvailable()) {
    memoryFallback.delete(id);
    return;
  }
  await withVaultStore<undefined>("readwrite", (store) => store.delete(id));
}

export async function clearLocalTokenCoreVaults() {
  memoryFallback = new Map();
  if (!indexedDbAvailable()) return;
  await withVaultStore<undefined>("readwrite", (store) => store.clear());
}
