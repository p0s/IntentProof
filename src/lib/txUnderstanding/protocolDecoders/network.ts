import { getChainConfig, getChainKeyById } from "../../chains";
import { isReadOnlyLiveRpcMethod } from "../../live/rpcProxy";
import type { LiveRequest } from "../../live/types";
import type { TransactionUnderstanding } from "../types";

function paramsFirstRecord(params: unknown) {
  const first = Array.isArray(params) ? params[0] : undefined;
  return typeof first === "object" && first !== null
    ? (first as Record<string, string>)
    : undefined;
}

function chainKeyFromChainId(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    return getChainKeyById(Number.parseInt(value, 16));
  } catch {
    return undefined;
  }
}

export function decodeNetworkOrCoordinationRequest(
  request: LiveRequest,
): TransactionUnderstanding | undefined {
  if (
    request.method === "wallet_getCapabilities" ||
    request.method === "eth_accounts" ||
    request.method === "eth_requestAccounts" ||
    request.method === "eth_chainId" ||
    isReadOnlyLiveRpcMethod(request.method)
  ) {
    const actionTitle =
      request.method === "wallet_getCapabilities"
        ? "Wallet capability check"
        : request.method === "eth_accounts" || request.method === "eth_requestAccounts"
          ? "Account request"
          : request.method === "eth_chainId"
            ? "Chain ID request"
            : request.method === "eth_estimateGas"
              ? "Gas estimate"
              : "Read-only chain check";
    return {
      protocolName: request.origin,
      protocolConfidence: "probable",
      actionKind: "coordination",
      actionTitle,
      userSummary:
        request.method === "eth_estimateGas"
          ? "Estimates whether a prepared transaction can execute and what gas it may require."
          : "Coordinates wallet state for the DApp without requesting a signature or transaction.",
      decodeQuality: "full-protocol-decode",
      assetAuthorityKind: "none",
      riskLevel: "routine",
      riskReasons: ["No signature, approval, transfer, or transaction is requested."],
      userChecks: ["This is routine wallet coordination."],
      simulationStatus: "not-applicable",
      evidence: ["Routine wallet coordination method recognized."],
      advanced: { method: request.method },
    };
  }

  if (request.method !== "wallet_switchEthereumChain") return undefined;
  const params = paramsFirstRecord(request.params);
  const targetChain = chainKeyFromChainId(params?.chainId) ?? request.chain.chainKey;
  const target = getChainConfig(targetChain);

  return {
    protocolName: request.origin,
    protocolConfidence: "probable",
    actionKind: "network-switch",
    actionTitle: `Switch to ${target.label}`,
    userSummary: `Requests switching the connected wallet to ${target.label}.`,
    decodeQuality: "full-protocol-decode",
    assetAuthorityKind: "none",
    riskLevel: target.environment === "mainnet" ? "needs-review" : "routine",
    riskReasons: [
      target.environment === "mainnet"
        ? "Network switch moves the wallet to a real-asset chain."
        : "Network switch stays on a configured testnet or supported chain.",
      "No transaction or message signature is requested.",
    ],
    userChecks: [
      target.environment === "mainnet"
        ? "Confirm you intended to use a mainnet network."
        : "Confirm this is the intended network.",
    ],
    simulationStatus: "not-applicable",
    evidence: [`Wallet network switch target recognized: ${target.label}.`],
    advanced: { requestedChainId: params?.chainId, targetChain },
  };
}
