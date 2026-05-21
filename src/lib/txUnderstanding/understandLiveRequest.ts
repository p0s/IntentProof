import { isMainnetChainKey } from "../chains";
import type { LiveRequest } from "../live/types";
import { resolveLiveAbiEvidence } from "./abiResolver";
import { identifyProtocol } from "./protocolIdentity";
import { decodeKnownProtocolRequest } from "./protocolDecoders";
import {
  formatNativeValue,
  formatNativeValueExact,
  nativeValueWei,
  selector,
  shortAddress,
} from "./protocolDecoders/helpers";
import type { TransactionUnderstanding } from "./types";

function mapSimulationStatus(request: LiveRequest): TransactionUnderstanding["simulationStatus"] {
  const status = request.evidence?.simulation.status;
  if (!status) return request.method === "eth_sendTransaction" ? "pending" : "not-applicable";
  if (status === "success") return "simulated-no-revert";
  if (status === "revert") return "simulated-revert";
  if (status === "unavailable") return "unavailable";
  if (status === "pending") return "pending";
  return "not-applicable";
}

function applySharedState(
  request: LiveRequest,
  understanding: TransactionUnderstanding,
): TransactionUnderstanding {
  const protocol = identifyProtocol(request);
  const simulationStatus = mapSimulationStatus(request);
  const evidence = Array.from(
    new Set([
      ...protocol.evidence,
      ...understanding.evidence,
      request.evidence?.simulation.status === "success"
        ? `${request.evidence.simulation.provider} simulation completed without an immediate revert.`
        : undefined,
      request.evidence?.simulation.status === "revert"
        ? `${request.evidence.simulation.provider} simulation indicates the request may revert.`
        : undefined,
    ].filter((item): item is string => Boolean(item))),
  );
  const riskReasons = [...understanding.riskReasons];
  if (isMainnetChainKey(request.chain.chainKey) && understanding.riskLevel === "standard") {
    riskReasons.unshift("Mainnet request uses real assets or account authority.");
  }
  if (simulationStatus === "simulated-revert") {
    riskReasons.push("Execution simulation indicates the request may revert.");
  }
  const nativeValueOut = formatNativeValue(request);
  const nativeValueOutExact = formatNativeValueExact(request);
  const nativeValueOutWei = nativeValueWei(request);
  const simulationAssetDelta =
    request.evidence?.simulation.assetChanges.length
      ? {
          status: "available" as const,
          summary: `${request.evidence.simulation.assetChanges.length} parsed asset change(s) returned by ${request.evidence.simulation.provider}.`,
        }
      : request.evidence?.simulation.status === "success"
        ? {
            status: "not-parsed" as const,
            summary: "Simulation did not return parsed asset changes.",
          }
        : {
            status: "unavailable" as const,
            summary: "Asset-change preview unavailable.",
          };
  const deterministicImpact = {
    ...understanding.deterministicImpact,
    nativeValueOut: understanding.deterministicImpact?.nativeValueOut ?? nativeValueOut,
    nativeValueOutExact:
      understanding.deterministicImpact?.nativeValueOutExact ?? nativeValueOutExact,
    nativeValueOutWei:
      understanding.deterministicImpact?.nativeValueOutWei ?? nativeValueOutWei,
    tokenApproval:
      understanding.deterministicImpact?.tokenApproval ??
      (understanding.assetAuthorityKind === "limited-token-approval" ||
      understanding.assetAuthorityKind === "unlimited-token-approval"
        ? understanding.amountIn ?? understanding.assetAuthorityKind
        : undefined),
    permit2:
      understanding.deterministicImpact?.permit2 ??
      (understanding.assetAuthorityKind === "permit2" ? "Permit2 authority detected" : undefined),
    signatureAuthority:
      understanding.deterministicImpact?.signatureAuthority ??
      (understanding.assetAuthorityKind === "signature-authority"
        ? "Signature authority requested"
        : undefined),
  };

  return {
    ...understanding,
    protocolName:
      understanding.protocolConfidence === "known"
        ? understanding.protocolName
        : protocol.protocolName,
    protocolConfidence:
      understanding.protocolConfidence === "known"
        ? understanding.protocolConfidence
        : protocol.protocolConfidence,
    contractLabel: understanding.contractLabel ?? protocol.contractLabel,
    riskLevel:
      request.unsupportedReason
        ? "unsupported"
        : isMainnetChainKey(request.chain.chainKey) && understanding.riskLevel === "standard"
          ? "needs-review"
          : understanding.riskLevel,
    riskReasons: Array.from(new Set(riskReasons)),
    simulationStatus,
    deterministicImpact,
    simulationAssetDelta,
    evidence,
    advanced: {
      ...understanding.advanced,
      nativeValueOutExact,
      nativeValueOutWei,
      protocolIdentity: protocol,
      simulation: request.evidence?.simulation,
    },
  };
}

