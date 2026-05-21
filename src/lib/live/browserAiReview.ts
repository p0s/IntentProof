import { formatUnits } from "viem";

import { getChainConfig } from "../chains";
import { understandLiveRequest } from "../txUnderstanding/understandLiveRequest";
import type { TransactionUnderstanding } from "../txUnderstanding/types";
import { buildWalletRequestViewModel } from "./walletRequestViewModel";
import type {
  LiveAssetChangeEvidence,
  LivePolicyDecision,
  LiveRequest,
} from "./types";

export interface AiTransactionReviewPacket {
  mode: "preview" | "testnet" | "live";
  requestSource: string;
  userIntent: string;
  hasExplicitUserIntent: boolean;
  chain: string;
  isMainnet: boolean;
  method: string;
  decodedFunction?: string;
  token?: string;
  amount?: string;
  recipient?: string;
  spender?: string;
  approvalAmount?: string;
  isUnlimitedApproval: boolean;
  isBridge: boolean;
  isBatch: boolean;
  batchCalls?: Array<{
    index: number;
    method: string;
    to: string;
    value?: string;
    selector?: string;
    decodedLabel?: string;
  }>;
  policyDecision: "PASS" | "INFO" | "WARN" | "BLOCK";
  policyReasons: string[];
  warnings: string[];
  blockers: string[];
  simulationAvailable: boolean;
  assetDeltaSummary?: string;
  understanding: Omit<TransactionUnderstanding, "advanced">;
  viewModel: {
    rowTitle: string;
    whatItWants: string;
    whatCanChange: string[];
    resultTitle: string;
    resultBody: string;
  };
}

export interface AiTransactionReview {
  headline: string;
  plainEnglishSummary: string;
  userIntentMatch:
    | "matches"
    | "partially_matches"
    | "does_not_match"
    | "unclear";
  mainRisks: string[];
  questionsToAskBeforeSigning: string[];
  whyPolicyDecisionMakesSense: string;
  scamPatternHints: string[];
  confidence: "low" | "medium" | "high";
}

export interface BatchAiReview {
  overallHeadline: string;
  overallSummary: string;
  requests: Array<{
    requestId: string;
    headline: string;
    attentionLevel: "routine" | "review" | "high";
    judgement: string;
    summary: string;
  }>;
}

export interface BrowserAiModelOption {
  id: string;
  label: string;
  approximateSize: string;
  note: string;
}

export interface BrowserAiReviewState {
  status: "idle" | "loading" | "reviewing" | "ready" | "error";
  progress?: string;
  review?: AiTransactionReview;
  error?: string;
}

export interface BrowserAiProgress {
  text?: string;
  progress?: number;
}

export interface BrowserAiCacheClearResult {
  clearedModelIds: string[];
  failedModelIds: Array<{
    modelId: string;
    message: string;
  }>;
}

export const BROWSER_AI_MODEL_OPTIONS: BrowserAiModelOption[] = [
  {
    id: "SmolLM2-360M-Instruct-q4f16_1-MLC",
    label: "SmolLM2 360M",
    approximateSize: "~376 MB",
    note: "Fastest local check; good for short risk summaries.",
  },
  {
    id: "TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC-1k",
    label: "TinyLlama 1.1B 1k",
    approximateSize: "~675 MB",
    note: "Small chat model with a short context window.",
  },
  {
    id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    label: "Qwen2.5 0.5B",
    approximateSize: "~945 MB",
    note: "More context for detailed request summaries.",
  },
];

export const DEFAULT_BROWSER_AI_MODEL_ID = BROWSER_AI_MODEL_OPTIONS[0]!.id;

const MAX_UINT256_DECIMAL =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";
const MAX_UINT256_HEX =
  "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const ERC20_TRANSFER_SELECTOR = "0xa9059cbb";
const ERC20_APPROVE_SELECTOR = "0x095ea7b3";
const UNIVERSAL_ROUTER_EXECUTE_SELECTORS = new Set(["0x24856bc3", "0x3593564c"]);

