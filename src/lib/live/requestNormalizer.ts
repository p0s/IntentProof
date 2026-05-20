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
    gasPrice: asHex(value.gasPrice),
    maxFeePerGas: asHex(value.maxFeePerGas),
    maxPriorityFeePerGas: asHex(value.maxPriorityFeePerGas),
    nonce: asHex(value.nonce),
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

const SUPPORTED_LIVE_METHODS = new Set([
  "eth_sendTransaction",
  "personal_sign",
  "eth_signTypedData_v4",
  "wallet_switchEthereumChain",
  "wallet_getCapabilities",
  "eth_requestAccounts",
  "eth_accounts",
  "eth_chainId",
]);

function getUnsupportedMethodReason(method: string) {
  if (
    method === "eth_sign" ||
    method === "eth_signTransaction" ||
    method === "eth_sendRawTransaction"
  ) {
    return `${method} bypasses readable transaction review.`;
  }
  if (method === "eth_signTypedData") {
    return "eth_signTypedData is ambiguous; IntentProof only reviews eth_signTypedData_v4 payloads.";
  }
  if (method === "wallet_sendCalls") {
    return "wallet_sendCalls can contain a batch of calls that IntentProof does not decode yet.";
  }
  if (method === "wallet_addEthereumChain" || method === "wallet_watchAsset") {
    return `${method} is a wallet management request that IntentProof does not mediate yet.`;
  }
  if (!SUPPORTED_LIVE_METHODS.has(method)) {
    return `${method} is not supported by IntentProof review yet.`;
  }
  return undefined;
}

function extractSignatureAddress(method: string, params: unknown): Address | undefined {
  if (
    method !== "personal_sign" &&
    method !== "eth_sign" &&
    method !== "eth_signTypedData_v4"
  ) {
    return undefined;
  }
  if (!Array.isArray(params)) return undefined;
  return params.map(asAddress).find(Boolean);
}

function extractPersonalSignMessage(params: unknown) {
  if (!Array.isArray(params)) return undefined;
  const [first, second] = params;
  if (asAddress(first) && typeof second === "string") return second;
  return typeof first === "string" ? first : undefined;
}

function extractTypedData(params: unknown) {
  if (!Array.isArray(params)) return undefined;
  const [first, second] = params;
  if (asAddress(first)) return second;
  if (asAddress(second)) return first;
  return second ?? first;
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
    getUnsupportedMethodReason(params.method),
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
    signatureAddress: extractSignatureAddress(params.method, rawParams),
    message:
      (params.method === "personal_sign" || params.method === "eth_sign") &&
      Array.isArray(rawParams)
        ? extractPersonalSignMessage(rawParams)
        : undefined,
    typedData:
      params.method === "eth_signTypedData_v4" &&
      Array.isArray(rawParams)
        ? extractTypedData(rawParams)
        : undefined,
  };
}
