import { getChainConfig } from "../chains";
import type { LiveRequest } from "./types";

export const READ_ONLY_LIVE_RPC_METHODS = new Set([
  "eth_call",
  "eth_estimateGas",
  "eth_getBalance",
  "eth_getCode",
  "eth_getTransactionCount",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_getBlockTransactionCountByNumber",
  "eth_getBlockTransactionCountByHash",
  "eth_getLogs",
  "eth_getProof",
  "eth_getStorageAt",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_blockNumber",
  "eth_gasPrice",
  "eth_feeHistory",
  "eth_maxPriorityFeePerGas",
  "eth_syncing",
  "net_version",
  "net_listening",
  "net_peerCount",
  "web3_clientVersion",
]);

export function isReadOnlyLiveRpcMethod(method: string) {
  return READ_ONLY_LIVE_RPC_METHODS.has(method);
}

export async function proxyReadOnlyLiveRpcRequest(request: LiveRequest) {
  if (!isReadOnlyLiveRpcMethod(request.method)) {
    throw new Error(`${request.method} is not a read-only RPC method.`);
  }

  const rpcUrl = getChainConfig(request.chain.chainKey).rpcUrl;
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: request.method,
      params: Array.isArray(request.request.params) ? request.request.params : [],
    }),
  });

  if (!response.ok) {
    throw new Error(
      `${request.method} failed on ${request.chain.label}: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as {
    result?: unknown;
    error?: { message?: string };
  };
  if (payload.error) {
    throw new Error(
      payload.error.message ??
        `${request.method} failed on ${request.chain.label}.`,
    );
  }
  return payload.result;
}
