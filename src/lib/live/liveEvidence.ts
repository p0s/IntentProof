import {
  createPublicClient,
  http,
  type Address,
  type Hex,
} from "viem";

import { getChainConfig } from "../chains";
import {
  NATIVE_TRANSFER_VERIFICATION,
  decodeParsedInput,
  resolveContractVerification,
} from "../decode";
import { getRuntimeEnv } from "../env";
import type { ParsedInput } from "../types";
import type {
  LiveAssetChangeEvidence,
  LiveDecodeEvidence,
  LiveRequest,
  LiveRequestEvidence,
  LiveSimulationEvidence,
} from "./types";

function hexToBigIntValue(value: Hex | undefined) {
  if (!value || value === "0x") return undefined;
  return BigInt(value);
}

function buildParsedInput(request: LiveRequest): ParsedInput {
  return {
    type: "json",
    raw: JSON.stringify(request.request),
    chainId: request.chain.chainId,
    from: request.tx?.from,
    to: request.tx?.to,
    data: request.tx?.data,
    value: hexToBigIntValue(request.tx?.value),
    gas: hexToBigIntValue(request.tx?.gas),
  };
}

function isAddress(value: unknown): value is Address {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function compactError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").slice(0, 240);
}

function classifySimulationError(error: unknown) {
  const message = compactError(error);
  const lower = message.toLowerCase();
  if (
    lower.includes("execution reverted") ||
    lower.includes("reverted") ||
    lower.includes("call exception")
  ) {
    return { status: "revert" as const, message };
  }
  return { status: "unavailable" as const, message };
}

function alchemyRpcUrl(request: LiveRequest) {
  const apiKey = getRuntimeEnv("VITE_ALCHEMY_API_KEY");
  if (!apiKey) return undefined;
  const chain = getChainConfig(request.chain.chainKey);
  return `https://${chain.chainLabelKey}.g.alchemy.com/v2/${apiKey}`;
}

function normalizeAlchemyAssetChanges(value: unknown): LiveAssetChangeEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => ({
    assetType: typeof item.assetType === "string" ? item.assetType : "unknown",
    changeType: typeof item.changeType === "string" ? item.changeType : "unknown",
    symbol: typeof item.symbol === "string" ? item.symbol : undefined,
    amount: typeof item.amount === "string" ? item.amount : undefined,
    rawAmount: typeof item.rawAmount === "string" ? item.rawAmount : undefined,
    from: isAddress(item.from) ? item.from : undefined,
    to: isAddress(item.to) ? item.to : undefined,
    contractAddress: isAddress(item.contractAddress)
      ? item.contractAddress
      : undefined,
  }));
}

interface TenderlyServerSimulationPayload {
  provider?: string;
  status?: string;
  summary?: string;
  gasEstimate?: string;
  resultPreview?: string;
  errorMessage?: string;
  simulationUrl?: string;
  publicSimulationUrl?: string;
  assetChanges?: unknown;
}

function isTenderlySimulationStatus(
  status: string | undefined,
): status is "success" | "revert" {
  return status === "success" || status === "revert";
}

async function simulateWithTenderlyServer(
  request: LiveRequest,
): Promise<LiveSimulationEvidence | undefined> {
  if (!request.tx?.from || !request.tx.to) return undefined;

  const response = await fetch("/api/tenderly-simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chainId: request.chain.chainId,
      from: request.tx.from,
      to: request.tx.to,
      data: request.tx.data ?? "0x",
      value: request.tx.value ?? "0x0",
      gas: request.tx.gas,
    }),
  });
  if (!response.ok) return undefined;

  const payload = (await response.json()) as TenderlyServerSimulationPayload;
  if (
    payload.provider !== "tenderly" ||
    !isTenderlySimulationStatus(payload.status)
  ) {
    return undefined;
  }

  return {
    status: payload.status,
    provider: "tenderly",
    summary:
      payload.summary ??
      (payload.status === "success"
        ? "Tenderly simulation completed."
        : "Tenderly simulation reported a transaction error."),
    gasEstimate: payload.gasEstimate,
    resultPreview: payload.resultPreview,
    errorMessage: payload.errorMessage,
    simulationUrl: payload.simulationUrl,
    publicSimulationUrl: payload.publicSimulationUrl,
    assetChanges: normalizeAlchemyAssetChanges(payload.assetChanges),
  };
}

