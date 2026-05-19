import { parseEther, parseUnits, type Address } from "viem";

import { getChainConfig, getTokenPresets } from "./chains";
import { getRuntimeEnv } from "./env";
import { shortenAddress } from "./format";
import { parsePolicyDocument } from "./policy";
import { retry, withTimeout } from "./resilience";
import { createTemplateTransaction } from "./templates";
import type {
  AnalysisResult,
  DemoChainKey,
  PolicyDocument,
  PreparedTx,
  TemplateFormValues,
} from "./types";
import defaultRiskPolicyJson from "../policies/default-risk-policy.json";

export type IntentScenarioId =
  | "safe-transfer"
  | "unlimited-approval"
  | "weth-wrap"
  | "swap-policy"
  | "bridge-mismatch";

export type IntentProofMode = "demo" | "testnet";

export type IntentAction =
  | "transfer"
  | "approve"
  | "wrap"
  | "swap"
  | "bridge"
  | "unknown";

export type IntentDecisionSeverity =
  | "pass"
  | "info"
  | "warn"
  | "danger"
  | "block";

export interface IntentScenario {
  id: IntentScenarioId;
  label: string;
  outcome: "PASS" | "BLOCK" | "WARN/BLOCK";
  intent: string;
}

export interface ParsedWalletIntent {
  raw: string;
  action: IntentAction;
  chainKey?: DemoChainKey;
  allowedChains?: DemoChainKey[];
  forbiddenChains: DemoChainKey[];
  assetSymbol?: "ETH" | "WETH" | "USDC";
  amount?: string;
  recipientLabel?: string;
  recipientAddress?: Address;
  forbidBridge: boolean;
  forbidApprovals: boolean;
  forbidUnlimitedApprovals: boolean;
  maxGasUsd?: number;
  maxSlippageBps?: number;
  requireVerifiedContract?: boolean;
  requireTrustedRecipient?: boolean;
}

export type AgentFirewallPreset = "Beginner Safe" | "Agent Limited" | "Power User";

export interface AgentFirewallSettings {
  preset: AgentFirewallPreset;
  allowedChains: DemoChainKey[];
  maxSpendUsd: number;
  dailySpendCapUsd: number;
  usdcSpendCap: string;
  ethSpendCap: string;
  gasCapUsd: number;
  maxSlippageBps: number;
  forbidBridge: boolean;
  forbidUnlimitedApprovals: boolean;
  requireVerifiedContract: boolean;
  requireFirstInteractionConfirmation: boolean;
  trustedRecipientsOnly: boolean;
}

export interface RouteMetadata {
  label: string;
  sourceChainKey: DemoChainKey;
  targetChainKey: DemoChainKey;
  usesBridge: boolean;
  approvalIsUnlimited: boolean;
  slippageBps?: number;
  trustedRecipientMatch: boolean;
  firstInteraction: boolean;
  deterministicNotes: string[];
}

export interface IntentProofPlan {
  scenarioId?: IntentScenarioId;
  mode: IntentProofMode;
  parserSource: "local" | "gemini" | "groq";
  intent: string;
  parsedIntent: ParsedWalletIntent;
  firewall: AgentFirewallSettings;
  policyDocument: PolicyDocument;
  preparedTx: PreparedTx;
  route: RouteMetadata;
  expectedOutcome: string;
  actualTransaction: string;
  estimatedGasUsd: number;
}

export interface IntentDecisionIssue {
  severity: Exclude<IntentDecisionSeverity, "pass">;
  title: string;
  description: string;
}

export interface IntentProofDecision {
  severity: IntentDecisionSeverity;
  label: string;
  summary: string;
  signState: "enabled" | "ackRequired" | "disabled";
  issues: IntentDecisionIssue[];
}

export interface AddressPoisoningResult {
  severity: "pass" | "warn";
  trustedLabel?: string;
  message: string;
}

export interface IntentProofReceipt {
  title: "IntentProof Receipt";
  intent: string;
  mode: IntentProofMode;
  decision: string;
  chain: string;
  action: string;
  token?: string;
  amount?: string;
  recipient?: string;
  policyChecks: string[];
  tokenCoreAnalysis: "completed" | "not-run";
  signed: boolean;
  broadcast: boolean;
  predictedTxHash?: string;
  broadcastTxHash?: string;
  timestamp: string;
}

const MAX_UINT256 = 2n ** 256n - 1n;
const DEFAULT_SIGNER =
  "0x7777777777777777777777777777777777777777" as const;
export const SAVED_VENDOR_ADDRESS =
  "0x1111111111111111111111111111111111111111" as const;
export const LOOKALIKE_VENDOR_ADDRESS =
  "0x1111112222222222222222222222222222111111" as const;
const DEMO_SPENDER =
  "0x9999999999999999999999999999999999999999" as const;
const BASE_ROUTE_RECIPIENT =
  "0x2222222222222222222222222222222222222222" as const;
