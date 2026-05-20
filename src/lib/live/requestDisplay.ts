import type { LiveRequest } from "./types";

const SELECTOR_LABELS: Record<string, string> = {
  "0x095ea7b3": "Token approval",
  "0xa9059cbb": "Token transfer",
  "0xd0e30db0": "WETH wrap",
  "0x24856bc3": "Swap transaction",
  "0x3593564c": "Swap transaction",
};

function selector(data?: string) {
  if (!data || data === "0x" || data.length < 10) return undefined;
  return data.slice(0, 10).toLowerCase();
}

export function describeLiveRequestAction(request: LiveRequest) {
  if (request.method === "eth_sendTransaction") {
    return SELECTOR_LABELS[selector(request.tx?.data) ?? ""] ?? "Transaction request";
  }
  if (request.method === "wallet_getCapabilities") return "Wallet capability check";
  if (request.method === "wallet_switchEthereumChain") return "Network switch request";
  if (request.method === "eth_requestAccounts") return "Account request";
  if (request.method === "eth_accounts") return "Account request";
  if (request.method === "eth_chainId") return "Chain ID request";
  if (request.method === "eth_call") return "Read-only contract call";
  if (request.method === "eth_estimateGas") return "Gas estimate";
  if (request.method === "eth_getBalance") return "Balance check";
  if (request.method === "eth_getCode") return "Contract code check";
  if (request.method === "eth_getTransactionCount") return "Nonce check";
  if (request.method === "eth_getBlockByNumber") return "Block data check";
  if (request.method === "eth_blockNumber") return "Block number check";
  if (request.method === "eth_gasPrice") return "Gas price check";
  if (request.method === "eth_feeHistory") return "Fee history check";
  if (request.method === "eth_maxPriorityFeePerGas") return "Priority fee check";
  if (request.method === "net_version") return "Network version check";
  if (request.method === "personal_sign") return "Message signature";
  if (request.method === "eth_signTypedData_v4") return "Typed-data signature";
  return request.method;
}

export function describeLiveRequestMethod(request: LiveRequest) {
  const action = describeLiveRequestAction(request);
  return action === request.method ? request.method : `${action} (${request.method})`;
}