type WebLlmEngine = {
  unload?: () => Promise<void>;
  chat: {
    completions: {
      create: (params: unknown) => Promise<{
        choices?: Array<{ message?: { content?: string } }>;
      }>;
    };
  };
};

let engineCache:
  | {
      modelId: string;
      engine: WebLlmEngine;
    }
  | undefined;

function calldataSelector(data?: string) {
  if (!data || data === "0x" || data.length < 10) return undefined;
  return data.slice(0, 10).toLowerCase();
}

function issueText(decision: LivePolicyDecision, severity: "warn" | "block") {
  return decision.issues
    .filter((issue) => issue.severity === severity)
    .map((issue) => `${issue.title}: ${issue.description}`);
}

function isUnlimitedApproval(request: LiveRequest, decision: LivePolicyDecision) {
  const data = request.tx?.data?.toLowerCase();
  return Boolean(
    decision.issues.some((issue) => /unlimited/i.test(issue.title)) ||
      (data?.startsWith(ERC20_APPROVE_SELECTOR) && data.endsWith(MAX_UINT256_HEX)),
  );
}

function isBridgeLike(decision: LivePolicyDecision) {
  return decision.issues.some((issue) =>
    /bridge|cross[- ]?chain|chain outside/i.test(`${issue.title} ${issue.description}`),
  );
}

function isBatchLike(request: LiveRequest) {
  const selector = calldataSelector(request.tx?.data);
  return (
    request.method === "wallet_sendCalls" ||
    Boolean(selector && UNIVERSAL_ROUTER_EXECUTE_SELECTORS.has(selector))
  );
}

function decodeUint256Word(data: string, wordIndex: number) {
  const normalized = data.toLowerCase().replace(/^0x/, "");
  const start = 8 + wordIndex * 64;
  const word = normalized.slice(start, start + 64);
  if (word.length !== 64) return undefined;
  try {
    return BigInt(`0x${word}`).toString();
  } catch {
    return undefined;
  }
}

function decodeAddressWord(data: string, wordIndex: number) {
  const normalized = data.toLowerCase().replace(/^0x/, "");
  const start = 8 + wordIndex * 64;
  const word = normalized.slice(start, start + 64);
  if (word.length !== 64) return undefined;
  return `0x${word.slice(24)}`;
}

function assetDeltaSummary(changes: LiveAssetChangeEvidence[] | undefined) {
  if (!changes?.length) return undefined;
  return changes
    .slice(0, 6)
    .map((change) => {
      const parts = [
        change.changeType,
        change.amount ?? change.rawAmount,
        change.symbol ?? change.assetType,
      ].filter(Boolean);
      const endpoint = change.to ?? change.from ?? change.contractAddress;
      return endpoint ? `${parts.join(" ")} (${endpoint})` : parts.join(" ");
    })
    .join("; ");
}

function nativeAmount(value?: string) {
  if (!value || value === "0x") return undefined;
  try {
    const wei = BigInt(value);
    if (wei === 0n) return undefined;
    return `${formatUnits(wei, 18)} native`;
  } catch {
    return value;
  }
}

function tokenAmountFromCalldata(request: LiveRequest) {
  const data = request.tx?.data?.toLowerCase();
  if (!data) return undefined;
  const selector = calldataSelector(data);
  if (selector === ERC20_TRANSFER_SELECTOR || selector === ERC20_APPROVE_SELECTOR) {
    return decodeUint256Word(data, 1);
  }
  return undefined;
}

function tokenRecipientFromCalldata(request: LiveRequest) {
  const data = request.tx?.data?.toLowerCase();
  if (!data) return undefined;
  const selector = calldataSelector(data);
  if (selector === ERC20_TRANSFER_SELECTOR) return decodeAddressWord(data, 0);
  return undefined;
}

function spenderFromCalldata(request: LiveRequest) {
  const data = request.tx?.data?.toLowerCase();
  if (!data || calldataSelector(data) !== ERC20_APPROVE_SELECTOR) return undefined;
  return decodeAddressWord(data, 0);
}