const ALL_CHAIN_KEYS: readonly DemoChainKey[] = [
  "sepolia",
  "baseSepolia",
  "ethereum",
  "base",
] as const;
const IS_BROWSER = typeof window !== "undefined";
const GROQ_URL = IS_BROWSER
  ? "/api/groq/openai/v1/chat/completions"
  : "https://api.groq.com/openai/v1/chat/completions";

export const intentScenarios: IntentScenario[] = [
  {
    id: "safe-transfer",
    label: "Safe ERC-20 transfer",
    outcome: "PASS",
    intent:
      "Send 5 USDC to my saved vendor on Sepolia. Do not approve anything. Max gas $1.",
  },
  {
    id: "unlimited-approval",
    label: "Unlimited approval",
    outcome: "BLOCK",
    intent: "Swap 10 USDC to ETH, but never allow unlimited approvals.",
  },
  {
    id: "weth-wrap",
    label: "WETH wrap",
    outcome: "PASS",
    intent: "Wrap 0.01 ETH into WETH on Sepolia. Do not bridge. Max gas $1.",
  },
  {
    id: "swap-policy",
    label: "Swap route policy",
    outcome: "WARN/BLOCK",
    intent:
      "Swap 10 USDC to ETH with max slippage 0.5%. Do not approve unlimited amounts.",
  },
  {
    id: "bridge-mismatch",
    label: "Bridge / chain mismatch",
    outcome: "BLOCK",
    intent: "Send 5 USDC on Sepolia. Do not bridge and do not use Base.",
  },
];

export const firewallPresets: Record<AgentFirewallPreset, AgentFirewallSettings> = {
  "Beginner Safe": {
    preset: "Beginner Safe",
    allowedChains: ["sepolia"],
    maxSpendUsd: 50,
    dailySpendCapUsd: 50,
    usdcSpendCap: "10",
    ethSpendCap: "0.02",
    gasCapUsd: 1,
    maxSlippageBps: 50,
    forbidBridge: true,
    forbidUnlimitedApprovals: true,
    requireVerifiedContract: true,
    requireFirstInteractionConfirmation: true,
    trustedRecipientsOnly: true,
  },
  "Agent Limited": {
    preset: "Agent Limited",
    allowedChains: ["sepolia", "baseSepolia"],
    maxSpendUsd: 50,
    dailySpendCapUsd: 100,
    usdcSpendCap: "25",
    ethSpendCap: "0.05",
    gasCapUsd: 1.5,
    maxSlippageBps: 50,
    forbidBridge: true,
    forbidUnlimitedApprovals: true,
    requireVerifiedContract: true,
    requireFirstInteractionConfirmation: true,
    trustedRecipientsOnly: true,
  },
  "Power User": {
    preset: "Power User",
    allowedChains: ["sepolia", "baseSepolia"],
    maxSpendUsd: 250,
    dailySpendCapUsd: 500,
    usdcSpendCap: "100",
    ethSpendCap: "0.2",
    gasCapUsd: 5,
    maxSlippageBps: 100,
    forbidBridge: false,
    forbidUnlimitedApprovals: true,
    requireVerifiedContract: false,
    requireFirstInteractionConfirmation: true,
    trustedRecipientsOnly: false,
  },
};

export const defaultFirewallSettings: AgentFirewallSettings =
  firewallPresets["Beginner Safe"];

export const trustedRecipients = [
  {
    label: "Saved vendor",
    address: SAVED_VENDOR_ADDRESS,
  },
];

