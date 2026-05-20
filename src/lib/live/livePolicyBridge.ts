import { getChainConfig, isMainnetChainKey } from "../chains";
import type { AgentFirewallSettings } from "../intentproof";
import type { LivePolicyDecision, LiveRequest } from "./types";
import { isReadOnlyLiveRpcMethod } from "./rpcProxy";
import { decodeUniversalRouterRequest } from "./uniswapUniversalRouter";

const MAX_UINT256_HEX =
  "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const ERC20_TRANSFER_SELECTOR = "0xa9059cbb";
const ERC20_APPROVE_SELECTOR = "0x095ea7b3";
const WETH_DEPOSIT_SELECTOR = "0xd0e30db0";
const LIDO_SUBMIT_SELECTOR = "0xa1903eab";
const UNISWAP_EXACT_INPUT_SINGLE_SELECTOR = "0x414bf389";
const UNIVERSAL_ROUTER_EXECUTE_SELECTORS = new Set(["0x24856bc3", "0x3593564c"]);

function issue(
  severity: "info" | "warn" | "block",
  title: string,
  description: string,
) {
  return { severity, title, description };
}

function isUnlimitedApproval(request: LiveRequest) {
  const data = request.tx?.data?.toLowerCase();
  return Boolean(
    data?.startsWith(ERC20_APPROVE_SELECTOR) && data.endsWith(MAX_UINT256_HEX),
  );
}

function calldataSelector(request: LiveRequest) {
  const data = request.tx?.data?.toLowerCase();
  if (!data || data === "0x" || data.length < 10) return undefined;
  return data.slice(0, 10);
}

function getKnownUniswapRouterAddresses(request: LiveRequest) {
  const chain = getChainConfig(request.chain.chainKey);
  return [
    chain.uniswap.swapRouter02,
    chain.uniswap.universalRouter,
    ...(chain.uniswap.universalRouterAliases ?? []),
  ]
    .filter((address): address is `0x${string}` => Boolean(address))
    .map((address) => address.toLowerCase());
}

function isKnownUniswapRouterCall(request: LiveRequest) {
  const to = request.tx?.to?.toLowerCase();
  const selector = calldataSelector(request);
  if (!to || !selector) return false;
  const knownRouter = getKnownUniswapRouterAddresses(request).includes(to);
  if (!knownRouter) return false;
  return (
    selector === UNISWAP_EXACT_INPUT_SINGLE_SELECTOR ||
    UNIVERSAL_ROUTER_EXECUTE_SELECTORS.has(selector)
  );
}

function isKnownUniswapUniversalRouterCall(request: LiveRequest) {
  const to = request.tx?.to?.toLowerCase();
  const selector = calldataSelector(request);
  if (!to || !selector) return false;
  return (
    getKnownUniswapRouterAddresses(request).includes(to) &&
    UNIVERSAL_ROUTER_EXECUTE_SELECTORS.has(selector)
  );
}

function isKnownUniswapExactInputSingleCall(request: LiveRequest) {
  const to = request.tx?.to?.toLowerCase();
  const selector = calldataSelector(request);
  if (!to || !selector) return false;
  return (
    getKnownUniswapRouterAddresses(request).includes(to) &&
    selector === UNISWAP_EXACT_INPUT_SINGLE_SELECTOR
  );
}

function hasUnknownCalldata(request: LiveRequest) {
  const data = request.tx?.data?.toLowerCase();
  if (!data || data === "0x") return false;
  if (isKnownUniswapExactInputSingleCall(request)) return false;
  return !(
    data.startsWith(ERC20_TRANSFER_SELECTOR) ||
    data.startsWith(ERC20_APPROVE_SELECTOR) ||
    data.startsWith(WETH_DEPOSIT_SELECTOR) ||
    data.startsWith(LIDO_SUBMIT_SELECTOR)
  );
}

function getErc20TransferRecipient(request: LiveRequest) {
  const data = request.tx?.data?.toLowerCase();
  if (!data?.startsWith(ERC20_TRANSFER_SELECTOR) || data.length < 74) return undefined;
  return `0x${data.slice(34, 74)}`;
}