async function simulateWithAlchemy(
  request: LiveRequest,
): Promise<LiveSimulationEvidence | undefined> {
  const url = alchemyRpcUrl(request);
  if (!url || !request.tx?.to) return undefined;

  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "alchemy_simulateAssetChanges",
    params: [
      {
        from: request.tx.from,
        to: request.tx.to,
        data: request.tx.data ?? "0x",
        value: request.tx.value,
        gas: request.tx.gas,
      },
    ],
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Alchemy simulation HTTP ${response.status}`);
  }
  const payload = (await response.json()) as {
    error?: { message?: string };
    result?: {
      error?: { message?: string } | string | null;
      gasUsed?: string;
      changes?: unknown;
    };
  };

  if (payload.error) throw new Error(payload.error.message ?? "Alchemy error");
  if (payload.result?.error) {
    return {
      status: "revert",
      provider: "alchemy",
      summary: "Alchemy asset-change simulation reported a transaction error.",
      gasEstimate: payload.result.gasUsed,
      errorMessage:
        typeof payload.result.error === "string"
          ? payload.result.error
          : payload.result.error.message,
      assetChanges: [],
    };
  }

  const assetChanges = normalizeAlchemyAssetChanges(payload.result?.changes);
  return {
    status: "success",
    provider: "alchemy",
    summary: assetChanges.length
      ? `Alchemy simulation found ${assetChanges.length} asset change(s).`
      : "Alchemy simulation completed without reported asset changes.",
    gasEstimate: payload.result?.gasUsed,
    assetChanges,
  };
}

async function simulateWithRpc(
  request: LiveRequest,
): Promise<LiveSimulationEvidence> {
  if (!request.tx?.to) {
    return {
      status: "not-applicable",
      provider: "none",
      summary: "No target address is available for simulation.",
      assetChanges: [],
    };
  }

  const chain = getChainConfig(request.chain.chainKey);
  const client = createPublicClient({
    chain: chain.chain,
    transport: http(chain.rpcUrl),
  });

  try {
    const callArgs = {
      account: request.tx.from,
      to: request.tx.to,
      data: request.tx.data,
      value: hexToBigIntValue(request.tx.value),
    };
    const gasEstimate = await client.estimateGas(callArgs);
    const callResult = request.tx.data
      ? await client.call(callArgs)
      : { data: undefined };

    return {
      status: "success",
      provider: "rpc",
      summary: "Standard RPC dry-run did not detect an immediate revert.",
      gasEstimate: gasEstimate.toString(),
      resultPreview: callResult.data && callResult.data !== "0x"
        ? callResult.data
        : undefined,
      assetChanges: [],
    };
  } catch (error) {
    const classified = classifySimulationError(error);
    return {
      status: classified.status,
      provider: "rpc",
      summary:
        classified.status === "revert"
          ? "Standard RPC dry-run indicates the transaction may revert."
          : "Standard RPC dry-run is unavailable for this request.",
      errorMessage: classified.message,
      assetChanges: [],
    };
  }
}

async function buildDecodeEvidence(request: LiveRequest): Promise<LiveDecodeEvidence> {
  if (request.method !== "eth_sendTransaction" || !request.tx) {
    return {
      status: "not-applicable",
      source: "none",
      summary: "No transaction calldata decode is needed for this request.",
    };
  }

  try {
    const parsed = buildParsedInput(request);
    const verification =
      !parsed.data || parsed.data === "0x"
        ? NATIVE_TRANSFER_VERIFICATION
        : await resolveContractVerification(request.chain.chainKey, parsed.to);
    const action = await decodeParsedInput(
      request.chain.chainKey,
      parsed,
      verification,
    );
    const status =
      action.decodeSource === "selector"
        ? "selector"
        : action.decodeSource
          ? "decoded"
          : action.kind === "nativeTransfer"
            ? "decoded"
            : "unknown";
    return {
      status,
      source:
        action.kind === "nativeTransfer"
          ? "native"
          : action.decodeSource ?? "none",
      summary: action.summary,
      functionName: action.functionName,
      functionSignature: action.functionSignature,
      contractVerified: verification.verified,
      contractSource: verification.source,
    };
  } catch (error) {
    return {
      status: "unavailable",
      source: "none",
      summary: "Decode evidence is unavailable for this request.",
      errorMessage: compactError(error),
    };
  }
}

async function buildSimulationEvidence(
  request: LiveRequest,
): Promise<LiveSimulationEvidence> {
  if (request.method !== "eth_sendTransaction" || !request.tx) {
    return {
      status: "not-applicable",
      provider: "none",
      summary: "Simulation is not needed for this request type.",
      assetChanges: [],
    };
  }

  try {
    const tenderly = await simulateWithTenderlyServer(request);
    if (tenderly) return tenderly;
  } catch {
    // Server-side Tenderly simulation is optional. If the API route is absent,
    // unconfigured, or unavailable, fall through to browser-safe providers.
  }

  try {
    const alchemy = await simulateWithAlchemy(request);
    if (alchemy) return alchemy;
  } catch {
    // Alchemy is optional and browser-visible when configured; fall through to
    // open RPC dry-run so live protection still works without paid providers.
  }

  return simulateWithRpc(request);
}

export function pendingLiveRequestEvidence(): LiveRequestEvidence {
  return {
    updatedAt: new Date().toISOString(),
    decode: {
      status: "unavailable",
      source: "none",
      summary: "Decode evidence is pending.",
    },
    simulation: {
      status: "pending",
      provider: "none",
      summary: "Simulation evidence is pending.",
      assetChanges: [],
    },
  };
}

export async function enrichLiveRequestEvidence(
  request: LiveRequest,
): Promise<LiveRequest> {
  const [decode, simulation] = await Promise.all([
    buildDecodeEvidence(request),
    buildSimulationEvidence(request),
  ]);
  return {
    ...request,
    evidence: {
      updatedAt: new Date().toISOString(),
      decode,
      simulation,
    },
  };
}