function parseNumericMatch(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  if (!match?.[1]) return undefined;
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function detectAmount(text: string) {
  const match = text.match(/(?:send|swap|wrap)\s+(\d+(?:\.\d+)?)/i);
  return match?.[1];
}

export function parseWalletIntent(raw: string): ParsedWalletIntent {
  const normalized = raw.toLowerCase();
  const forbidsBase = /do not use base|never use base|no base/.test(
    normalized,
  );
  const forbidsMainnet =
    /do not use mainnet|never use mainnet|no mainnet|testnet only/.test(
      normalized,
    );
  const sepoliaOnly = /sepolia only|only use sepolia/.test(normalized);
  const mentionsSepolia = /\bsepolia\b/.test(normalized);
  const mentionsEthereumMainnet =
    /\bethereum mainnet\b|\beth mainnet\b|\bmainnet\b/.test(normalized) &&
    !forbidsMainnet &&
    !mentionsSepolia;
  const mentionsBaseMainnet =
    /\bbase mainnet\b/.test(normalized) && !forbidsBase && !forbidsMainnet;
  const mentionsBaseAsTarget =
    /\bon base\b|\bbase sepolia\b|\buse base\b/.test(normalized) &&
    !mentionsBaseMainnet &&
    !forbidsBase;
  const chainKey: DemoChainKey | undefined = mentionsSepolia
    ? "sepolia"
    : mentionsBaseMainnet
      ? "base"
      : mentionsEthereumMainnet
        ? "ethereum"
    : mentionsBaseAsTarget
      ? "baseSepolia"
      : undefined;
  const forbiddenChains: DemoChainKey[] = [];
  if (forbidsBase) {
    forbiddenChains.push("baseSepolia");
    forbiddenChains.push("base");
  }
  if (forbidsMainnet) {
    forbiddenChains.push("ethereum");
    forbiddenChains.push("base");
  }
  const allowedChains: DemoChainKey[] | undefined =
    sepoliaOnly || forbidsBase
      ? (["sepolia"] as DemoChainKey[])
      : chainKey
        ? [chainKey]
        : undefined;

  const action: IntentAction =
    /\bbridge\b/.test(normalized) &&
    !/do not bridge|never bridge|no bridge/.test(normalized)
      ? "bridge"
      : normalized.includes("wrap")
        ? "wrap"
        : normalized.includes("swap")
          ? "swap"
          : normalized.includes("send")
            ? "transfer"
            : normalized.includes("approve")
              ? "approve"
              : "unknown";

  const assetSymbol = normalized.includes("usdc")
    ? "USDC"
    : normalized.includes("weth")
      ? "WETH"
      : normalized.includes("eth")
        ? "ETH"
        : undefined;

  const maxSlippagePercent = parseNumericMatch(
    normalized,
    /max slippage\s*(\d+(?:\.\d+)?)\s*%/,
  );

  return {
    raw,
    action,
    chainKey,
    allowedChains,
    forbiddenChains,
    assetSymbol,
    amount: detectAmount(raw),
    recipientLabel: normalized.includes("saved vendor")
      ? "Saved vendor"
      : undefined,
    recipientAddress: normalized.includes("saved vendor")
      ? SAVED_VENDOR_ADDRESS
      : undefined,
    forbidBridge: /do not bridge|never bridge|no bridge/.test(normalized),
    forbidApprovals:
      /do not approve anything|no approvals?\b|never approve anything/.test(
        normalized,
      ),
    forbidUnlimitedApprovals:
      /do not approve anything|never allow unlimited|do not allow unlimited|no unlimited|unlimited approvals?|do not approve unlimited/.test(
        normalized,
      ),
    maxGasUsd: parseNumericMatch(normalized, /max gas\s*\$?\s*(\d+(?:\.\d+)?)/),
    maxSlippageBps:
      maxSlippagePercent === undefined
        ? undefined
        : Math.round(maxSlippagePercent * 100),
    requireVerifiedContract: /verified contracts?|verified contract only/.test(
      normalized,
    ),
    requireTrustedRecipient:
      /saved vendor|trusted recipient|address book/.test(normalized),
  };
}

function parserPrompt(raw: string) {
  return [
    "Extract a wallet intent into strict JSON only.",
    "Allowed action values: transfer, approve, wrap, swap, bridge, unknown.",
    "Allowed assetSymbol values: ETH, WETH, USDC.",
    "Allowed chainKey values: sepolia, baseSepolia, ethereum, base.",
    "Return keys: action, chainKey, allowedChains, forbiddenChains, assetSymbol, amount, recipientLabel, forbidBridge, forbidApprovals, forbidUnlimitedApprovals, maxGasUsd, maxSlippageBps.",
    "Do not invent calldata or addresses.",
    `Intent: ${raw}`,
  ].join("\n");
}

function parseAiJson(text: string) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return undefined;
  try {
    return JSON.parse(jsonMatch[0]) as Partial<ParsedWalletIntent>;
  } catch {
    return undefined;
  }
}

function normalizeAiIntent(
  raw: string,
  base: ParsedWalletIntent,
  candidate: Partial<ParsedWalletIntent> | undefined,
): ParsedWalletIntent | undefined {
  if (!candidate) return undefined;
  return {
    ...base,
    raw,
    action:
      candidate.action === "transfer" ||
      candidate.action === "approve" ||
      candidate.action === "wrap" ||
      candidate.action === "swap" ||
      candidate.action === "bridge" ||
      candidate.action === "unknown"
        ? candidate.action
        : base.action,
    chainKey:
      ALL_CHAIN_KEYS.includes(candidate.chainKey as DemoChainKey)
        ? candidate.chainKey
        : base.chainKey,
    forbiddenChains: Array.isArray(candidate.forbiddenChains)
      ? candidate.forbiddenChains.filter(
          (item): item is DemoChainKey =>
            ALL_CHAIN_KEYS.includes(item as DemoChainKey),
        )
      : base.forbiddenChains,
    allowedChains: Array.isArray(candidate.allowedChains)
      ? candidate.allowedChains.filter(
          (item): item is DemoChainKey =>
            ALL_CHAIN_KEYS.includes(item as DemoChainKey),
        )
      : base.allowedChains,
    assetSymbol:
      candidate.assetSymbol === "ETH" ||
      candidate.assetSymbol === "WETH" ||
      candidate.assetSymbol === "USDC"
        ? candidate.assetSymbol
        : base.assetSymbol,
    amount:
      typeof candidate.amount === "string" ? candidate.amount : base.amount,
    recipientLabel:
      typeof candidate.recipientLabel === "string"
        ? candidate.recipientLabel
        : base.recipientLabel,
    forbidBridge:
      typeof candidate.forbidBridge === "boolean"
        ? candidate.forbidBridge
        : base.forbidBridge,
    forbidApprovals:
      typeof candidate.forbidApprovals === "boolean"
        ? candidate.forbidApprovals
        : base.forbidApprovals,
    forbidUnlimitedApprovals:
      typeof candidate.forbidUnlimitedApprovals === "boolean"
        ? candidate.forbidUnlimitedApprovals
        : base.forbidUnlimitedApprovals,
    maxGasUsd:
      typeof candidate.maxGasUsd === "number"
        ? candidate.maxGasUsd
        : base.maxGasUsd,
    maxSlippageBps:
      typeof candidate.maxSlippageBps === "number"
        ? candidate.maxSlippageBps
        : base.maxSlippageBps,
  };
}

