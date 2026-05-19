import type { Address, Hex } from "viem";

import { findLiveChainConfig, getLiveChainConfig } from "./chainConfig";
import type { LiveRequest, LiveTransactionRequest } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asAddress(value: unknown): Address | undefined {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value)
    ? (value as Address)
    : undefined;
}

function asHex(value: unknown): Hex | undefined {
  return typeof value === "string" && /^0x[a-fA-F0-9]*$/.test(value)
    ? (value as Hex)
    : undefined;
}

function normalizeTx(value: unknown): LiveTransactionRequest | undefined {
  if (!isRecord(value)) return undefined;
  return {
    from: asAddress(value.from),
    to: asAddress(value.to),
    data: asHex(value.data),
    value: asHex(value.value),
    gas: asHex(value.gas),
    chainId: asHex(value.chainId),
  };
}

function extractChainId(method: string, params: unknown, tx?: LiveTransactionRequest) {
  if (tx?.chainId) return tx.chainId;
  if (method === "wallet_switchEthereumChain" && Array.isArray(params)) {
    const first = params[0];
    if (isRecord(first) && typeof first.chainId === "string") return first.chainId;
  }
  return undefined;
}

export function normalizeLiveRequest(params: {
  id: string;
  topic?: string;
  origin: string;
  method: string;
  requestId?: number | string;
  params?: unknown;
  chainId?: string | number;
}): LiveRequest {
  const rawParams = params.params;
  const tx =
    params.method === "eth_sendTransaction" && Array.isArray(rawParams)
      ? normalizeTx(rawParams[0])
      : undefined;
  const requestChainId = extractChainId(params.method, rawParams, tx) ?? params.chainId;
  const supportedChain = findLiveChainConfig(requestChainId);
  const chain = supportedChain ?? getLiveChainConfig(undefined);
  const unsupportedChainId =
    requestChainId !== undefined && !supportedChain ? String(requestChainId) : undefined;
  const unsupportedReasons = [
    unsupportedChainId
      ? `Unsupported chain ${unsupportedChainId} is outside IntentProof's WalletConnect allowlist.`
      : undefined,
    params.method === "eth_sign" ||
    params.method === "eth_signTransaction" ||
    params.method === "eth_sendRawTransaction"
      ? `${params.method} bypasses readable transaction review.`
      : undefined,
  ].filter((reason): reason is string => Boolean(reason));

  return {
    id: params.id,
    topic: params.topic,
    origin: params.origin,
    method: params.method,
    params: rawParams,
    chain,
    tx,
    receivedAt: new Date().toISOString(),
    unsupportedReason: unsupportedReasons.length
      ? unsupportedReasons.join(" ")
      : undefined,
    unsupportedChainId,
    request: {
      id: params.requestId,
      jsonrpc: "2.0",
      method: params.method,
      params: rawParams,
    },
    message:
      (params.method === "personal_sign" || params.method === "eth_sign") &&
      Array.isArray(rawParams) &&
      typeof rawParams[0] === "string"
        ? rawParams[0]
        : undefined,
    typedData:
      params.method === "eth_signTypedData_v4" &&
      Array.isArray(rawParams)
        ? rawParams[1]
        : undefined,
  };
}
