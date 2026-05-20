import type { Address, Hex } from "viem";

import type { DemoChainKey } from "../types";

export type LiveCaip2ChainId =
  | "eip155:1"
  | "eip155:8453"
  | "eip155:11155111"
  | "eip155:84532";

export type LiveSupportedMethod =
  | "eth_sendTransaction"
  | "personal_sign"
  | "eth_signTypedData_v4"
  | "wallet_switchEthereumChain"
  | "wallet_getCapabilities"
  | "eth_requestAccounts"
  | "eth_accounts"
  | "eth_chainId"
  | "eth_call"
  | "eth_estimateGas"
  | "eth_getBalance"
  | "eth_getCode"
  | "eth_getTransactionCount"
  | "eth_getBlockByNumber"
  | "eth_blockNumber"
  | "eth_gasPrice"
  | "eth_feeHistory"
  | "eth_maxPriorityFeePerGas"
  | "net_version";

export type LiveUnsafeMethod =
  | "eth_sign"
  | "eth_signTypedData"
  | "eth_signTransaction"
  | "eth_sendRawTransaction"
  | "wallet_addEthereumChain"
  | "wallet_watchAsset"
  | "wallet_sendCalls";

export type LiveMethod = LiveSupportedMethod | LiveUnsafeMethod | string;

export interface LiveChainConfig {
  caip2: LiveCaip2ChainId;
  chainKey: DemoChainKey;
  chainId: number;
  hexChainId: Hex;
  label: string;
  environment: "testnet" | "mainnet";
}

export interface LiveSessionAccount {
  address: Address;
  chains: LiveCaip2ChainId[];
}

export interface LiveDappSession {
  id: string;
  name: string;
  url?: string;
  icon?: string;
  chains: LiveCaip2ChainId[];
  methods: string[];
}

export interface LiveConnectorState {
  status: "setup-required" | "idle" | "pairing" | "connected" | "error";
  label: string;
  detail: string;
  pairingUri?: string;
  account?: LiveSessionAccount;
  sessions?: LiveDappSession[];
}

export interface LiveTransactionRequest {
  from?: Address;
  to?: Address;
  data?: Hex;
  value?: Hex;
  gas?: Hex;
  gasPrice?: Hex;
  maxFeePerGas?: Hex;
  maxPriorityFeePerGas?: Hex;
  nonce?: Hex;
  chainId?: Hex;
}

export interface LiveRequest {
  id: string;
  topic?: string;
  origin: string;
  method: LiveMethod;
  params: unknown;
  chain: LiveChainConfig;
  receivedAt: string;
  request: {
    id?: number | string;
    jsonrpc?: "2.0";
    method: LiveMethod;
    params?: unknown;
  };
  tx?: LiveTransactionRequest;
  signatureAddress?: Address;
  typedData?: unknown;
  message?: string;
  unsupportedReason?: string;
  unsupportedChainId?: string;
  evidence?: LiveRequestEvidence;
}

export interface LiveDecisionIssue {
  severity: "info" | "warn" | "block";
  title: string;
  description: string;
}

export interface LiveDecodeEvidence {
  status: "decoded" | "selector" | "unknown" | "not-applicable" | "unavailable";
  source: "verified" | "registry" | "common" | "selector" | "native" | "none";
  summary: string;
  functionName?: string;
  functionSignature?: string;
  contractVerified?: boolean;
  contractSource?: string;
  errorMessage?: string;
}

export interface LiveAssetChangeEvidence {
  assetType: string;
  changeType: string;
  symbol?: string;
  amount?: string;
  rawAmount?: string;
  from?: Address;
  to?: Address;
  contractAddress?: Address;
}

export interface LiveSimulationEvidence {
  status: "pending" | "success" | "revert" | "unavailable" | "not-applicable";
  provider: "tenderly" | "alchemy" | "rpc" | "none";
  summary: string;
  gasEstimate?: string;
  resultPreview?: string;
  errorMessage?: string;
  simulationUrl?: string;
  publicSimulationUrl?: string;
  assetChanges: LiveAssetChangeEvidence[];
}

export interface LiveRequestEvidence {
  updatedAt: string;
  decode: LiveDecodeEvidence;
  simulation: LiveSimulationEvidence;
}

export interface LivePolicyDecision {
  severity: "pass" | "info" | "warn" | "block";
  label: "PASS" | "INFO" | "WARN" | "BLOCK";
  summary: string;
  score: {
    value: number;
    confidence: "high" | "medium" | "low";
    summary: string;
    reasons: string[];
  };
  canForward: boolean;
  requiresAcknowledgement: boolean;
  issues: LiveDecisionIssue[];
}

export interface LiveReceipt {
  id: string;
  requestId: string;
  timestamp: string;
  origin: string;
  method: LiveMethod;
  chainLabel: string;
  decision: LivePolicyDecision["label"];
  forwarded: boolean;
  rejected: boolean;
  resolvedLocally?: boolean;
  resultPreview?: string;
}

export interface LiveClientPairResult {
  ok: boolean;
  state: LiveConnectorState;
}

export interface LiveInboundClient {
  connectDapp(uri: string, account: LiveSessionAccount): Promise<LiveClientPairResult>;
  restoreSession?(account: LiveSessionAccount): Promise<LiveClientPairResult>;
  updateActiveChain?(account: LiveSessionAccount, chainKey: DemoChainKey): Promise<void>;
  approveRequest(request: LiveRequest, result: unknown): Promise<void>;
  rejectRequest(request: LiveRequest, reason: string): Promise<void>;
}

export interface LiveSignerClient {
  connectImToken(): Promise<LiveClientPairResult>;
  restoreSession?(): Promise<LiveClientPairResult>;
  forward(request: LiveRequest): Promise<unknown>;
  switchChain?(chainKey: DemoChainKey): Promise<LiveClientPairResult>;
  disconnect?(): Promise<void>;
}