async function parseWithGemini(raw: string, base: ParsedWalletIntent) {
  const apiKey = getRuntimeEnv("VITE_GEMINI_API_KEY");
  if (!apiKey) return undefined;

  const response = await retry(
    () =>
      withTimeout(
        () =>
          fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [
                  { role: "user", parts: [{ text: parserPrompt(raw) }] },
                ],
                generationConfig: {
                  temperature: 0,
                  maxOutputTokens: 240,
                },
              }),
            },
          ),
        8000,
        "Gemini intent parser timed out.",
      ),
    { retries: 1, delayMs: 500 },
  ).catch(() => undefined);

  if (!response?.ok) return undefined;
  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter(Boolean)
    .join("\n");
  return normalizeAiIntent(raw, base, parseAiJson(text ?? ""));
}

async function parseWithGroq(raw: string, base: ParsedWalletIntent) {
  const apiKey = getRuntimeEnv("VITE_GROQ_API_KEY");
  if (!apiKey) return undefined;

  const response = await retry(
    () =>
      withTimeout(
        () =>
          fetch(GROQ_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile",
              temperature: 0,
              max_completion_tokens: 240,
              messages: [{ role: "user", content: parserPrompt(raw) }],
            }),
          }),
        8000,
        "Groq intent parser timed out.",
      ),
    { retries: 1, delayMs: 500 },
  ).catch(() => undefined);

  if (!response?.ok) return undefined;
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return normalizeAiIntent(
    raw,
    base,
    parseAiJson(data.choices?.[0]?.message?.content ?? ""),
  );
}

export async function parseWalletIntentWithAiFallback(
  raw: string,
  options: { remote?: boolean } = {},
): Promise<{
  intent: ParsedWalletIntent;
  source: "local" | "gemini" | "groq";
}> {
  const local = parseWalletIntent(raw);
  if (!options.remote) return { intent: local, source: "local" };

  const gemini = await parseWithGemini(raw, local);
  if (gemini) return { intent: gemini, source: "gemini" };

  const groq = await parseWithGroq(raw, local);
  if (groq) return { intent: groq, source: "groq" };

  return { intent: local, source: "local" };
}

function getUsdcToken(chainKey: DemoChainKey) {
  const token = getTokenPresets(chainKey).find((item) => item.symbol === "USDC");
  if (!token) throw new Error(`USDC preset is missing for ${chainKey}.`);
  return token;
}

function stringifyWithBigInt(value: unknown) {
  return JSON.stringify(
    value,
    (_key, currentValue) =>
      typeof currentValue === "bigint" ? currentValue.toString() : currentValue,
    2,
  );
}

function withGas(tx: PreparedTx, gas: bigint): PreparedTx {
  const request = { ...tx.request, gas };
  return {
    ...tx,
    request,
    rawInput: stringifyWithBigInt(request),
  };
}

function createTemplate(values: TemplateFormValues, gas: bigint) {
  return withGas(createTemplateTransaction(values), gas);
}

function compilePolicyDocument(
  firewall: AgentFirewallSettings,
  parsedIntent: ParsedWalletIntent,
) {
  const base = parsePolicyDocument(JSON.stringify(defaultRiskPolicyJson));
  const policies = base.policies.map((policy) =>
    policy.type === "requireSimulationSuccess"
      ? {
          ...policy,
          enabled: false,
          description:
            "IntentProof shows simulation degradation separately so the offline demo can still prove local intent and Token Core signing.",
        }
      : policy,
  );

  return {
    ...base,
    name: "IntentProof compiled policy",
    description:
      "Default risk policy merged with parsed user intent and Agent Permission Firewall settings.",
    policies: policies.map((policy) => {
      if (
        policy.type === "requireVerifiedContract" &&
        !(firewall.requireVerifiedContract || parsedIntent.requireVerifiedContract)
      ) {
        return { ...policy, enabled: false };
      }
      if (
        policy.type === "forbidUnlimitedApproval" &&
        !(firewall.forbidUnlimitedApprovals || parsedIntent.forbidUnlimitedApprovals)
      ) {
        return { ...policy, enabled: false };
      }
      if (
        policy.type === "maxAssetOut" &&
        policy.assetKind === "erc20" &&
        policy.symbol === "USDC"
      ) {
        return { ...policy, max: firewall.usdcSpendCap };
      }
      if (
        policy.type === "maxAssetOut" &&
        policy.assetKind === "native" &&
        policy.symbol === "ETH"
      ) {
        return { ...policy, max: firewall.ethSpendCap };
      }
      return policy;
    }),
  } satisfies PolicyDocument;
}

