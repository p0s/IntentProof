import type { Address } from "viem";

import { getChainConfig } from "../chains";
import type { DemoChainKey } from "../types";
import type { LiveCaip2ChainId, LiveChainConfig } from "./types";

export const LIVE_CHAIN_CONFIGS: Record<LiveCaip2ChainId, LiveChainConfig> = {
  "eip155:1": {
    caip2: "eip155:1",
    chainKey: "ethereum",
    chainId: 1,
    hexChainId: "0x1",
    label: getChainConfig("ethereum").label,
    environment: "mainnet",
  },
  "eip155:8453": {
    caip2: "eip155:8453",
    chainKey: "base",
    chainId: 8453,
    hexChainId: "0x2105",
    label: getChainConfig("base").label,
    environment: "mainnet",
  },
  "eip155:11155111": {
    caip2: "eip155:11155111",
    chainKey: "sepolia",
    chainId: 11155111,
    hexChainId: "0xaa36a7",
    label: getChainConfig("sepolia").label,
    environment: "testnet",
  },
  "eip155:84532": {
    caip2: "eip155:84532",
    chainKey: "baseSepolia",
    chainId: 84532,
    hexChainId: "0x14a34",
    label: getChainConfig("baseSepolia").label,
    environment: "testnet",
  },
};

export const LIVE_CHAIN_ORDER: LiveCaip2ChainId[] = [
  "eip155:1",
  "eip155:8453",
  "eip155:11155111",
  "eip155:84532",
];

function parseLiveChainNumericId(chainId: number | string | undefined) {
  if (chainId === undefined) return undefined;
  if (typeof chainId === "number") {
    return Number.isSafeInteger(chainId) && chainId > 0 ? chainId : undefined;
  }
  const normalized = chainId.trim().replace(/^eip155:/, "");
  if (/^0x[0-9a-fA-F]+$/.test(normalized)) {
    const parsed = Number.parseInt(normalized, 16);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
  }
  if (/^\d+$/.test(normalized)) {
    const parsed = Number.parseInt(normalized, 10);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

export function findLiveChainConfig(chainId: number | string | undefined) {
  const numeric = parseLiveChainNumericId(chainId);
  if (numeric === undefined) return undefined;
  return LIVE_CHAIN_ORDER.map((key) => LIVE_CHAIN_CONFIGS[key]).find(
    (chain) => chain.chainId === numeric,
  );
}

export function getLiveChainConfig(chainId: number | string | undefined) {
  if (chainId === undefined) return LIVE_CHAIN_CONFIGS["eip155:1"];
  return findLiveChainConfig(chainId) ?? LIVE_CHAIN_CONFIGS["eip155:1"];
}

export function getLiveChainByKey(chainKey: DemoChainKey) {
  return LIVE_CHAIN_ORDER.map((key) => LIVE_CHAIN_CONFIGS[key]).find(
    (chain) => chain.chainKey === chainKey,
  );
}

export function buildLiveAccount(address: Address) {
  const chains = getLiveChainOrder();
  return { address, chains };
}

export function getLiveChainOrder() {
  return LIVE_CHAIN_ORDER;
}

export function liveRpcMap() {
  return Object.fromEntries(
    LIVE_CHAIN_ORDER.map((key) => {
      const config = LIVE_CHAIN_CONFIGS[key];
      return [String(config.chainId), getChainConfig(config.chainKey).rpcUrl];
    }),
  );
}
