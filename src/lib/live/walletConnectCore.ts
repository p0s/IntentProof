type CoreModule = typeof import("@walletconnect/core");
type WalletConnectCore = InstanceType<CoreModule["Core"]>;

const coreByStoragePrefix: Record<string, Promise<WalletConnectCore>> = {};

export function getIntentProofWalletConnectCore(projectId: string) {
  const customStoragePrefix = getWalletConnectStoragePrefix(projectId);
  coreByStoragePrefix[customStoragePrefix] ??= import("@walletconnect/core").then(({ Core }) => {
    return new Core({
      projectId,
      customStoragePrefix,
    });
  });
  return coreByStoragePrefix[customStoragePrefix];
}

export function getWalletConnectStoragePrefix(projectId: string) {
  return `intentproof-live-v2-${hashWalletConnectProjectId(projectId)}`;
}

export function hashWalletConnectProjectId(projectId: string) {
  const normalized = projectId.trim();
  if (!normalized) return "missing";

  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