function estimateGasUsd(gas: bigint) {
  const gwei = 2;
  const ethUsd = 3000;
  return (Number(gas) * gwei * 1e-9 * ethUsd);
}

function selectCompilePath(params: {
  scenarioId?: IntentScenarioId;
  parsedIntent: ParsedWalletIntent;
}) {
  if (params.scenarioId) return params.scenarioId;
  if (params.parsedIntent.action === "wrap") return "weth-wrap";
  if (params.parsedIntent.action === "swap") return "swap-policy";
  return "safe-transfer";
}

export function compileIntentProofPlan(params: {
  intent: string;
  scenarioId?: IntentScenarioId;
  mode?: IntentProofMode;
  firewall?: AgentFirewallSettings;
  sourceAddress?: Address;
  parsedIntent?: ParsedWalletIntent;
  parserSource?: "local" | "gemini" | "groq";
}): IntentProofPlan {
  const parsedIntent = params.parsedIntent ?? parseWalletIntent(params.intent);
  const firewall = params.firewall ?? defaultFirewallSettings;
  const sourceAddress = params.sourceAddress ?? DEFAULT_SIGNER;
  const compilePath = selectCompilePath({
    scenarioId: params.scenarioId,
    parsedIntent,
  });

  let preparedTx: PreparedTx;
  let route: RouteMetadata;
  let expectedOutcome = "";
  let actualTransaction = "";

  if (compilePath === "safe-transfer") {
    const token = getUsdcToken("sepolia");
    preparedTx = createTemplate(
      {
        chainKey: "sepolia",
        kind: "erc20Transfer",
        from: sourceAddress,
        tokenAddress: token.address,
        tokenDecimals: String(token.decimals),
        recipient: SAVED_VENDOR_ADDRESS,
        amount: "5",
      },
      65000n,
    );
    route = {
      label: "Direct Sepolia USDC transfer",
      sourceChainKey: "sepolia",
      targetChainKey: "sepolia",
      usesBridge: false,
      approvalIsUnlimited: false,
      trustedRecipientMatch: true,
      firstInteraction: false,
      deterministicNotes: ["No approval step", "Recipient matches address book"],
    };
    expectedOutcome = "5 USDC moves to the saved vendor on Ethereum Sepolia.";
    actualTransaction = `ERC-20 transfer to ${SAVED_VENDOR_ADDRESS}`;
  } else if (compilePath === "weth-wrap") {
    preparedTx = createTemplate(
      {
        chainKey: "sepolia",
        kind: "wethDeposit",
        from: sourceAddress,
        amount: "0.01",
      },
      50000n,
    );
    route = {
      label: "Sepolia WETH deposit",
      sourceChainKey: "sepolia",
      targetChainKey: "sepolia",
      usesBridge: false,
      approvalIsUnlimited: false,
      trustedRecipientMatch: true,
      firstInteraction: false,
      deterministicNotes: ["Uses built-in WETH deposit template"],
    };
    expectedOutcome = "0.01 ETH is wrapped into WETH on Sepolia.";
    actualTransaction = `WETH deposit at ${getChainConfig("sepolia").wrappedNativeToken.address}`;
  } else if (compilePath === "bridge-mismatch") {
    const token = getUsdcToken("baseSepolia");
    preparedTx = createTemplate(
      {
        chainKey: "baseSepolia",
        kind: "erc20Transfer",
        from: sourceAddress,
        tokenAddress: token.address,
        tokenDecimals: String(token.decimals),
        recipient: BASE_ROUTE_RECIPIENT,
        amount: "5",
      },
      65000n,
    );
    route = {
      label: "Base Sepolia route proposed by agent",
      sourceChainKey: "sepolia",
      targetChainKey: "baseSepolia",
      usesBridge: true,
      approvalIsUnlimited: false,
      trustedRecipientMatch: false,
      firstInteraction: true,
      deterministicNotes: [
        "Agent route changes target chain to Base Sepolia",
        "Route requires cross-chain movement",
      ],
    };
    expectedOutcome = "User intent stays on Sepolia and forbids Base or bridges.";
    actualTransaction = `ERC-20 transfer prepared on Base Sepolia to ${BASE_ROUTE_RECIPIENT}`;
  } else {
    const token = getUsdcToken("sepolia");
    preparedTx = createTemplate(
      {
        chainKey: "sepolia",
        kind: "erc20Approve",
        from: sourceAddress,
        tokenAddress: token.address,
        tokenDecimals: "0",
        spender: DEMO_SPENDER,
        amount: MAX_UINT256.toString(),
      },
      65000n,
    );
    route = {
      label:
        compilePath === "swap-policy"
          ? "Deterministic swap preflight route"
          : "Unlimited approval request",
      sourceChainKey: "sepolia",
      targetChainKey: "sepolia",
      usesBridge: false,
      approvalIsUnlimited: true,
      slippageBps: compilePath === "swap-policy" ? 120 : undefined,
      trustedRecipientMatch: true,
      firstInteraction: false,
      deterministicNotes: [
        "No live aggregator required",
        "Approval is evaluated before swap calldata can be signed",
      ],
    };
    expectedOutcome =
      compilePath === "swap-policy"
        ? "A swap route must respect 0.5% slippage and avoid unlimited approvals."
        : "The user's swap intent forbids unlimited token approvals.";
    actualTransaction = `ERC-20 approve ${DEMO_SPENDER} for uint256.max`;
  }

  return {
    scenarioId: params.scenarioId,
    mode: params.mode ?? "demo",
    parserSource: params.parserSource ?? "local",
    intent: params.intent,
    parsedIntent,
    firewall,
    policyDocument: compilePolicyDocument(firewall, parsedIntent),
    preparedTx,
    route,
    expectedOutcome,
    actualTransaction,
    estimatedGasUsd: estimateGasUsd(preparedTx.request.gas ?? 250000n),
  };
}

