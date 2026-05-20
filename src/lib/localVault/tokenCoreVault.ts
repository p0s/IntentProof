import { createTokenCoreWallet, importTokenCoreWallet } from "../tokencore";
import type { StoredTokenCoreWallet } from "../types";
import {
  type LocalTokenCoreVaultRecord,
  type LocalTokenCoreVaultSession,
  type LocalVaultCreateOptions,
  type LocalVaultUnlockOptions,
  vaultRecordToStoredWallet,
} from "./types";

export function createVaultRecordFromStoredWallet(params: {
  wallet: StoredTokenCoreWallet;
  chainKey: LocalTokenCoreVaultRecord["chainKey"];
  unlockMode: LocalTokenCoreVaultRecord["unlockMode"];
}): LocalTokenCoreVaultRecord {
  const now = new Date().toISOString();
  return {
    id: params.wallet.id,
    name: params.wallet.name,
    address: params.wallet.address,
    chainKey: params.chainKey,
    chainId: params.wallet.chainId,
    unlockMode: params.unlockMode,
    keystoreJson: params.wallet.keystoreJson,
    publicKey: params.wallet.publicKey,
    derivationPath: params.wallet.derivationPath,
    createdAt: params.wallet.createdAt,
    updatedAt: now,
  };
}

export async function createLocalTokenCoreVault({
  name,
  password,
  chainKey,
  unlockMode,
}: LocalVaultCreateOptions): Promise<LocalTokenCoreVaultSession> {
  if (!password.trim()) throw new Error("Enter a local vault password.");
  const result = await createTokenCoreWallet({ name, password, chainKey });
  const record = createVaultRecordFromStoredWallet({
    wallet: result.wallet,
    chainKey,
    unlockMode,
  });
  return {
    record,
    wallet: result.wallet,
    unlockMode,
  };
}

export async function unlockLocalTokenCoreVault({
  record,
  password,
  chainKey,
}: LocalVaultUnlockOptions): Promise<LocalTokenCoreVaultSession> {
  if (!password.trim()) throw new Error("Enter the local vault password.");
  const wallet = await importTokenCoreWallet({
    name: record.name,
    password,
    chainKey: chainKey ?? record.chainKey,
    keystoreJson: record.keystoreJson,
    derivationPath: record.derivationPath,
  });
  return {
    record,
    wallet: {
      ...vaultRecordToStoredWallet(record),
      address: wallet.address,
      publicKey: wallet.publicKey,
      chainId: wallet.chainId,
    },
    unlockMode: record.unlockMode,
  };
}
