import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LOOKALIKE_VENDOR_ADDRESS,
  SAVED_VENDOR_ADDRESS,
  compileIntentProofPlan,
  createIntentProofReceipt,
  defaultFirewallSettings,
  evaluateAddressPoisoning,
  evaluateIntentProofDecision,
  formatIntentProofReceiptText,
  parseWalletIntent,
  parseWalletIntentWithAiFallback,
  trustedRecipients,
} from "../../lib/intentproof";
import type { AnalysisResult } from "../../lib/types";

describe("parseWalletIntent", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("parses transfer intent with gas and approval constraints", () => {
    const intent = parseWalletIntent(
      "Send 5 USDC to my saved vendor on Sepolia. Do not approve anything. Max gas $1.",
    );

    expect(intent.action).toBe("transfer");
    expect(intent.amount).toBe("5");
    expect(intent.assetSymbol).toBe("USDC");
    expect(intent.chainKey).toBe("sepolia");
    expect(intent.recipientLabel).toBe("Saved vendor");
    expect(intent.forbidApprovals).toBe(true);
    expect(intent.forbidUnlimitedApprovals).toBe(true);
    expect(intent.maxGasUsd).toBe(1);
  });

  it("does not send intent text to remote AI unless explicitly enabled", async () => {
    vi.stubEnv("VITE_GEMINI_API_KEY", "gemini-key");

    const result = await parseWalletIntentWithAiFallback(
      "Send 5 USDC to my saved vendor on Sepolia.",
    );

    expect(result.source).toBe("local");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("parses WETH wrap intent", () => {
    const intent = parseWalletIntent(
      "Wrap 0.01 ETH into WETH on Sepolia. Do not bridge. Max gas $1.",
    );

    expect(intent.action).toBe("wrap");
    expect(intent.amount).toBe("0.01");
    expect(intent.assetSymbol).toBe("WETH");
    expect(intent.forbidBridge).toBe(true);
  });

  it("parses swap slippage intent", () => {
    const intent = parseWalletIntent(
      "Swap 10 USDC to ETH with max slippage 0.5%. Do not approve unlimited amounts.",
    );

    expect(intent.action).toBe("swap");
    expect(intent.amount).toBe("10");
    expect(intent.maxSlippageBps).toBe(50);
    expect(intent.forbidUnlimitedApprovals).toBe(true);
  });

  it("parses bridge bans and chain restrictions without selecting Base", () => {
    const intent = parseWalletIntent(
      "Send 5 USDC on Sepolia. Do not bridge and do not use Base.",
    );

    expect(intent.action).toBe("transfer");
    expect(intent.chainKey).toBe("sepolia");
    expect(intent.allowedChains).toEqual(["sepolia"]);
    expect(intent.forbiddenChains).toEqual(["baseSepolia", "base"]);
    expect(intent.forbidBridge).toBe(true);
  });

  it("parses mainnet intent while keeping explicit testnet-only bans", () => {
    const mainnetIntent = parseWalletIntent(
      "Send 1 USDC on Ethereum mainnet with verified contracts.",
    );
    expect(mainnetIntent.chainKey).toBe("ethereum");
    expect(mainnetIntent.requireVerifiedContract).toBe(true);

    const testnetOnlyIntent = parseWalletIntent(
      "Send 1 USDC on testnet only. Do not use mainnet.",
    );
    expect(testnetOnlyIntent.forbiddenChains).toEqual(["ethereum", "base"]);
  });
});

describe("IntentProof receipts", () => {
  it("generates a local human-readable receipt", () => {
    const plan = compileIntentProofPlan({
      intent:
        "Send 5 USDC to my saved vendor on Sepolia. Do not approve anything. Max gas $1.",
      scenarioId: "safe-transfer",
      mode: "demo",
    });
    const decision = evaluateIntentProofDecision({ plan });
    const receipt = createIntentProofReceipt({
      plan,
      decision,
      signedRaw: "0xsigned",
      predictedTxHash: "0xabc",
      timestamp: "2026-05-16T00:00:00.000Z",
    });

    expect(receipt.title).toBe("IntentProof Receipt");
    expect(receipt.mode).toBe("demo");
    expect(receipt.signed).toBe(true);
    expect(formatIntentProofReceiptText(receipt)).toContain(
      "IntentProof Receipt",
    );
  });
});

describe("evaluateIntentProofDecision", () => {
  it("blocks unlimited approval", () => {
    const plan = compileIntentProofPlan({
      intent: "Swap 10 USDC to ETH, but never allow unlimited approvals.",
      scenarioId: "unlimited-approval",
    });

    const decision = evaluateIntentProofDecision({ plan });
    expect(decision.signState).toBe("disabled");
    expect(decision.issues.some((issue) => issue.title.includes("Unlimited"))).toBe(
      true,
    );
  });

  it("blocks forbidden bridge route", () => {
    const plan = compileIntentProofPlan({
      intent: "Send 5 USDC on Sepolia. Do not bridge and do not use Base.",
      scenarioId: "bridge-mismatch",
    });

    const decision = evaluateIntentProofDecision({ plan });
    expect(decision.signState).toBe("disabled");
    expect(decision.issues.some((issue) => issue.title === "Bridge forbidden")).toBe(
      true,
    );
  });

  it("blocks chain mismatch against allowlist", () => {
    const plan = compileIntentProofPlan({
      intent: "Send 5 USDC on Sepolia. Do not bridge and do not use Base.",
      scenarioId: "bridge-mismatch",
      firewall: {
        ...defaultFirewallSettings,
        allowedChains: ["sepolia"],
        forbidBridge: false,
      },
    });

    const decision = evaluateIntentProofDecision({ plan });
    expect(decision.signState).toBe("disabled");
    expect(
      decision.issues.some((issue) => issue.title === "Chain not allowed"),
    ).toBe(true);
    expect(
      decision.issues.some((issue) => issue.title === "Intent forbids this chain"),
    ).toBe(true);
  });

  it("requires acknowledgement when gas cap is exceeded", () => {
    const plan = compileIntentProofPlan({
      intent:
        "Send 5 USDC to my saved vendor on Sepolia. Do not approve anything. Max gas $1.",
      scenarioId: "safe-transfer",
      firewall: { ...defaultFirewallSettings, gasCapUsd: 0.01 },
    });

    const decision = evaluateIntentProofDecision({ plan });
    expect(decision.signState).toBe("ackRequired");
    expect(decision.issues.some((issue) => issue.title.includes("Gas cap"))).toBe(
      true,
    );
  });

  it("blocks slippage violations", () => {
    const plan = compileIntentProofPlan({
      intent:
        "Swap 10 USDC to ETH with max slippage 0.5%. Do not approve unlimited amounts.",
      scenarioId: "swap-policy",
    });

    const decision = evaluateIntentProofDecision({ plan });
    expect(decision.signState).toBe("disabled");
    expect(
      decision.issues.some(
        (issue) => issue.title === "Slippage policy violation",
      ),
    ).toBe(true);
  });

  it("blocks trusted recipient requirement failures", () => {
    const plan = compileIntentProofPlan({
      intent: "Send 5 USDC to my saved vendor on Sepolia.",
      scenarioId: "safe-transfer",
    });
    const analysis: AnalysisResult = {
      chainKey: "sepolia",
      chainLabel: "Ethereum Sepolia",
      action: {
        kind: "contractCall",
        functionName: "transfer",
        title: "ERC-20 transfer",
        summary: "Transfer to a lookalike address.",
        argsSummary: [
          { label: "recipient", value: LOOKALIKE_VENDOR_ADDRESS },
          { label: "amount", value: "5000000" },
        ],
        targetAddress: plan.preparedTx.request.to,
      },
      verification: {
        verified: true,
        source: "local",
        message: "local test token",
      },
      risks: [],
      policyViolations: [],
      simulation: {
        success: true,
        source: "heuristic",
        summary: "mock simulation",
        tokenChanges: [],
      },
      englishSummary: "This transaction is prepared for Ethereum Sepolia.",
      zhTwSummary: "mock summary",
    };

    const decision = evaluateIntentProofDecision({ plan, analysis });
    expect(decision.signState).toBe("disabled");
    expect(
      decision.issues.some((issue) => issue.title === "Recipient trust check"),
    ).toBe(true);
  });
});

describe("evaluateAddressPoisoning", () => {
  it("passes exact trusted recipient matches", () => {
    const result = evaluateAddressPoisoning({
      address: SAVED_VENDOR_ADDRESS,
      trusted: trustedRecipients,
    });

    expect(result.severity).toBe("pass");
    expect(result.trustedLabel).toBe("Saved vendor");
  });

  it("warns on prefix/suffix lookalikes", () => {
    const result = evaluateAddressPoisoning({
      address: LOOKALIKE_VENDOR_ADDRESS,
      trusted: trustedRecipients,
    });

    expect(result.severity).toBe("warn");
    expect(result.message).toContain("not an exact");
  });
});