function createIssue(
  severity: IntentDecisionIssue["severity"],
  title: string,
  description: string,
): IntentDecisionIssue {
  return { severity, title, description };
}

function parseCap(value: string, decimals: number) {
  try {
    return parseUnits(value || "0", decimals);
  } catch {
    return 0n;
  }
}

function getTransferAmount(actionName: string | undefined, argsValue?: string) {
  if (actionName !== "transfer" || !argsValue) return 0n;
  return /^\d+$/.test(argsValue) ? BigInt(argsValue) : 0n;
}

export function evaluateAddressPoisoning(params: {
  address?: Address;
  trusted: Array<{ label: string; address: Address }>;
}): AddressPoisoningResult {
  if (!params.address) {
    return {
      severity: "warn",
      message: "No recipient address is available for trust comparison.",
    };
  }

  const normalized = params.address.toLowerCase();
  const exact = params.trusted.find(
    (item) => item.address.toLowerCase() === normalized,
  );
  if (exact) {
    return {
      severity: "pass",
      trustedLabel: exact.label,
      message: `Recipient exactly matches ${exact.label}.`,
    };
  }

  const lookalike = params.trusted.find((item) => {
    const trusted = item.address.toLowerCase();
    return (
      trusted.slice(0, 8) === normalized.slice(0, 8) &&
      trusted.slice(-6) === normalized.slice(-6)
    );
  });

  if (lookalike) {
    return {
      severity: "warn",
      trustedLabel: lookalike.label,
      message: `Recipient looks similar to ${lookalike.label} but is not an exact address-book match.`,
    };
  }

  return {
    severity: "warn",
    message: "Recipient is not in the trusted address book.",
  };
}

