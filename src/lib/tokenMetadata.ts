import { formatUnits, isAddress } from "viem";

import { getChainConfig } from "./chains";
import type { DemoChainKey } from "./types";

export interface TokenMetadata {
  chainKey: DemoChainKey;
  address: `0x${string}`;
  symbol: string;
  decimals: number;
  name?: string;
  source: "chain-config" | "known-mainnet" | "runtime-erc20" | "unknown";
}

const KNOWN_MAINNET_TOKENS: Partial<
  Record<DemoChainKey, Record<string, Omit<TokenMetadata, "chainKey" | "source">>>
> = {
  ethereum: {
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": {
      address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      symbol: "WETH",
      decimals: 18,
      name: "Wrapped Ether",
    },
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": {
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      symbol: "USDC",
      decimals: 6,
      name: "USD Coin",
    },
    "0xdac17f958d2ee523a2206206994597c13d831ec7": {
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      symbol: "USDT",
      decimals: 6,
      name: "Tether USD",
    },
    "0x6b175474e89094c44da98b954eedeac495271d0f": {
      address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      symbol: "DAI",
      decimals: 18,
      name: "Dai Stablecoin",
    },
    "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": {
      address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      symbol: "WBTC",
      decimals: 8,
      name: "Wrapped Bitcoin",
    },
    "0xae7ab96520de3a18e5e111b5eaab095312d7fe84": {
      address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
      symbol: "stETH",
      decimals: 18,
      name: "Liquid staked Ether 2.0",
    },
    "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0": {
      address: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
      symbol: "wstETH",
      decimals: 18,
      name: "Wrapped liquid staked Ether 2.0",
    },
  },
  base: {
    "0x4200000000000000000000000000000000000006": {
      address: "0x4200000000000000000000000000000000000006",
      symbol: "WETH",
      decimals: 18,
      name: "Wrapped Ether",
    },
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": {
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      symbol: "USDC",
      decimals: 6,
      name: "USD Coin",
    },
    "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22": {
      address: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22",
      symbol: "cbETH",
      decimals: 18,
      name: "Coinbase Wrapped Staked ETH",
    },
    "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42": {
      address: "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42",
      symbol: "EURC",
      decimals: 6,
      name: "EURC",
    },
    "0x50c5725949a6f0c72e6c4a641f24049a917db0cb": {
      address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
      symbol: "DAI",
      decimals: 18,
      name: "Dai Stablecoin",
    },
  },
};

function normalizeAddress(address?: string) {
  if (!address || !isAddress(address)) return undefined;
  return address.toLowerCase();
}

function trimDecimal(value: string) {
  return value.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

function shortAddress(address?: string) {
  if (!address) return "unknown address";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatDecimalForMainUi(
  amount: bigint,
  decimals: number,
  maxSignificantDecimals: number,
) {
  const exact = formatUnits(amount, decimals);
  if (!exact.includes(".")) return exact;
  const [whole, fraction = ""] = exact.split(".");
  const limited = trimDecimal(`${whole}.${fraction.slice(0, maxSignificantDecimals)}`);
  if (limited !== "0" || amount === 0n) return limited;
  return `<0.${"0".repeat(Math.max(0, maxSignificantDecimals - 1))}1`;
}

export function getKnownTokenMetadata(
  chainKey: DemoChainKey,
  address?: string,
): TokenMetadata | undefined {
  const lower = normalizeAddress(address);
  if (!lower) return undefined;

  const chain = getChainConfig(chainKey);
  if (chain.wrappedNativeToken.address.toLowerCase() === lower) {
    return {
      chainKey,
      address: chain.wrappedNativeToken.address,
      symbol: chain.wrappedNativeToken.symbol,
      decimals: chain.wrappedNativeToken.decimals,
      source: "chain-config",
    };
  }

  const preset = chain.tokenPresets.find(
    (token) => token.address.toLowerCase() === lower,
  );
  if (preset) {
    return {
      chainKey,
      address: preset.address,
      symbol: preset.symbol,
      decimals: preset.decimals,
      source: "chain-config",
    };
  }

  const known = KNOWN_MAINNET_TOKENS[chainKey]?.[lower];
  if (known) {
    return {
      ...known,
      chainKey,
      source: "known-mainnet",
    };
  }

  return undefined;
}

const runtimeMetadataCache = new Map<string, TokenMetadata>();

export async function resolveTokenMetadata(
  chainKey: DemoChainKey,
  address: string,
): Promise<TokenMetadata> {
  const known = getKnownTokenMetadata(chainKey, address);
  if (known) return known;

  const lower = normalizeAddress(address);
  const cacheKey = `${chainKey}:${lower ?? address}`;
  const cached = runtimeMetadataCache.get(cacheKey);
  if (cached) return cached;

  const metadata: TokenMetadata = {
    chainKey,
    address: isAddress(address) ? (address as `0x${string}`) : "0x0000000000000000000000000000000000000000",
    symbol: lower ? `unknown token ${shortAddress(address)}` : "unknown token",
    decimals: 0,
    source: "unknown",
  };
  runtimeMetadataCache.set(cacheKey, metadata);
  return metadata;
}

export function formatTokenQuantity(params: {
  amount: bigint;
  metadata?: TokenMetadata;
  maxSignificantDecimals?: number;
  exact?: boolean;
}): string {
  const { amount, metadata, exact } = params;
  if (!metadata || metadata.source === "unknown") {
    return metadata?.symbol ?? `${amount.toString()} raw units`;
  }
  const maxSignificantDecimals =
    params.maxSignificantDecimals ??
    (metadata.symbol === "USDC" || metadata.symbol === "USDT" || metadata.symbol === "EURC"
      ? 6
      : Math.min(metadata.decimals, 6));
  const formatted = exact
    ? trimDecimal(formatUnits(amount, metadata.decimals))
    : formatDecimalForMainUi(amount, metadata.decimals, maxSignificantDecimals);
  return `${formatted} ${metadata.symbol}`;
}
