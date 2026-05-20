import { formatUnits } from "viem";

import { getChainConfig } from "../chains";
import type {
  LiveAssetChangeEvidence,
  LivePolicyDecision,
  LiveRequest,
} from "./types";

export interface AiTransactionReviewPacket {
  mode: "preview" | "testnet" | "live";
  requestSource: string;
  userIntent: string;
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
    summary: string;
  }>;
}

export interface BrowserAiModelOption {
  id: string;
  label: string;
  approximateSize: string;
  note: string;
}

export interface BrowserAiProgress {
  text?: string;
  progress?: number;
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
    note: "Largest option kept under the 1 GB local-model budget.",
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
    userIntent:
      params.userIntent?.trim() ||
      "No explicit natural-language intent was provided for this live DApp request.",
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
  headline: "Short review headline",
  plainEnglishSummary: "Explain what the normalized packet says in plain English.",
  userIntentMatch: "unclear",
  mainRisks: ["One concrete risk or missing evidence"],
  questionsToAskBeforeSigning: ["One question the user should answer"],
  whyPolicyDecisionMakesSense: "Explain why the deterministic policy result fits.",
  scamPatternHints: ["One relevant scam pattern or an empty array"],
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

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      sawJson = true;
      return validateAiTransactionReview(parsed);
    } catch (error) {
      if (error instanceof SyntaxError) continue;
    }
  }

  if (sawJson) {
    throw new Error(
      "Local AI returned JSON, but it was not a transaction review object. Try again or choose another local model.",
    );
  }
  throw new Error(
    "Local AI did not return valid review JSON. Try again or choose another local model.",
  );
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
          "Use only decoded fields, policy reasons, warnings, blockers, and simulation summaries from the packet.",
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
  if (!content) throw new Error("Local AI did not return a review.");
  return parseAiTransactionReviewOutput(content);
}

export function buildBatchAiReview(params: {
  reviews: Array<{
    requestId: string;
    policyDecision: AiTransactionReviewPacket["policyDecision"];
    review: AiTransactionReview;
  }>;
}): BatchAiReview {
  const highCount = params.reviews.filter(
    (item) =>
      item.policyDecision === "BLOCK" ||
      item.review.confidence === "low" ||
      item.review.mainRisks.some((risk) => /unlimited|revert|unknown|undecod/i.test(risk)),
  ).length;
  const reviewCount = params.reviews.length;
  return {
    overallHeadline: highCount
      ? `${highCount} request${highCount === 1 ? "" : "s"} need extra attention`
      : "Open requests have readable review packets",
    overallSummary: reviewCount
      ? `Local AI reviewed ${reviewCount} normalized IntentProof packet${reviewCount === 1 ? "" : "s"}. This is advisory only; deterministic policy and wallet review still control forwarding.`
      : "There are no non-routine open requests for local AI review.",
    requests: params.reviews.map((item) => ({
      requestId: item.requestId,
      headline: item.review.headline,
      attentionLevel:
        item.policyDecision === "BLOCK" || item.review.confidence === "low"
          ? "high"
          : item.review.mainRisks.length
            ? "review"
            : "routine",
      summary: item.review.plainEnglishSummary,
    })),
  };
}