export function evaluateIntentProofDecision(params: {
  plan: IntentProofPlan;
  analysis?: AnalysisResult;
}): IntentProofDecision {
  const { plan, analysis } = params;
  const issues: IntentDecisionIssue[] = [];
  const chain = getChainConfig(plan.preparedTx.chainKey);

  if (!plan.firewall.allowedChains.includes(plan.preparedTx.chainKey)) {
    issues.push(
      createIssue(
        "block",
        "Chain not allowed",
        `${chain.label} is outside the Agent Permission Firewall chain allowlist.`,
      ),
    );
  }

  if (plan.parsedIntent.forbiddenChains.includes(plan.preparedTx.chainKey)) {
    issues.push(
      createIssue(
        "block",
        "Intent forbids this chain",
        `The user explicitly forbids ${chain.label}, but the candidate transaction targets it.`,
      ),
    );
  }

  if (
    (plan.firewall.forbidBridge || plan.parsedIntent.forbidBridge) &&
    plan.route.usesBridge
  ) {
    issues.push(
      createIssue(
        "block",
        "Bridge forbidden",
        "The candidate route uses cross-chain movement while the intent or firewall forbids bridging.",
      ),
    );
  }

  if (
    plan.parsedIntent.allowedChains &&
    !plan.parsedIntent.allowedChains.includes(plan.preparedTx.chainKey)
  ) {
    issues.push(
      createIssue(
        "block",
        "Intent allowlist mismatch",
        `${chain.label} is outside the user's stated chain scope.`,
      ),
    );
  }

  if (plan.parsedIntent.forbidApprovals && plan.route.approvalIsUnlimited) {
    issues.push(
      createIssue(
        "block",
        "Approval forbidden",
        "The user said not to approve anything, but the candidate transaction is an approval.",
      ),
    );
  }

  if (
    (plan.firewall.forbidUnlimitedApprovals ||
      plan.parsedIntent.forbidUnlimitedApprovals) &&
    plan.route.approvalIsUnlimited
  ) {
    issues.push(
      createIssue(
        "block",
        "Unlimited approval blocked",
        "The candidate grants uint256.max token allowance while unlimited approval is forbidden.",
      ),
    );
  }

  const slippageCap =
    plan.parsedIntent.maxSlippageBps ?? plan.firewall.maxSlippageBps;
  if (
    plan.route.slippageBps !== undefined &&
    plan.route.slippageBps > slippageCap
  ) {
    issues.push(
      createIssue(
        "block",
        "Slippage policy violation",
        `Route slippage is ${(plan.route.slippageBps / 100).toFixed(2)}%, above the ${(slippageCap / 100).toFixed(2)}% cap.`,
      ),
    );
  }

  if (plan.estimatedGasUsd > plan.firewall.gasCapUsd) {
    issues.push(
      createIssue(
        "warn",
        "Gas cap needs acknowledgement",
        `Estimated gas is about $${plan.estimatedGasUsd.toFixed(2)}, above the $${plan.firewall.gasCapUsd.toFixed(2)} firewall cap.`,
      ),
    );
  }

  const intentGasCap = plan.parsedIntent.maxGasUsd;
  if (intentGasCap !== undefined && plan.estimatedGasUsd > intentGasCap) {
    issues.push(
      createIssue(
        "warn",
        "Intent gas cap needs acknowledgement",
        `Estimated gas is about $${plan.estimatedGasUsd.toFixed(2)}, above the user's $${intentGasCap.toFixed(2)} cap.`,
      ),
    );
  }

  const plannedAmount = Number.parseFloat(plan.parsedIntent.amount ?? "0");
  if (
    Number.isFinite(plannedAmount) &&
    plannedAmount > 0 &&
    plan.parsedIntent.assetSymbol
  ) {
    const estimatedSpendUsd =
      plan.parsedIntent.assetSymbol === "USDC"
        ? plannedAmount
        : plan.parsedIntent.assetSymbol === "ETH" ||
            plan.parsedIntent.assetSymbol === "WETH"
          ? plannedAmount * 3000
          : 0;
    if (estimatedSpendUsd > plan.firewall.maxSpendUsd) {
      issues.push(
        createIssue(
          "block",
          "Max spend exceeded",
          `Estimated spend is about $${estimatedSpendUsd.toFixed(2)}, above the $${plan.firewall.maxSpendUsd.toFixed(2)} per-transaction firewall cap.`,
        ),
      );
    }
  }

  if (
    analysis?.action.functionName === "transfer" &&
    analysis.action.targetAddress
  ) {
    const token = getUsdcToken(plan.preparedTx.chainKey);
    const amount = getTransferAmount(
      analysis.action.functionName,
      analysis.action.argsSummary[1]?.value,
    );
    if (amount > parseCap(plan.firewall.usdcSpendCap, token.decimals)) {
      issues.push(
        createIssue(
          "block",
          "Spend cap exceeded",
          `USDC transfer exceeds the firewall cap of ${plan.firewall.usdcSpendCap} USDC.`,
        ),
      );
    }
  }

  if (
    plan.preparedTx.templateKind === "wethDeposit" &&
    (plan.preparedTx.request.value ?? 0n) >
      parseEther(plan.firewall.ethSpendCap || "0")
  ) {
    issues.push(
      createIssue(
        "block",
        "ETH spend cap exceeded",
        `WETH wrap value exceeds the firewall cap of ${plan.firewall.ethSpendCap} ETH.`,
      ),
    );
  }

  const recipient =
    analysis?.action.functionName === "transfer"
      ? (analysis.action.argsSummary[0]?.value as Address | undefined)
      : undefined;
  if (recipient) {
    const addressCheck = evaluateAddressPoisoning({
      address: recipient,
      trusted: trustedRecipients,
    });
    if (addressCheck.severity === "warn") {
      issues.push(
        createIssue(
          plan.firewall.trustedRecipientsOnly ||
            plan.parsedIntent.requireTrustedRecipient
            ? "block"
            : "warn",
          "Recipient trust check",
          addressCheck.message,
        ),
      );
    }
  }

  if (
    plan.firewall.requireFirstInteractionConfirmation &&
    plan.route.firstInteraction &&
    !issues.some((issue) => issue.title === "Recipient trust check")
  ) {
    issues.push(
      createIssue(
        "warn",
        "First interaction",
        "This route touches an address that has not been confirmed before.",
      ),
    );
  }

  if (analysis?.policyViolations) {
    for (const violation of analysis.policyViolations) {
      if (violation.policyId === "simulation-must-pass") continue;
      issues.push(
        createIssue(
          violation.level === "high" ? "block" : "warn",
          `Policy: ${violation.policyName}`,
          violation.description,
        ),
      );
    }
  }

  if (analysis && !analysis.simulation.success) {
    issues.push(
      createIssue(
        "info",
        "Simulation degraded",
        analysis.simulation.errorMessage
          ? `Simulation did not prove execution: ${analysis.simulation.errorMessage}`
          : "Simulation did not prove execution, so IntentProof relies on deterministic decode and policy checks.",
      ),
    );
  }

  const hasBlock = issues.some(
    (issue) => issue.severity === "block" || issue.severity === "danger",
  );
  const hasWarning = issues.some((issue) => issue.severity === "warn");
  const hasInfo = issues.some((issue) => issue.severity === "info");
  if (hasBlock) {
    return {
      severity: "block",
      label: "BLOCK",
      summary: "Blocked before signing. Intent does not match transaction.",
      signState: "disabled",
      issues,
    };
  }

  if (hasWarning) {
    return {
      severity: "warn",
      label: "WARN",
      summary: "Review warning before signing.",
      signState: "ackRequired",
      issues,
    };
  }

  if (hasInfo) {
    return {
      severity: "info",
      label: "INFO",
      summary:
        "Intent matches transaction. Signing is allowed with degraded context.",
      signState: "enabled",
      issues,
    };
  }

  return {
    severity: "pass",
    label: "PASS",
    summary: "Intent matches transaction. Signing is allowed.",
    signState: "enabled",
    issues,
  };
}

