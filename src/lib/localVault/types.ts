import type { Address } from "viem";

import type { DemoChainKey, StoredTokenCoreWallet } from "../types";

export type VaultUnlockMode =
  | "password"
  | "passkey-prf"
  | "passkey-gated-password";

export interface LocalTokenCoreVaultRecord {
  id: string;
  name: string;
  address: Address;
  chainKey: DemoChainKey;
  chainId: number;
  unlockMode: VaultUnlockMode;
  keystoreJson: string;
  publicKey: string;
  derivationPath: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalTokenCoreVaultSession {
  record: LocalTokenCoreVaultRecord;
  wallet: StoredTokenCoreWallet;
  unlockMode: VaultUnlockMode;
}

export interface LocalVaultCreateOptions {
  name: string;
  password: string;
  chainKey: DemoChainKey;
  unlockMode: VaultUnlockMode;
}

export interface LocalVaultUnlockOptions {
  record: LocalTokenCoreVaultRecord;
  password: string;
  chainKey?: DemoChainKey;
}

export function vaultRecordToStoredWallet(
  record: LocalTokenCoreVaultRecord,
): StoredTokenCoreWallet {
  return {
    id: record.id,
    name: record.name,
    address: record.address,
    keystoreJson: record.keystoreJson,
    publicKey: record.publicKey,
    derivationPath: record.derivationPath,
    chainId: record.chainId,
    createdAt: record.createdAt,
  };
}