function isReadOnlyWalletCoordinationRequest(request: LiveRequest) {
  return (
    request.method === "wallet_getCapabilities" ||
    request.method === "eth_requestAccounts" ||
    request.method === "eth_accounts" ||
    request.method === "eth_chainId" ||
    isReadOnlyLiveRpcMethod(request.method)
  );
}

function buildReviewScore(params: {
  request: LiveRequest;
  issues: LivePolicyDecision["issues"];
  severity: LivePolicyDecision["severity"];
  universalRouterSummary?: string;
}): LivePolicyDecision["score"] {
  const { request, issues, severity, universalRouterSummary } = params;
  const evidence = request.evidence;
  const blockCount = issues.filter((item) => item.severity === "block").length;
  const warnCount = issues.filter((item) => item.severity === "warn").length;
  const infoCount = issues.filter((item) => item.severity === "info").length;
  let value = 96 - blockCount * 70 - warnCount * 10 - infoCount * 5;
  if (evidence?.decode.status === "decoded") value += 4;
  if (evidence?.decode.status === "selector") value -= 4;
  if (
    evidence?.decode.status === "unknown" ||
    evidence?.decode.status === "unavailable"
  ) {
    value -= 8;
  }
  if (evidence?.simulation.status === "success") {
    value += evidence.simulation.assetChanges.length > 0 ? 8 : 4;
  }
  if (evidence?.simulation.status === "revert") value -= 45;
  if (evidence?.simulation.status === "unavailable") value -= 6;
  if (evidence?.simulation.status === "pending") value -= 3;
  value = Math.max(
    0,
    Math.min(100, value),
  );
  const titles = issues.map((item) => item.title);
  const reasons: string[] = [];

  if (request.unsupportedReason) reasons.push("Unsupported method or chain.");
  if (isReadOnlyWalletCoordinationRequest(request)) {
    reasons.push("Read-only wallet coordination request.");
  }
  if (request.method === "eth_sendTransaction") {
    if (universalRouterSummary) {
      reasons.push(`Universal Router command stream decoded: ${universalRouterSummary}`);
    } else if (isKnownUniswapUniversalRouterCall(request)) {
      reasons.push("Universal Router command stream is not decoded by IntentProof.");
    } else if (isKnownUniswapRouterCall(request)) {
      reasons.push("Target is a known Uniswap router with a recognized swap entrypoint.");
    } else if (!hasUnknownCalldata(request)) {
      reasons.push("Calldata matches a supported readable method.");
    } else {
      reasons.push("Calldata is not fully decoded by IntentProof.");
    }
    if (request.tx?.to) reasons.push("Full target address is present.");
  }
  if (evidence?.decode.status === "decoded") {
    reasons.push(
      `Decode evidence: ${evidence.decode.source} ${evidence.decode.functionName ?? "transaction"} decode.`,
    );
  } else if (evidence?.decode.status === "selector") {
    reasons.push("Decode evidence: selector label only; parameters are not fully decoded.");
  } else if (
    evidence?.decode.status === "unknown" ||
    evidence?.decode.status === "unavailable"
  ) {
    reasons.push(
      evidence.decode.errorMessage
        ? `Decode evidence unavailable: ${evidence.decode.errorMessage}`
        : "Decode evidence is incomplete.",
    );
  }
  if (evidence?.decode.contractVerified) {
    reasons.push(`Contract verification source: ${evidence.decode.contractSource}.`);
  }
  if (evidence?.simulation.status === "success") {
    reasons.push(
      evidence.simulation.assetChanges.length > 0
        ? `${evidence.simulation.provider} simulation found ${evidence.simulation.assetChanges.length} asset change(s).`
        : `${evidence.simulation.provider} execution simulation completed without an immediate revert; this does not prove the request is benign.`,
    );
  } else if (evidence?.simulation.status === "revert") {
    reasons.push(
      evidence.simulation.errorMessage
        ? `Simulation indicates revert: ${evidence.simulation.errorMessage}`
        : "Simulation indicates the transaction may revert.",
    );
  } else if (evidence?.simulation.status === "unavailable") {
    reasons.push(
      evidence.simulation.errorMessage
        ? `Simulation unavailable: ${evidence.simulation.errorMessage}`
        : "Simulation evidence is unavailable.",
    );
  } else if (evidence?.simulation.status === "pending") {
    reasons.push("Simulation evidence is still loading.");
  }
  if (titles.includes("Unlimited approval")) {
    reasons.push("Unlimited token approval is an unusual high-impact permission.");
  }
  if (titles.includes("Mainnet request")) {
    reasons.push("Mainnet assets are real, so the request needs user review.");
  }
  if (titles.includes("First-time recipient review")) {
    reasons.push("Recipient or spender is not in the trusted demo recipient set.");
  }
  if (
    request.method === "personal_sign" ||
    request.method === "eth_signTypedData_v4"
  ) {
    reasons.push("Signature payload must be reviewed by the user in imToken.");
  }
  if (reasons.length === 0) reasons.push("No policy issues were found.");

  let confidence: LivePolicyDecision["score"]["confidence"] = "high";
  const hasDecodedKnownSwapRoute =
    Boolean(universalRouterSummary) || isKnownUniswapExactInputSingleCall(request);
  if (
    titles.includes("Undecodable mainnet calldata") ||
    titles.includes("Undecoded Universal Router commands") ||
    evidence?.simulation.status === "revert"
  ) {
    confidence = "low";
  } else if (
    request.method === "eth_sendTransaction" &&
    evidence &&
    (evidence.simulation.status === "pending" ||
      evidence.simulation.status === "unavailable")
  ) {
    confidence = hasDecodedKnownSwapRoute ? "medium" : "low";
  } else if (severity === "warn") {
    confidence = "medium";
  }

  const summary =
    evidence?.simulation.status === "success" && evidence.decode.status === "decoded"
      ? "Decoded transaction evidence and simulation produced a clear review."
      : confidence === "high"
        ? "Deterministic policy checks produced a clear result."
        : confidence === "medium"
          ? "IntentProof recognizes the request, but user review is required."
          : "IntentProof is missing high-confidence evidence, so review is conservative.";

  return { value, confidence, summary, reasons };
}