export function canSignIntentProof(
  decision: IntentProofDecision | undefined,
  warningAcknowledged: boolean,
) {
  if (!decision) return false;
  if (decision.signState === "enabled") return true;
  if (decision.signState === "ackRequired") return warningAcknowledged;
  return false;
}

export function createIntentProofReceipt(params: {
  plan: IntentProofPlan;
  decision: IntentProofDecision;
  analysis?: AnalysisResult;
  signedRaw?: string;
  predictedTxHash?: string;
  broadcastTxHash?: string;
  timestamp?: string;
}): IntentProofReceipt {
  const recipient =
    params.analysis?.action.functionName === "transfer"
      ? params.analysis.action.argsSummary[0]?.value
      : params.plan.preparedTx.request.to;

  return {
    title: "IntentProof Receipt",
    intent: params.plan.intent,
    mode: params.plan.mode,
    decision: params.decision.label,
    chain: getChainConfig(params.plan.preparedTx.chainKey).label,
    action:
      params.analysis?.action.functionName ??
      params.analysis?.action.title ??
      params.plan.parsedIntent.action,
    token: params.plan.parsedIntent.assetSymbol,
    amount: params.plan.parsedIntent.amount,
    recipient,
    policyChecks:
      params.decision.issues.length > 0
        ? params.decision.issues.map(
            (issue) => `${issue.severity.toUpperCase()}: ${issue.title}`,
          )
        : ["PASS: no blocking issues"],
    tokenCoreAnalysis: params.analysis ? "completed" : "not-run",
    signed: Boolean(params.signedRaw),
    broadcast: Boolean(params.broadcastTxHash),
    predictedTxHash: params.predictedTxHash || undefined,
    broadcastTxHash: params.broadcastTxHash || undefined,
    timestamp: params.timestamp ?? new Date().toISOString(),
  };
}

export function formatIntentProofReceiptText(receipt: IntentProofReceipt) {
  return [
    receipt.title,
    `Intent: ${receipt.intent}`,
    `Mode: ${receipt.mode === "demo" ? "Preview Requests" : "Testnet Signing"}`,
    `Decision: ${receipt.decision}`,
    `Chain: ${receipt.chain}`,
    `Action: ${receipt.action}`,
    receipt.token ? `Token: ${receipt.token}` : undefined,
    receipt.amount ? `Amount: ${receipt.amount}` : undefined,
    receipt.recipient ? `Recipient: ${receipt.recipient}` : undefined,
    `Policy checks: ${receipt.policyChecks.join("; ")}`,
    `Token Core analysis: ${receipt.tokenCoreAnalysis}`,
    `Signed: ${receipt.signed ? "yes" : "no"}`,
    `Broadcast: ${receipt.broadcast ? "yes" : "no"}`,
    receipt.predictedTxHash ? `Predicted tx hash: ${receipt.predictedTxHash}` : undefined,
    receipt.broadcastTxHash ? `Tx hash: ${receipt.broadcastTxHash}` : undefined,
    `Timestamp: ${receipt.timestamp}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatFullAddress(address?: string) {
  return address ?? "Not provided";
}

export function summarizePlan(plan: IntentProofPlan) {
  return [
    `${getChainConfig(plan.preparedTx.chainKey).label}`,
    plan.actualTransaction,
    `to ${formatFullAddress(plan.preparedTx.request.to)}`,
    `gas ~= $${plan.estimatedGasUsd.toFixed(2)}`,
  ].join(" · ");
}

export function formatRouteEndpoint(route: RouteMetadata) {
  const source = getChainConfig(route.sourceChainKey).label;
  const target = getChainConfig(route.targetChainKey).label;
  return source === target ? source : `${source} -> ${target}`;
}

export function formatShortSigner(address?: Address) {
  return address ? shortenAddress(address) : shortenAddress(DEFAULT_SIGNER);
}
