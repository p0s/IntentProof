import { isMainnetChainKey } from "../chains";
import {
  getKnownProtocolContractLabel,
  getProtocolSourceLabel,
  isKnownProtocolRequest,
} from "./protocolProfiles";
import { isReadOnlyLiveRpcMethod } from "./rpcProxy";
import type { LivePolicyDecision, LiveRequest } from "./types";

export type EvidenceConfidence = "high" | "medium" | "low";
export type RequestRiskLevel =
  | "routine"
  | "standard"
  | "needs-review"
  | "high-impact"
  | "blocked";

export interface LiveRequestAssessment {
  evidenceConfidence: EvidenceConfidence;
  evidenceScore: number;
  evidenceReasons: string[];

  riskLevel: RequestRiskLevel;
  riskReasons: string[];

  executionStatus:
    | "not-applicable"
    | "success"
    | "revert"
    | "unavailable"
    | "pending";

  sourceLabel: string;
  sourceConfidence: EvidenceConfidence;
  userActionLabel: string;
}

const COORDINATION_METHODS = new Set([
  "wallet_getCapabilities",
  "eth_requestAccounts",
  "eth_accounts",
  "eth_chainId",
]);

const SIGNATURE_METHODS = new Set(["personal_sign", "eth_signTypedData_v4"]);
const HIGH_EVIDENCE_SELECTORS = new Set([
  "0x095ea7b3",
  "0xa9059cbb",
  "0xa1903eab",
  "0xd0e30db0",
]);

function calldataSelector(request: LiveRequest) {
  const data = request.tx?.data?.toLowerCase();
  if (!data || data === "0x" || data.length < 10) return undefined;
  return data.slice(0, 10);
}

function issueTitleSet(decision: LivePolicyDecision) {
  return new Set(decision.issues.map((issue) => issue.title));
}

function issueText(decision: LivePolicyDecision) {
  return decision.issues.map((issue) => `${issue.title}: ${issue.description}`);
}

export function isRoutineWalletCoordinationRequest(request: LiveRequest) {
  return COORDINATION_METHODS.has(request.method) || isReadOnlyLiveRpcMethod(request.method);
}

function evidenceFromRequest(request: LiveRequest, decision: LivePolicyDecision) {
  const reasons: string[] = [];
  const knownContract = getKnownProtocolContractLabel(request);
  const knownProtocol = isKnownProtocolRequest(request);
  const decode = request.evidence?.decode;
  const titles = issueTitleSet(decision);
  let confidence: EvidenceConfidence = "medium";

  if (isRoutineWalletCoordinationRequest(request)) {
    confidence = "high";
    reasons.push("Routine wallet coordination method recognized.");
  }

  if (knownProtocol) {
    reasons.push("Known DApp or recognized protocol profile.");
  }
  if (knownContract) {
    reasons.push(`Known contract: ${knownContract.label}.`);
  }

  if (decode?.status === "decoded") {
    reasons.push(`Decoded request via ${decode.source}.`);
    confidence = knownProtocol || knownContract ? "high" : "medium";
  } else if (decode?.status === "selector") {
    reasons.push("Selector label is known, but parameters are not fully decoded.");
    confidence = knownProtocol ? "medium" : "low";
  } else if (decode?.status === "unknown" || decode?.status === "unavailable") {
    reasons.push("Calldata decode is incomplete.");
    confidence = "low";
  } else if (decode?.status === "not-applicable") {
    reasons.push("No transaction calldata decode is needed.");
  }

  if (
    knownProtocol &&
    request.method === "eth_sendTransaction" &&
    HIGH_EVIDENCE_SELECTORS.has(calldataSelector(request) ?? "")
  ) {
    confidence = "high";
    reasons.push("Known protocol request with a recognized calldata selector.");
  }
  if (titles.has("Unlimited approval") || titles.has("Unlimited Permit2 approval")) {
    confidence = "high";
    reasons.push("Approval semantics are decoded clearly enough for policy review.");
  }
  if (titles.has("Decoded Universal Router route")) {
    confidence = "high";
    reasons.push("Universal Router command stream decoded into route evidence.");
  }
  if (titles.has("Undecodable mainnet calldata") || titles.has("Undecoded Universal Router commands")) {
    confidence = "low";
    reasons.push("IntentProof does not fully decode this command stream yet.");
  }
  if (SIGNATURE_METHODS.has(request.method)) {
    confidence = knownProtocol ? "high" : "medium";
    reasons.push("Signature method and payload type are recognized.");
  }
  if (request.unsupportedReason) {
    confidence = "low";
    reasons.push("Method or chain is outside the relay surface.");
  }

  const evidenceScore =
    confidence === "high" ? 92 : confidence === "medium" ? 72 : 38;
  return {
    evidenceConfidence: confidence,
    evidenceScore,
    evidenceReasons: reasons.length ? reasons : ["Request method recognized."],
  };
}