function fallbackUnderstanding(request: LiveRequest): TransactionUnderstanding {
  const protocol = identifyProtocol(request);
  const abi = resolveLiveAbiEvidence(request);
  const nativeValue = formatNativeValue(request);
  const target = request.tx?.to;
  const selected = selector(request.tx?.data);
  const nativeTransfer =
    request.method === "eth_sendTransaction" &&
    (!request.tx?.data || request.tx.data === "0x");
  const decodedName =
    abi.functionName ?? abi.functionSignature ?? request.evidence?.decode.summary;
  const isWrite = request.method === "eth_sendTransaction";
  const decodeQuality = abi.decodeQuality;
  const mainnet = isMainnetChainKey(request.chain.chainKey);
  const title = nativeTransfer
    ? "Native token transfer"
    : isWrite
      ? decodedName ?? "Contract transaction"
      : request.method;

  return {
    protocolName: protocol.protocolName,
    protocolConfidence: protocol.protocolConfidence,
    contractLabel: protocol.contractLabel,
    actionKind: nativeTransfer ? "transfer" : isWrite ? "unknown" : "coordination",
    actionTitle: title,
    userSummary: nativeTransfer
      ? `Send ${nativeValue ?? "0 native token"} to ${target ?? "an unknown recipient"}.`
      : isWrite
      ? [
          decodedName
            ? `Call ${decodedName}`
            : `Call contract ${target ?? "with no target address"}`,
          target ? `at ${target}` : undefined,
          nativeValue ? `with ${nativeValue}` : "with no native token value",
          selected ? `using selector ${selected}` : undefined,
        ]
          .filter(Boolean)
          .join(" ") + "."
      : `Handle ${request.method} from ${protocol.protocolName} on ${request.chain.label}.`,
    valueSummary: nativeValue,
    recipient: target,
    decodeQuality: nativeTransfer ? "full-protocol-decode" : decodeQuality,
    assetAuthorityKind: nativeValue ? "value-transfer" : "none",
    riskLevel: request.unsupportedReason
      ? "unsupported"
      : mainnet && decodeQuality === "unknown"
        ? "needs-review"
        : "standard",
    riskReasons: [
      request.unsupportedReason ??
        (nativeTransfer
          ? "Native token transfer has no calldata to decode."
          : decodeQuality === "unknown"
          ? "IntentProof cannot fully decode this contract-specific payload yet."
          : "ABI or selector evidence is available, but no protocol-specific decoder matched."),
    ],
    userChecks: [
      "Confirm the DApp, chain, full target address, value, method, and wallet prompt.",
      "Treat simulation as execution evidence only; it does not prove the request is benign.",
    ],
    simulationStatus: mapSimulationStatus(request),
    evidence: nativeTransfer
      ? [...protocol.evidence, "Native token transfer recognized; no calldata decode is needed."]
      : [...protocol.evidence, ...abi.evidence],
    advanced: {
      decodeSource: abi.source,
      selector: selected,
      target: target ? shortAddress(target) : undefined,
    },
  };
}

export function understandLiveRequest(request: LiveRequest): TransactionUnderstanding {
  const decoded = decodeKnownProtocolRequest(request);
  return applySharedState(request, decoded ?? fallbackUnderstanding(request));
}
