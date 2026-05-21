import { formatExecutionStatus, presentWalletRequest } from "./requestAssessment";
import { summarizeLiveRequest } from "./semanticSummary";
import type { LivePolicyDecision, LiveRequest } from "./types";
import { understandLiveRequest } from "../txUnderstanding/understandLiveRequest";

export interface WalletRequestViewModel {
  id: string;
  dappLabel: string;
  protocolLabel?: string;
  chainLabel: string;
  chainBadge: string;
  statusLabel: string;
  statusTone: "routine" | "success" | "review" | "warning" | "danger";
  rowTitle: string;
  rowSubtitle: string;
  impactLine: string;
  whatItWants: string;
  whatCanChange: string[];
  resultTitle: string;
  resultBody: string;
  primaryActionLabel: string;
  secondaryActionLabel: string;
  advancedFacts: Array<{ label: string; value: string }>;
}

function cleanFact(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (Array.isArray(value)) return value.join(" → ");
  return String(value);
}

function toneForPresentation(tone: ReturnType<typeof presentWalletRequest>["statusTone"]) {
  if (tone === "neutral") return "routine";
  if (tone === "warning") return "review";
  return tone;
}

function isCoordination(request: LiveRequest) {
  return (
    request.method === "wallet_switchEthereumChain" ||
    request.method === "wallet_getCapabilities" ||
    request.method === "eth_requestAccounts" ||
    request.method === "eth_accounts" ||
    request.method === "eth_chainId"
  );
}

function forwardLabel(request: LiveRequest, decision: LivePolicyDecision, forwardTargetLabel: string) {
  if (decision.severity === "block") return "Cannot relay with IntentProof";
  if (isCoordination(request)) return "Answer locally";
  if (forwardTargetLabel === "Local Token Core Vault") return "Sign with Local Token Core Vault";
  if (forwardTargetLabel === "imToken Web") return "Forward to imToken Web";
  if (forwardTargetLabel === "imToken") return "Forward to imToken";
  return "Forward to connected wallet";
}

function swapRowTitle(understanding: ReturnType<typeof understandLiveRequest>) {
  if (understanding.actionKind !== "swap") return understanding.actionTitle;
  const nativeValue = understanding.deterministicImpact?.nativeValueOut;
  if (nativeValue && understanding.tokenOut) {
    return `Swap ${nativeValue} → ${understanding.tokenOut}`;
  }
  if (understanding.amountIn && understanding.tokenOut) {
    return `Swap ${understanding.amountIn} → ${understanding.tokenOut}`;
  }
  return understanding.actionTitle;
}

function swapWhatCanChange(understanding: ReturnType<typeof understandLiveRequest>) {
  const items: string[] = [];
  const nativeValue = understanding.deterministicImpact?.nativeValueOut;
  const nativeWrappedIntoRoute = understanding.advanced.nativeWrappedIntoRoute === true;
  if (nativeValue) items.push(`Sends ${nativeValue}`);
  if (nativeWrappedIntoRoute) items.push("Router wraps ETH to WETH before the swap");
  if (understanding.tokenIn && understanding.tokenOut) {
    items.push(`Swaps ${understanding.tokenIn} → ${understanding.tokenOut}`);
  } else if (understanding.decodeQuality === "partial-protocol-decode") {
    items.push("Output token / minimum received not fully decoded yet");
  }
  if (understanding.minAmountOut) {
    items.push(`Minimum received: ${understanding.minAmountOut}`);
  }
  items.push(
    understanding.deterministicImpact?.permit2 ??
      "No Permit2 permission detected",
  );
  return items;
}

function defaultWhatCanChange(understanding: ReturnType<typeof understandLiveRequest>) {
  if (understanding.actionKind === "swap") return swapWhatCanChange(understanding);
  const items = [
    understanding.valueSummary ? `Sends ${understanding.valueSummary}` : undefined,
    understanding.amountIn ? `Amount: ${understanding.amountIn}` : undefined,
    understanding.minAmountOut ? `Minimum received: ${understanding.minAmountOut}` : undefined,
    understanding.spender ? `Spender: ${understanding.spender}` : undefined,
    understanding.recipient ? `Recipient: ${understanding.recipient}` : undefined,
    understanding.signatureDomain ? `Signature domain: ${understanding.signatureDomain}` : undefined,
    understanding.deterministicImpact?.tokenApproval,
    understanding.deterministicImpact?.signatureAuthority,
  ].filter(Boolean) as string[];
  return items.length ? items : understanding.userChecks.slice(0, 3);
}

