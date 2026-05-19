import type { Abi, Address } from "viem";

import { keystoneAbiRegistry } from "../generated/keystoneAbiRegistry";

type RegistryChain = keyof typeof keystoneAbiRegistry;

export interface KeystoneAbiRegistryEntry {
  contractName: string;
  chainId: number;
  address: Lowercase<Address>;
  abi: Abi;
  docs?: {
    userdoc?: unknown;
    devdoc?: unknown;
  };
  proxy?: {
    isProxy: boolean;
    principalAddress?: Lowercase<Address>;
  };
}

export function lookupKeystoneAbiRegistry(
  chainId: number,
  address?: Address,
): KeystoneAbiRegistryEntry | undefined {
  if (!address) return undefined;
  const chain = keystoneAbiRegistry[String(chainId) as RegistryChain];
  if (!chain) return undefined;
  const entry = chain[address.toLowerCase() as keyof typeof chain];
  if (!entry) return undefined;
  return {
    contractName: entry.contractName,
    chainId: entry.chainId,
    address: entry.address as Lowercase<Address>,
    abi: entry.abi as Abi,
    docs: ("docs" in entry ? entry.docs : undefined) as
      | KeystoneAbiRegistryEntry["docs"]
      | undefined,
    proxy: entry.proxy as KeystoneAbiRegistryEntry["proxy"],
  };
}
