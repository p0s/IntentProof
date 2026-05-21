import { formatUnits, type Address } from "viem";

import { getChainConfig } from "../../chains";
import type { LiveRequest } from "../../live/types";
import type { DemoChainKey } from "../../types";

export const MAX_UINT256_DECIMAL =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";
export const MAX_UINT256_HEX =
  "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

export function selector(data?: string) {
  if (!data || data === "0x" || data.length < 10) return undefined;
  return data.slice(0, 10).toLowerCase();
}

export function shortAddress(address?: string) {
  if (!address) return "n/a";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function tokenInfo(chainKey: DemoChainKey, address?: string) {
  if (!address) return undefined;
  const lower = address.toLowerCase();
  const chain = getChainConfig(chainKey);
  if (chain.wrappedNativeToken.address.toLowerCase() === lower) {
    return chain.wrappedNativeToken;
  }
  return chain.tokenPresets.find((token) => token.address.toLowerCase() === lower);
}

export function tokenLabel(chainKey: DemoChainKey, address?: string) {
  return tokenInfo(chainKey, address)?.symbol ?? shortAddress(address);
}

function trimDecimal(value: string) {
  return value.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

function formatDecimalForMainUi(value: bigint, decimals: number, maxFractionDigits: number) {
  const exact = formatUnits(value, decimals);
  if (!exact.includes(".")) return exact;
  const [whole, fraction = ""] = exact.split(".");
  if (BigInt(whole) !== 0n) {
    return trimDecimal(`${whole}.${fraction.slice(0, maxFractionDigits)}`);
  }
  const limited = fraction.slice(0, maxFractionDigits);
  const formatted = trimDecimal(`${whole}.${limited}`);
  return formatted === "0" && value > 0n
    ? `<0.${"0".repeat(Math.max(0, maxFractionDigits - 1))}1`
    : formatted;
}

export function formatTokenAmount(
  chainKey: DemoChainKey,
  address: string | undefined,
  amount?: bigint,
) {
  if (amount === undefined) return undefined;
  const token = tokenInfo(chainKey, address);
  if (!token) return `${amount.toString()} encoded token amount`;
  const maxFractionDigits =
    token.symbol === "USDC" || token.symbol === "USDT" ? 6 : Math.min(token.decimals, 6);
  return `${formatDecimalForMainUi(amount, token.decimals, maxFractionDigits)} ${token.symbol}`;
}

export function formatTokenAmountExact(
  chainKey: DemoChainKey,
  address: string | undefined,
  amount?: bigint,
) {
  if (amount === undefined) return undefined;
  const token = tokenInfo(chainKey, address);
  if (!token) return `${amount.toString()} encoded token amount`;
  return `${formatUnits(amount, token.decimals)} ${token.symbol}`;
}

export function formatNativeValue(request: LiveRequest) {
  if (!request.tx?.value || request.tx.value === "0x") return undefined;
  try {
    const value = BigInt(request.tx.value);
    if (value === 0n) return undefined;
    return `${formatDecimalForMainUi(value, 18, 6)} ${getChainConfig(request.chain.chainKey).nativeSymbol}`;
  } catch {
    return request.tx.value;
  }
}

export function formatNativeValueExact(request: LiveRequest) {
  if (!request.tx?.value || request.tx.value === "0x") return undefined;
  try {
    const value = BigInt(request.tx.value);
    if (value === 0n) return undefined;
    return `${formatUnits(value, 18)} ${getChainConfig(request.chain.chainKey).nativeSymbol}`;
  } catch {
    return request.tx.value;
  }
}

export function nativeValueWei(request: LiveRequest) {
  if (!request.tx?.value || request.tx.value === "0x") return undefined;
  try {
    const value = BigInt(request.tx.value);
    return value === 0n ? undefined : value.toString();
  } catch {
    return undefined;
  }
}

export function decodeWordAddress(data: string, index: number) {
  const normalized = data.toLowerCase().replace(/^0x/, "");
  const word = normalized.slice(8 + index * 64, 8 + (index + 1) * 64);
  if (word.length !== 64) return undefined;
  return `0x${word.slice(24)}` as Address;
}

export function decodeWordUint(data: string, index: number) {
  const normalized = data.toLowerCase().replace(/^0x/, "");
  const word = normalized.slice(8 + index * 64, 8 + (index + 1) * 64);
  if (word.length !== 64) return undefined;
  try {
    return BigInt(`0x${word}`);
  } catch {
    return undefined;
  }
}