function resultCopy(understanding: ReturnType<typeof understandLiveRequest>, presentationLabel: string) {
  if (understanding.protocolName === "Uniswap" && understanding.actionKind === "swap") {
    return {
      title: "Recognized Uniswap request · Needs review",
      body:
        "IntentProof can read the Universal Router request. Review token route, amount, recipient, and mainnet value before forwarding.",
    };
  }
  if (understanding.actionKind === "approval") {
    return {
      title: "Token approval request · High impact",
      body: "IntentProof decoded the approval. Review spender and allowance before forwarding.",
    };
  }
  if (understanding.actionKind === "signature") {
    return {
      title: "Signature request · Needs review",
      body: "IntentProof can display the signature payload. Read it before forwarding.",
    };
  }
  if (understanding.decodeQuality === "unknown" && understanding.riskLevel !== "routine") {
    return {
      title: "Unknown mainnet calldata · High risk",
      body: "IntentProof cannot explain this transaction enough to safely summarize it.",
    };
  }
  return {
    title:
      understanding.protocolConfidence === "known"
        ? `Recognized ${understanding.protocolName} request`
        : presentationLabel,
    body: understanding.riskReasons[0] ?? "Review the DApp, chain, amount, and final wallet prompt.",
  };
}

function impactLine(understanding: ReturnType<typeof understandLiveRequest>, summaryImpact: string) {
  if (understanding.actionKind === "swap") {
    const parts = [
      understanding.deterministicImpact?.nativeValueOut
        ? `Sends ${understanding.deterministicImpact.nativeValueOut}`
        : undefined,
      understanding.minAmountOut
        ? `Minimum received ${understanding.minAmountOut}`
        : undefined,
    ].filter(Boolean);
    if (parts.length) return parts.join(" · ");
  }
  return summaryImpact;
}

function advancedFacts(request: LiveRequest, understanding: ReturnType<typeof understandLiveRequest>) {
  const facts = [
    { label: "Origin", value: request.origin },
    { label: "Method", value: request.method },
    { label: "Full target address", value: request.tx?.to },
    { label: "Exact native value", value: understanding.deterministicImpact?.nativeValueOutExact },
    { label: "Native value raw wei", value: understanding.deterministicImpact?.nativeValueOutWei },
    { label: "Token in address", value: understanding.advanced.tokenInAddress },
    { label: "Token out address", value: understanding.advanced.tokenOutAddress },
    { label: "Token path", value: understanding.advanced.tokenPath },
    { label: "Exact input amount", value: understanding.advanced.amountInExact },
    { label: "Raw input amount", value: understanding.advanced.amountInRaw },
    { label: "Exact minimum output", value: understanding.advanced.minAmountOutExact },
    { label: "Raw minimum output", value: understanding.advanced.minAmountOutRaw },
    { label: "Decode quality", value: understanding.decodeQuality },
    { label: "Protocol evidence", value: understanding.evidence.join(" · ") },
  ];
  return facts
    .map((fact) => ({ label: fact.label, value: cleanFact(fact.value) }))
    .filter((fact): fact is { label: string; value: string } => Boolean(fact.value));
}

export function buildWalletRequestViewModel(params: {
  request: LiveRequest;
  decision: LivePolicyDecision;
  forwardTargetLabel?: string;
  aiAnnotation?: string;
}): WalletRequestViewModel {
  const { request, decision } = params;
  const forwardTargetLabel = params.forwardTargetLabel ?? "connected wallet";
  const presentation = presentWalletRequest({ request, decision });
  const summary = summarizeLiveRequest(request);
  const understanding = understandLiveRequest(request);
  const result = resultCopy(understanding, presentation.statusLabel);
  const execution = request.evidence?.simulation
    ? formatExecutionStatus(
        understanding.simulationStatus === "simulated-no-revert"
          ? "success"
          : understanding.simulationStatus === "simulated-revert"
            ? "revert"
            : understanding.simulationStatus,
      )
    : undefined;
  const protocolStatus =
    understanding.protocolConfidence === "known"
      ? "Recognized protocol"
      : understanding.protocolConfidence === "probable"
        ? "Known DApp"
        : "Source not profiled";

  return {
    id: request.id,
    dappLabel: understanding.protocolName || summary.subtitle,
    protocolLabel: understanding.contractLabel,
    chainLabel: request.chain.label,
    chainBadge: request.chain.environment === "mainnet" ? "Mainnet" : request.chain.label,
    statusLabel: presentation.statusLabel,
    statusTone: toneForPresentation(presentation.statusTone),
    rowTitle: swapRowTitle(understanding),
    rowSubtitle: [
      protocolStatus,
      request.chain.environment === "mainnet" ? "Mainnet" : request.chain.label,
      presentation.statusLabel,
      execution,
      params.aiAnnotation ? `AI: ${params.aiAnnotation}` : undefined,
    ]
      .filter(Boolean)
      .join(" · "),
    impactLine: impactLine(understanding, presentation.impactLine),
    whatItWants:
      understanding.actionKind === "swap" &&
      understanding.protocolName === "Uniswap" &&
      understanding.decodeQuality !== "partial-protocol-decode"
        ? "Request a Uniswap swap through Universal Router."
        : summary.whatItWants,
    whatCanChange: defaultWhatCanChange(understanding),
    resultTitle: result.title,
    resultBody: result.body,
    primaryActionLabel: forwardLabel(request, decision, forwardTargetLabel),
    secondaryActionLabel: "Reject request",
    advancedFacts: advancedFacts(request, understanding),
  };
}