export function evaluateLiveRequestPolicy(params: {
  request: LiveRequest;
  firewall: AgentFirewallSettings;
  warningAcknowledged?: boolean;
}): LivePolicyDecision {
  const { request, firewall } = params;
  const issues: LivePolicyDecision["issues"] = [];
  const isMainnet = isMainnetChainKey(request.chain.chainKey);
  const universalRouterPlan = isKnownUniswapUniversalRouterCall(request)
    ? decodeUniversalRouterRequest(request)
    : undefined;

  if (request.unsupportedReason) {
    issues.push(issue("block", "Cannot relay request", request.unsupportedReason));
  }

  if (isMainnet && !isReadOnlyWalletCoordinationRequest(request)) {
    issues.push(
      issue(
        "warn",
        "Mainnet request",
        "This request is on mainnet. Review the addresses, value, and calldata carefully before forwarding to imToken.",
      ),
    );
  }

  if (!isMainnet && !firewall.allowedChains.includes(request.chain.chainKey)) {
    issues.push(
      issue(
        "warn",
        "Chain outside profile",
        `${request.chain.label} is not allowed by the active Permission Profile.`,
      ),
    );
  }

  if (request.method === "eth_sendTransaction") {
    if (!request.tx?.to) {
      issues.push(
        issue(
          "warn",
          "No target address",
          "This transaction does not include a normal target address. Review whether it is a contract deployment or malformed request.",
        ),
      );
    }
    if (isUnlimitedApproval(request)) {
      issues.push(
        issue(
          "warn",
          "Unlimited approval",
          "This transaction grants uint256.max token allowance. That can let a spender move the token until the approval is revoked.",
        ),
      );
    }
    if (request.evidence?.simulation.status === "revert") {
      issues.push(
        issue(
          "warn",
          "Simulation indicates revert",
          request.evidence.simulation.errorMessage
            ? `The simulation provider indicates this request may fail: ${request.evidence.simulation.errorMessage}`
            : "The simulation provider indicates this request may fail.",
        ),
      );
    }
    if (isMainnet && isKnownUniswapUniversalRouterCall(request)) {
      if (universalRouterPlan?.supported) {
        issues.push(
          issue(
            "warn",
            "Decoded Universal Router route",
            `${universalRouterPlan.summary}. Review token path, amounts, recipient, and mainnet value in imToken before final signing.`,
          ),
        );
        if (universalRouterPlan.hasAllowRevert) {
          issues.push(
            issue(
              "warn",
              "Partial-fill route",
              "At least one Universal Router command allows revert. Confirm cleanup and final received amount in imToken.",
            ),
          );
        }
        if (universalRouterPlan.hasUnlimitedPermit) {
          issues.push(
            issue(
              "warn",
              "Unlimited Permit2 approval",
              "The Universal Router command stream includes a Permit2 permit for the maximum uint160 allowance.",
            ),
          );
        }
      } else {
        const unsupported = universalRouterPlan?.unsupportedCommandNames.join(", ");
        issues.push(
          issue(
            "warn",
            "Undecoded Universal Router commands",
            unsupported
              ? `IntentProof decoded the Universal Router envelope but cannot fully display these commands yet: ${unsupported}.`
              : "IntentProof recognizes this as a Uniswap Universal Router request, but it does not decode and display the router command stream yet. Review token in/out, recipient, Permit2, and spend commands in imToken.",
          ),
        );
      }
    } else if (isMainnet && hasUnknownCalldata(request)) {
      issues.push(
        issue(
          "warn",
          "Undecodable mainnet calldata",
          "IntentProof does not fully decode this mainnet calldata. Use imToken as the final checkpoint and verify the target, value, selector, and calldata length.",
        ),
      );
    }
    if (isKnownUniswapRouterCall(request) && !isKnownUniswapUniversalRouterCall(request)) {
      issues.push(
        issue(
          "warn",
          "Known Uniswap router",
          "This request targets a known Uniswap router and uses a recognized swap entrypoint. Review the route and amounts in imToken before final signing.",
        ),
      );
    }
    const transferRecipient = getErc20TransferRecipient(request);
    const trustedTransferRecipient =
      transferRecipient?.toLowerCase() ===
      "0x1111111111111111111111111111111111111111";
    if (!isUnlimitedApproval(request) && request.tx?.to && !trustedTransferRecipient) {
      issues.push(
        issue(
          "warn",
          "First-time recipient review",
          "Confirm the full recipient or spender address in imToken before final signing.",
        ),
      );
    }
  }

  if (
    request.method === "personal_sign" ||
    request.method === "eth_signTypedData_v4"
  ) {
    issues.push(
      issue(
        "warn",
        "Human-readable signature",
        "Review the typed-data or message content before forwarding; imToken remains the final signer.",
      ),
    );
  }

  const hasBlock = issues.some((item) => item.severity === "block");
  const hasWarn = issues.some((item) => item.severity === "warn");
  const hasInfo = issues.some((item) => item.severity === "info");
  const severity = hasBlock ? "block" : hasWarn ? "warn" : hasInfo ? "info" : "pass";
  const score = buildReviewScore({
    request,
    issues,
    severity,
    universalRouterSummary: universalRouterPlan?.supported
      ? universalRouterPlan.summary
      : undefined,
  });
  return {
    severity,
    label:
      severity === "block"
        ? "BLOCK"
        : severity === "warn"
          ? "WARN"
          : severity === "info"
            ? "INFO"
            : "PASS",
    summary: hasBlock
      ? "IntentProof cannot relay this method or chain. Use a different wallet path only if you deliberately trust the request."
      : hasWarn
        ? "IntentProof found unusual or incomplete evidence. Review the details before sending the exact request to imToken."
        : "IntentProof found routine request evidence. imToken remains the final signing checkpoint.",
    score,
    canForward: !hasBlock && !(hasWarn && !params.warningAcknowledged),
    requiresAcknowledgement: hasWarn,
    issues,
  };
}