function riskFromRequest(request: LiveRequest, decision: LivePolicyDecision): {
  riskLevel: RequestRiskLevel;
  riskReasons: string[];
} {
  const titles = issueTitleSet(decision);
  const risks: string[] = [];
  let riskLevel: RequestRiskLevel = "standard";

  if (decision.severity === "block") {
    riskLevel = "blocked";
    risks.push(...issueText(decision));
    return { riskLevel, riskReasons: risks };
  }
  if (isRoutineWalletCoordinationRequest(request)) {
    return {
      riskLevel: "routine",
      riskReasons: ["No signature or transaction is requested."],
    };
  }
  if (isMainnetChainKey(request.chain.chainKey)) {
    riskLevel = "needs-review";
    risks.push("Mainnet request uses real assets or account authority.");
  }
  if (titles.has("Unlimited approval") || titles.has("Unlimited Permit2 approval")) {
    riskLevel = "high-impact";
    risks.push("Unlimited token permissions can remain active until revoked.");
  }
  if (request.evidence?.simulation.status === "revert") {
    riskLevel = riskLevel === "high-impact" ? "high-impact" : "needs-review";
    risks.push("Simulation indicates the request may revert.");
  }
  if (SIGNATURE_METHODS.has(request.method)) {
    riskLevel = riskLevel === "standard" ? "needs-review" : riskLevel;
    risks.push("Signature payload should be read by the user before forwarding.");
  }
  if (request.method === "wallet_switchEthereumChain") {
    riskLevel = isMainnetChainKey(request.chain.chainKey) ? "needs-review" : "routine";
    risks.push(`Requests switching the wallet to ${request.chain.label}.`);
  }
  if (titles.has("Decoded Universal Router route") || titles.has("Known Uniswap router")) {
    riskLevel = riskLevel === "standard" ? "needs-review" : riskLevel;
    risks.push("Swap route details should be checked before forwarding.");
  }
  if (titles.has("Undecodable mainnet calldata") || titles.has("Undecoded Universal Router commands")) {
    riskLevel = "high-impact";
    risks.push("Mainnet calldata is not fully decoded.");
  }

  return {
    riskLevel,
    riskReasons: risks.length ? Array.from(new Set(risks)) : ["Standard decoded request."],
  };
}

function sourceConfidence(request: LiveRequest): EvidenceConfidence {
  if (getKnownProtocolContractLabel(request)) return "high";
  if (isKnownProtocolRequest(request)) return "high";
  return "medium";
}

function userActionLabel(
  request: LiveRequest,
  decision: LivePolicyDecision,
  riskLevel: RequestRiskLevel,
) {
  if (decision.severity === "block" || riskLevel === "blocked") return "Reject";
  if (isRoutineWalletCoordinationRequest(request)) return "Answer locally";
  if (decision.requiresAcknowledgement) return "Review, then forward";
  return "Forward to connected wallet";
}

export function assessLiveRequest(params: {
  request: LiveRequest;
  decision: LivePolicyDecision;
}): LiveRequestAssessment {
  const { request, decision } = params;
  const evidence = evidenceFromRequest(request, decision);
  const risk = riskFromRequest(request, decision);
  return {
    ...evidence,
    ...risk,
    executionStatus: request.evidence?.simulation.status ?? "pending",
    sourceLabel: getProtocolSourceLabel(request),
    sourceConfidence: sourceConfidence(request),
    userActionLabel: userActionLabel(request, decision, risk.riskLevel),
  };
}

export function formatEvidenceConfidence(confidence: EvidenceConfidence) {
  return confidence[0]!.toUpperCase() + confidence.slice(1);
}

export function formatRiskLevel(risk: RequestRiskLevel) {
  return risk
    .split("-")
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatExecutionStatus(status: LiveRequestAssessment["executionStatus"]) {
  if (status === "not-applicable") return "Not applicable";
  if (status === "success") return "Simulated no revert";
  if (status === "revert") return "Simulated revert";
  return status[0]!.toUpperCase() + status.slice(1);
}