function approvalAmountFromCalldata(request: LiveRequest) {
  const data = request.tx?.data?.toLowerCase();
  if (!data || calldataSelector(data) !== ERC20_APPROVE_SELECTOR) return undefined;
  const amount = decodeUint256Word(data, 1);
  return amount === MAX_UINT256_DECIMAL ? "unlimited" : amount;
}

function decodedFunctionLabel(request: LiveRequest) {
  const decode = request.evidence?.decode;
  if (decode?.functionName) return decode.functionName;
  if (decode?.functionSignature) return decode.functionSignature;
  const selector = calldataSelector(request.tx?.data);
  if (selector === ERC20_TRANSFER_SELECTOR) return "transfer";
  if (selector === ERC20_APPROVE_SELECTOR) return "approve";
  if (selector && UNIVERSAL_ROUTER_EXECUTE_SELECTORS.has(selector)) {
    return "Universal Router execute";
  }
  return decode?.summary;
}

export function buildAiTransactionReviewPacket(params: {
  mode: "preview" | "testnet" | "live";
  request: LiveRequest;
  decision: LivePolicyDecision;
  userIntent?: string;
}): AiTransactionReviewPacket {
  const { request, decision } = params;
  const understanding = understandLiveRequest(request);
  const viewModel = buildWalletRequestViewModel({ request, decision });
  const explicitIntent = params.userIntent?.trim();
  const selector = calldataSelector(request.tx?.data);
  const warnings = issueText(decision, "warn");
  const blockers = issueText(decision, "block");
  const policyReasons = [
    decision.summary,
    ...decision.score.reasons,
    ...decision.issues.map((issue) => `${issue.title}: ${issue.description}`),
  ];
  const chain = getChainConfig(request.chain.chainKey);
  const batchCalls = isBatchLike(request)
    ? [
        {
          index: 0,
          method: request.method,
          to: request.tx?.to ?? "n/a",
          value: nativeAmount(request.tx?.value),
          selector,
          decodedLabel: decodedFunctionLabel(request),
        },
      ]
    : undefined;

  return {
    mode: params.mode,
    requestSource: request.origin,
    userIntent: explicitIntent ||
      "No explicit natural-language intent was provided for this live DApp request.",
    hasExplicitUserIntent: Boolean(explicitIntent),
    chain: request.chain.label,
    isMainnet: chain.environment === "mainnet",
    method: request.method,
    decodedFunction: decodedFunctionLabel(request),
    token: request.evidence?.simulation.assetChanges[0]?.symbol,
    amount: tokenAmountFromCalldata(request) ?? nativeAmount(request.tx?.value),
    recipient: tokenRecipientFromCalldata(request) ?? request.tx?.to,
    spender: spenderFromCalldata(request),
    approvalAmount: approvalAmountFromCalldata(request),
    isUnlimitedApproval: isUnlimitedApproval(request, decision),
    isBridge: isBridgeLike(decision),
    isBatch: isBatchLike(request),
    batchCalls,
    policyDecision: decision.label,
    policyReasons: Array.from(new Set(policyReasons)).slice(0, 12),
    warnings,
    blockers,
    simulationAvailable:
      request.evidence?.simulation.status === "success" ||
      request.evidence?.simulation.status === "revert",
    assetDeltaSummary: assetDeltaSummary(request.evidence?.simulation.assetChanges),
    understanding: {
      protocolName: understanding.protocolName,
      protocolConfidence: understanding.protocolConfidence,
      contractLabel: understanding.contractLabel,
      actionKind: understanding.actionKind,
      actionTitle: understanding.actionTitle,
      userSummary: understanding.userSummary,
      valueSummary: understanding.valueSummary,
      tokenIn: understanding.tokenIn,
      tokenOut: understanding.tokenOut,
      amountIn: understanding.amountIn,
      minAmountOut: understanding.minAmountOut,
      spender: understanding.spender,
      recipient: understanding.recipient,
      router: understanding.router,
      signatureDomain: understanding.signatureDomain,
      decodeQuality: understanding.decodeQuality,
      assetAuthorityKind: understanding.assetAuthorityKind,
      riskLevel: understanding.riskLevel,
      riskReasons: understanding.riskReasons,
      userChecks: understanding.userChecks,
      simulationStatus: understanding.simulationStatus,
      evidence: understanding.evidence,
    },
    viewModel: {
      rowTitle: viewModel.rowTitle,
      whatItWants: viewModel.whatItWants,
      whatCanChange: viewModel.whatCanChange,
      resultTitle: viewModel.resultTitle,
      resultBody: viewModel.resultBody,
    },
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isReviewMatch(value: unknown): value is AiTransactionReview["userIntentMatch"] {
  return (
    value === "matches" ||
    value === "partially_matches" ||
    value === "does_not_match" ||
    value === "unclear"
  );
}

function isConfidence(value: unknown): value is AiTransactionReview["confidence"] {
  return value === "low" || value === "medium" || value === "high";
}

const REVIEW_JSON_EXAMPLE = {
  headline: "Uniswap requested a V4 swap on Ethereum Mainnet",
  plainEnglishSummary: "The DApp is asking the wallet to review a recognized request before anything is forwarded.",
  userIntentMatch: "unclear",
  mainRisks: ["Route details are partially decoded; verify the final wallet prompt."],
  questionsToAskBeforeSigning: ["Does the final wallet prompt show the same value, router, and chain?"],
  whyPolicyDecisionMakesSense: "Recognized requests can still need user review when route details are partial.",
  scamPatternHints: ["No concrete scam pattern found by local AI. Still verify the DApp, chain, amount, and final wallet prompt."],
  confidence: "medium",
} satisfies AiTransactionReview;

function validateAiTransactionReview(parsed: Record<string, unknown>): AiTransactionReview {
  if (
    typeof parsed.headline !== "string" ||
    typeof parsed.plainEnglishSummary !== "string" ||
    !isReviewMatch(parsed.userIntentMatch) ||
    !isStringArray(parsed.mainRisks) ||
    !isStringArray(parsed.questionsToAskBeforeSigning) ||
    typeof parsed.whyPolicyDecisionMakesSense !== "string" ||
    !isStringArray(parsed.scamPatternHints) ||
    !isConfidence(parsed.confidence)
  ) {
    throw new Error("Local AI returned JSON that does not match the review schema.");
  }
  return {
    headline: parsed.headline,
    plainEnglishSummary: parsed.plainEnglishSummary,
    userIntentMatch: parsed.userIntentMatch,
    mainRisks: parsed.mainRisks,
    questionsToAskBeforeSigning: parsed.questionsToAskBeforeSigning,
    whyPolicyDecisionMakesSense: parsed.whyPolicyDecisionMakesSense,
    scamPatternHints: parsed.scamPatternHints,
    confidence: parsed.confidence,
  };
}

function normalizeReviewText(value: string, fallback: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function sanitizeUnsignedRequestLanguage(text: string) {
  return text
    .replace(/\bintent does not match\b/gi, "no explicit user intent was provided")
    .replace(/\bhas been executed\b/gi, "has been requested")
    .replace(/\bwas executed\b/gi, "was requested")
    .replace(/\bhas executed\b/gi, "has requested")
    .replace(/\bexecuted\b/gi, "requested")
    .replace(/\bexecuting\b/gi, "asking to run")
    .replace(/\bwill execute\b/gi, "would run");
}

function removePlaceholderItems(items: string[]) {
  return items
    .map((item) => sanitizeUnsignedRequestLanguage(item.trim()))
    .filter(Boolean)
    .filter(
      (item) =>
        !/one concrete risk|one question|no extra questions suggested|one relevant scam pattern/i.test(
          item,
        ),
    );
}

function isUniswapPartialV4(packet: AiTransactionReviewPacket) {
  return (
    packet.understanding.protocolName === "Uniswap" &&
    packet.understanding.actionKind === "swap" &&
    packet.understanding.decodeQuality === "partial-protocol-decode"
  );
}

export function sanitizeAiReviewForUnsignedRequest(
  review: AiTransactionReview,
  packet: AiTransactionReviewPacket,
): AiTransactionReview {
  const mainRisks = removePlaceholderItems(review.mainRisks);
  const questions = removePlaceholderItems(review.questionsToAskBeforeSigning);
  const scamHints = removePlaceholderItems(review.scamPatternHints);
  const noIntent = !packet.hasExplicitUserIntent;
  const defaultScamHint =
    "No concrete scam pattern found by local AI. Still verify the DApp, chain, amount, and final wallet prompt.";
  const partialV4 = isUniswapPartialV4(packet);
  return {
    headline: sanitizeUnsignedRequestLanguage(
      partialV4
        ? `Uniswap requested a V4 swap on ${packet.chain}`
        : review.headline.length > 90 && packet.viewModel.rowTitle
          ? packet.viewModel.rowTitle
          : review.headline,
    ),
    plainEnglishSummary: sanitizeUnsignedRequestLanguage(
      `${noIntent ? "No explicit user intent was provided. " : ""}${review.plainEnglishSummary}`,
    ),
    userIntentMatch:
      noIntent && review.userIntentMatch === "does_not_match"
        ? "unclear"
        : noIntent
          ? "unclear"
          : review.userIntentMatch,
    mainRisks: mainRisks.length
      ? mainRisks
      : partialV4
        ? [
            "IntentProof recognizes the Universal Router and V4 action, but cannot fully display token out, minimum received, or recipient yet.",
          ]
        : ["No concrete risk beyond normal wallet review was found in the normalized packet."],
    questionsToAskBeforeSigning: questions.length
      ? questions
      : partialV4
        ? [
            "Is this the pair you selected in Uniswap?",
            "Is the minimum received acceptable?",
            "Does the final imToken prompt show the same value and router?",
          ]
        : [
            "Do you recognize this DApp and did you initiate this action?",
            "Do the chain, amount, target, and final wallet prompt match what you expect?",
          ],
    whyPolicyDecisionMakesSense: sanitizeUnsignedRequestLanguage(
      noIntent && /intent does not match/i.test(review.whyPolicyDecisionMakesSense)
        ? "No explicit user intent was provided, so IntentProof treats intent match as unclear and relies on deterministic request evidence."
        : review.whyPolicyDecisionMakesSense,
    ),
    scamPatternHints: scamHints.length ? scamHints : [defaultScamHint],
    confidence: review.confidence,
  };
}

function userFacingFallbackReason(reason: string) {
  if (/not a transaction review object|valid review JSON/i.test(reason)) {
    return "The local model returned text that did not match IntentProof's structured review schema.";
  }
  if (/empty response/i.test(reason)) {
    return "The local model returned an empty structured review.";
  }
  return reason.replace(/\s*Try again or choose another local model\.\s*/gi, "").trim();
}

function fallbackReviewFromPacket(
  packet: AiTransactionReviewPacket,
  reason: string,
  modelSentence?: string,
): AiTransactionReview {
  const risks = [
    ...packet.blockers,
    ...packet.warnings,
    ...packet.policyReasons.filter((item) =>
      /mainnet|approval|unlimited|unknown|undecod|revert|bridge|simulation/i.test(item),
    ),
  ];
  const mainRisks = Array.from(new Set(risks)).slice(0, 5);
  const isWrite = packet.method === "eth_sendTransaction";
  const summaryParts = [
    `${packet.requestSource} requested ${packet.method} on ${packet.chain}.`,
    packet.decodedFunction ? `Decoded function: ${packet.decodedFunction}.` : undefined,
    packet.amount ? `Amount or value: ${packet.amount}.` : undefined,
    packet.recipient ? `Recipient or target: ${packet.recipient}.` : undefined,
    packet.spender ? `Spender: ${packet.spender}.` : undefined,
    packet.assetDeltaSummary ? `Simulation asset changes: ${packet.assetDeltaSummary}.` : undefined,
    packet.simulationAvailable
      ? "Execution simulation evidence is available, but it does not prove the request is benign."
      : "Execution simulation is not available for this packet.",
  ].filter(Boolean);

  const modelNote = modelSentence?.trim()
    ? ` Local model note: ${modelSentence.trim()}`
    : "";
  const fallbackReason = userFacingFallbackReason(reason);

  return {
    headline: packet.understanding.actionTitle
      ? isUniswapPartialV4(packet)
        ? `Uniswap requested a V4 swap on ${packet.chain}`
        : `${packet.understanding.protocolName}: ${packet.understanding.actionTitle}`
      : "Review generated from normalized evidence",
    plainEnglishSummary: sanitizeUnsignedRequestLanguage(
      `${!packet.hasExplicitUserIntent ? "No explicit user intent was provided. " : ""}${packet.understanding.userSummary} ${summaryParts.join(" ")}${modelNote} IntentProof produced this advisory fallback from the same normalized packet because ${fallbackReason}`,
    ),
    userIntentMatch: !packet.hasExplicitUserIntent
      ? "unclear"
      : packet.policyDecision === "BLOCK"
        ? "does_not_match"
        : packet.warnings.length || packet.blockers.length
          ? "partially_matches"
          : "matches",
    mainRisks: isUniswapPartialV4(packet)
      ? [
          "IntentProof recognizes the Universal Router and V4 action, but cannot fully display token out, minimum received, or recipient yet.",
        ]
      : mainRisks.length
      ? mainRisks
      : [
          isWrite
            ? "This is a write request. Confirm the DApp, chain, target, value, and decoded method in the connected wallet."
            : "No additional deterministic risk was found in the normalized packet.",
        ],
    questionsToAskBeforeSigning: isUniswapPartialV4(packet)
      ? [
          "Is this the pair you selected in Uniswap?",
          "Is the minimum received acceptable?",
          "Does the final imToken prompt show the same value and router?",
        ]
      : [
          "Do you recognize this DApp and did you initiate this action?",
          packet.isMainnet
            ? "Are you comfortable using real mainnet assets for this request?"
            : "Is this the intended network?",
          packet.isUnlimitedApproval
            ? "Do you want to grant an unlimited token approval?"
            : "Do the amount, recipient, and method match what you expected?",
        ],
    whyPolicyDecisionMakesSense: normalizeReviewText(
      packet.understanding.riskReasons[0] ?? packet.policyReasons[0] ?? "",
      "IntentProof keeps deterministic policy and wallet review as the authority.",
    ),
    scamPatternHints: [
      packet.isUnlimitedApproval
        ? "Unlimited approvals can be abused later if the spender is malicious or compromised."
        : "No concrete scam pattern found by local AI. Still verify the DApp, chain, amount, and final wallet prompt.",
    ],
    confidence:
      packet.understanding.decodeQuality === "unknown" || packet.blockers.length
        ? "low"
        : packet.understanding.decodeQuality === "partial-protocol-decode" ||
            packet.warnings.length ||
            !packet.simulationAvailable
          ? "medium"
          : "high",
  };
}

function normalizeOneSentenceFallback(output: string) {
  const withoutFences = output
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!withoutFences) return undefined;
  const firstSentence =
    withoutFences.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? withoutFences;
  return firstSentence.length > 260
    ? `${firstSentence.slice(0, 257).trimEnd()}...`
    : firstSentence;
}

async function askLocalModelForOneSentenceReview(params: {
  engine: WebLlmEngine;
  packet: AiTransactionReviewPacket;
  reason: string;
}): Promise<string | undefined> {
  try {
    const response = await params.engine.chat.completions.create({
      temperature: 0,
      max_tokens: 96,
      messages: [
        {
          role: "system",
          content:
            "You explain wallet transaction review packets in one plain English sentence. Do not return JSON, markdown, schema text, bullets, or labels.",
        },
        {
          role: "user",
          content: [
            "The previous JSON response was invalid.",
            "Give exactly one plain English sentence summarizing the main thing the user should check before signing.",
            `Previous failure: ${params.reason}`,
            "Normalized packet:",
            JSON.stringify(params.packet),
          ].join("\n"),
        },
      ],
    });
    const content = response.choices?.[0]?.message?.content;
    return content ? normalizeOneSentenceFallback(content) : undefined;
  } catch {
    return undefined;
  }
}

function findJsonObjectCandidates(output: string): string[] {
  const candidates: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < output.length; index += 1) {
    const char = output[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(output.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return candidates;
}

export function parseAiTransactionReviewOutput(output: string): AiTransactionReview {
  const trimmed = output.trim();
  const candidates = [trimmed, ...findJsonObjectCandidates(trimmed)];
  let sawJson = false;
  let sawInvalidReviewJson = false;

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      sawJson = true;
      return validateAiTransactionReview(parsed);
    } catch (error) {
      if (error instanceof SyntaxError) continue;
      sawInvalidReviewJson = true;
      continue;
    }
  }

  if (sawJson || sawInvalidReviewJson) {
    throw new Error("Local AI returned JSON, but it was not a transaction review object.");
  }
  throw new Error("Local AI did not return valid review JSON.");
}

export async function runBrowserAiTransactionReview(params: {
  modelId: string;
  packet: AiTransactionReviewPacket;
  onProgress?: (progress: BrowserAiProgress) => void;
}): Promise<AiTransactionReview> {
  if (typeof navigator === "undefined" || !("gpu" in navigator)) {
    throw new Error("Browser AI review needs WebGPU support.");
  }

  const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
  if (!engineCache || engineCache.modelId !== params.modelId) {
    const engine = await CreateMLCEngine(params.modelId, {
      initProgressCallback: (progress: BrowserAiProgress) => {
        params.onProgress?.(progress);
      },
    });
    engineCache = { modelId: params.modelId, engine: engine as WebLlmEngine };
  }

  const response = await engineCache.engine.chat.completions.create({
    temperature: 0,
    max_tokens: 420,
    messages: [
      {
        role: "system",
        content:
          "You are an in-browser transaction review assistant. You never decide whether to sign. You only explain the normalized IntentProof review packet. Return exactly one valid JSON object and no markdown, labels, schema text, or commentary.",
      },
      {
        role: "user",
        content: [
          "Review the normalized IntentProof packet below.",
          "Use the transactionUnderstanding object as the source of truth for protocol, action, decode quality, asset authority, and risk.",
          "Use decoded fields, policy reasons, warnings, blockers, and simulation summaries only as supporting evidence.",
          "If hasExplicitUserIntent is false, userIntentMatch must be unclear. Do not infer mismatch from missing user intent.",
          "Do not use does_not_match unless hasExplicitUserIntent is true and there is a concrete mismatch.",
          "This request has not been forwarded or signed yet. Do not say executed, completed, or happened. Use requested, is asking to, would send, or would grant.",
          "Do not call a recognized standard swap malicious only because it is mainnet or simulation is unavailable.",
          "For a Uniswap partial V4 decode, use headline 'Uniswap requested a V4 swap on Ethereum Mainnet' with intent match unclear unless explicit user intent is present.",
          "If no scam pattern is found, use: No concrete scam pattern found by local AI. Still verify the DApp, chain, amount, and final wallet prompt.",
          "Return JSON with these exact keys: headline, plainEnglishSummary, userIntentMatch, mainRisks, questionsToAskBeforeSigning, whyPolicyDecisionMakesSense, scamPatternHints, confidence.",
          `Allowed userIntentMatch values: matches, partially_matches, does_not_match, unclear.`,
          `Allowed confidence values: low, medium, high.`,
          `Example shape: ${JSON.stringify(REVIEW_JSON_EXAMPLE)}`,
          "Packet JSON:",
          JSON.stringify(params.packet),
        ].join("\n"),
      },
    ],
  });
  const content = response.choices?.[0]?.message?.content;
  if (!content) {
    const modelSentence = await askLocalModelForOneSentenceReview({
      engine: engineCache.engine,
      packet: params.packet,
      reason: "The model returned an empty response.",
    });
    return sanitizeAiReviewForUnsignedRequest(fallbackReviewFromPacket(
      params.packet,
      "The model returned an empty response.",
      modelSentence,
    ), params.packet);
  }
  try {
    return sanitizeAiReviewForUnsignedRequest(parseAiTransactionReviewOutput(content), params.packet);
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "The model output could not be parsed.";
    const modelSentence = await askLocalModelForOneSentenceReview({
      engine: engineCache.engine,
      packet: params.packet,
      reason,
    });
    return sanitizeAiReviewForUnsignedRequest(fallbackReviewFromPacket(
      params.packet,
      reason,
      modelSentence,
    ), params.packet);
  }
}

export async function clearBrowserAiModelCache(
  modelIds = BROWSER_AI_MODEL_OPTIONS.map((model) => model.id),
): Promise<BrowserAiCacheClearResult> {
  const uniqueModelIds = Array.from(new Set(modelIds.filter(Boolean)));

  if (engineCache && uniqueModelIds.includes(engineCache.modelId)) {
    try {
      await engineCache.engine.unload?.();
    } finally {
      engineCache = undefined;
    }
  }

  const { deleteModelAllInfoInCache } = await import("@mlc-ai/web-llm");
  const result: BrowserAiCacheClearResult = {
    clearedModelIds: [],
    failedModelIds: [],
  };

  for (const modelId of uniqueModelIds) {
    try {
      await deleteModelAllInfoInCache(modelId);
      result.clearedModelIds.push(modelId);
    } catch (error) {
      result.failedModelIds.push({
        modelId,
        message:
          error instanceof Error
            ? error.message
            : "Browser did not allow deleting this local model cache.",
      });
    }
  }

  return result;
}

export function buildBatchAiReview(params: {
  reviews: Array<{
    requestId: string;
    policyDecision: AiTransactionReviewPacket["policyDecision"];
    review: AiTransactionReview;
  }>;
}): BatchAiReview {
  const assessed = params.reviews.map((item) => {
    const joinedSignals = [
      item.review.plainEnglishSummary,
      ...item.review.mainRisks,
      ...item.review.scamPatternHints,
      item.review.whyPolicyDecisionMakesSense,
    ].join(" ");
    const highSignal =
      item.policyDecision === "BLOCK" ||
      /unlimited|revert|unknown|undecod|phishing|drain|suspicious|malicious|unsupported|bridge/i.test(
        joinedSignals,
      );
    const attentionLevel: "routine" | "review" | "high" = highSignal
      ? "high"
      : item.review.mainRisks.length ||
          item.review.questionsToAskBeforeSigning.length ||
          item.policyDecision === "WARN" ||
          item.review.confidence !== "high"
        ? "review"
        : "routine";
    const judgement =
      attentionLevel === "high"
        ? "High-risk or blocked signal found; do not treat this as safe without wallet-level verification."
        : attentionLevel === "review"
          ? "No concrete scam pattern found by local AI, but the request still needs user review."
          : "No concrete scam pattern found in the normalized packet.";
    return {
      ...item,
      attentionLevel,
      judgement,
    };
  });
  const highCount = assessed.filter((item) => item.attentionLevel === "high").length;
  const reviewNeededCount = assessed.filter((item) => item.attentionLevel === "review").length;
  const reviewCount = params.reviews.length;
  return {
    overallHeadline: highCount
      ? `${highCount} request${highCount === 1 ? "" : "s"} need extra attention`
      : reviewNeededCount
        ? `${reviewNeededCount} request${reviewNeededCount === 1 ? "" : "s"} need normal wallet review`
        : "No concrete scam pattern found in open requests",
    overallSummary: reviewCount
      ? highCount
        ? `Local AI found high-risk or blocked signals in ${highCount}/${reviewCount} normalized packet${reviewCount === 1 ? "" : "s"}. It cannot prove maliciousness, but these requests should not be forwarded without resolving the listed issues.`
        : `Local AI found no concrete scam pattern in ${reviewCount} normalized packet${reviewCount === 1 ? "" : "s"}. This is not a safety guarantee; still verify DApp, chain, amounts, target, and wallet prompt.`
      : "There are no non-routine open requests for local AI review.",
    requests: assessed.map((item) => ({
      requestId: item.requestId,
      headline: item.review.headline,
      attentionLevel: item.attentionLevel,
      judgement: item.judgement,
      summary: item.review.plainEnglishSummary,
    })),
  };
}
