import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultFirewallSettings } from "../../lib/intentproof";
import {
  BROWSER_AI_MODEL_OPTIONS,
  buildAiTransactionReviewPacket,
  clearBrowserAiModelCache,
  parseAiTransactionReviewOutput,
  runBrowserAiTransactionReview,
} from "../../lib/live/browserAiReview";
import { buildFakeLiveRequests } from "../../lib/live/fakeLiveClients";
import { evaluateLiveRequestPolicy } from "../../lib/live/livePolicyBridge";

const webLlmMocks = vi.hoisted(() => ({
  deleteModelAllInfoInCache: vi.fn(async () => undefined),
  createCompletion: vi.fn(async () => ({
    choices: [{ message: { content: "" } }],
  })),
  createEngine: vi.fn(async () => ({
    chat: {
      completions: {
        create: vi.fn(async () => ({
          choices: [{ message: { content: "" } }],
        })),
      },
    },
  })),
}));

vi.mock("@mlc-ai/web-llm", () => ({
  deleteModelAllInfoInCache: webLlmMocks.deleteModelAllInfoInCache,
  CreateMLCEngine: webLlmMocks.createEngine,
}));

describe("browser AI transaction review", () => {
  beforeEach(() => {
    webLlmMocks.deleteModelAllInfoInCache.mockClear();
    webLlmMocks.deleteModelAllInfoInCache.mockImplementation(async () => undefined);
    webLlmMocks.createCompletion.mockClear();
    webLlmMocks.createCompletion.mockResolvedValue({
      choices: [{ message: { content: "" } }],
    });
    webLlmMocks.createEngine.mockClear();
    webLlmMocks.createEngine.mockImplementation(async () => ({
      chat: {
        completions: {
          create: webLlmMocks.createCompletion,
        },
      },
    }));
  });

  it("builds a normalized live review packet without raw calldata", () => {
    const [request] = buildFakeLiveRequests();
    const decision = evaluateLiveRequestPolicy({
      request: request!,
      firewall: defaultFirewallSettings,
    });

    const packet = buildAiTransactionReviewPacket({
      mode: "live",
      request: request!,
      decision,
    });

    expect(packet.mode).toBe("live");
    expect(packet.requestSource).toBe("demo.vendor.example");
    expect(packet.method).toBe("eth_sendTransaction");
    expect(packet.decodedFunction).toBe("transfer");
    expect(packet.isUnlimitedApproval).toBe(false);
    expect(packet.policyDecision).toBe(decision.label);
    expect(JSON.stringify(packet)).not.toContain(request!.tx!.data!.slice(10));
  });

  it("marks unlimited approvals in the AI review packet", () => {
    const [, request] = buildFakeLiveRequests();
    const decision = evaluateLiveRequestPolicy({
      request: request!,
      firewall: defaultFirewallSettings,
    });

    const packet = buildAiTransactionReviewPacket({
      mode: "live",
      request: request!,
      decision,
    });

    expect(packet.isMainnet).toBe(true);
    expect(packet.decodedFunction).toBe("approve");
    expect(packet.isUnlimitedApproval).toBe(true);
    expect(packet.spender).toBe("0x9999999999999999999999999999999999999999");
    expect(packet.approvalAmount).toBe("unlimited");
    expect(packet.warnings.some((warning) => /unlimited/i.test(warning))).toBe(true);
  });

  it("only offers local model options under the one gigabyte budget", () => {
    expect(BROWSER_AI_MODEL_OPTIONS.length).toBeGreaterThanOrEqual(3);
    for (const model of BROWSER_AI_MODEL_OPTIONS) {
      expect(model.approximateSize).toMatch(/~\d+ MB/);
      const size = Number(model.approximateSize.match(/\d+/)?.[0] ?? 0);
      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThan(1000);
    }
  });

  it("accepts strict AI review JSON and rejects schema drift", () => {
    const validReviewJson = JSON.stringify({
        headline: "Review spender and value",
        plainEnglishSummary: "This asks imToken to review a token approval.",
        userIntentMatch: "unclear",
        mainRisks: ["Unlimited allowance"],
        questionsToAskBeforeSigning: ["Do you trust the spender?"],
        whyPolicyDecisionMakesSense: "The deterministic policy requires review.",
        scamPatternHints: ["Approvals can be abused later."],
        confidence: "medium",
      });
    const review = parseAiTransactionReviewOutput(validReviewJson);

    expect(review.headline).toBe("Review spender and value");
    expect(parseAiTransactionReviewOutput(`Here is the JSON:\n${validReviewJson}`)).toEqual(
      review,
    );
    expect(
      parseAiTransactionReviewOutput(
        `Schema: {"headline":"string","plainEnglishSummary":"string","userIntentMatch":"matches|partially_matches|does_not_match|unclear","mainRisks":["string"],"questionsToAskBeforeSigning":["string"],"whyPolicyDecisionMakesSense":"string","scamPatternHints":["string"],"confidence":"low|medium|high"}\nReview:\n${validReviewJson}`,
      ),
    ).toEqual(review);
    expect(parseAiTransactionReviewOutput(`\`\`\`json\n${validReviewJson}\n\`\`\``)).toEqual(
      review,
    );
    expect(() =>
      parseAiTransactionReviewOutput(
        JSON.stringify({
          headline: "Missing fields",
          confidence: "medium",
        }),
      ),
    ).toThrow(/transaction review object/i);
  });

  it("reports schema echoes without leaking a raw JSON parse error", () => {
    expect(() =>
      parseAiTransactionReviewOutput(
        'Schema: {"headline":"string","plainEnglishSummary":"string","userIntentMatch":"matches|partially_matches|does_not_match|unclear","mainRisks":["string"],"questionsToAskBeforeSigning":["string"],"whyPolicyDecisionMakesSense":"string","scamPatternHints":["string"],"confidence":"low|medium|high"}',
      ),
    ).toThrow(/transaction review object/i);

    expect(() => parseAiTransactionReviewOutput("Schema: not JSON")).toThrow(
      /valid review JSON/i,
    );
  });

  it("falls back to a one-sentence advisory review when a local model echoes schema text", async () => {
    Object.defineProperty(globalThis.navigator, "gpu", {
      value: {},
      configurable: true,
    });
    const [request] = buildFakeLiveRequests();
    const decision = evaluateLiveRequestPolicy({
      request: request!,
      firewall: defaultFirewallSettings,
    });
    const packet = buildAiTransactionReviewPacket({
      mode: "live",
      request: request!,
      decision,
    });
    webLlmMocks.createCompletion
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content:
                'Schema: {"headline":"string","plainEnglishSummary":"string","userIntentMatch":"matches|partially_matches|does_not_match|unclear","mainRisks":["string"],"questionsToAskBeforeSigning":["string"],"whyPolicyDecisionMakesSense":"string","scamPatternHints":["string"],"confidence":"low|medium|high"}',
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content:
                "Check that the transfer amount, recipient, and DApp origin match the action you initiated.",
            },
          },
        ],
      });

    const review = await runBrowserAiTransactionReview({
      modelId: "SmolLM2-360M-Instruct-q4f16_1-MLC",
      packet,
    });

    expect(review.headline).toBe("Review generated from normalized evidence");
    expect(review.plainEnglishSummary).toContain(
      "Local model note: Check that the transfer amount",
    );
    expect(review.plainEnglishSummary).toContain("advisory fallback");
    expect(review.questionsToAskBeforeSigning.join(" ")).toContain("recognize this DApp");
    expect(webLlmMocks.createCompletion).toHaveBeenCalledTimes(2);
  });

  it("exercises every configured local model through schema-failure fallback", async () => {
    Object.defineProperty(globalThis.navigator, "gpu", {
      value: {},
      configurable: true,
    });
    const [request] = buildFakeLiveRequests();
    const decision = evaluateLiveRequestPolicy({
      request: request!,
      firewall: defaultFirewallSettings,
    });
    const packet = buildAiTransactionReviewPacket({
      mode: "live",
      request: request!,
      decision,
    });
    await clearBrowserAiModelCache(BROWSER_AI_MODEL_OPTIONS.map((model) => model.id));
    webLlmMocks.createEngine.mockClear();
    webLlmMocks.createCompletion.mockClear();

    const results = [];
    for (const model of BROWSER_AI_MODEL_OPTIONS) {
      webLlmMocks.createCompletion
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                content: '{"headline":"string","confidence":"medium"}',
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                content: `${model.label} says to verify the DApp, chain, amount, and recipient before signing.`,
              },
            },
          ],
        });

      results.push(
        await runBrowserAiTransactionReview({
          modelId: model.id,
          packet,
        }),
      );
    }

    expect(results).toHaveLength(BROWSER_AI_MODEL_OPTIONS.length);
    const modelCalls = webLlmMocks.createEngine.mock.calls as unknown as Array<[string]>;
    expect(modelCalls.map((call) => call[0])).toEqual(
      BROWSER_AI_MODEL_OPTIONS.map((model) => model.id),
    );
    for (const [index, review] of results.entries()) {
      expect(review.headline).toBe("Review generated from normalized evidence");
      expect(review.plainEnglishSummary).toContain(BROWSER_AI_MODEL_OPTIONS[index]!.label);
      expect(review.plainEnglishSummary).not.toContain("Try again or choose another local model");
    }
  });

  it("deletes local WebLLM model cache entries without touching app data", async () => {
    const [firstModel, secondModel] = BROWSER_AI_MODEL_OPTIONS;

    const result = await clearBrowserAiModelCache([
      firstModel!.id,
      firstModel!.id,
      secondModel!.id,
    ]);

    expect(result.failedModelIds).toEqual([]);
    expect(result.clearedModelIds).toEqual([firstModel!.id, secondModel!.id]);
    expect(webLlmMocks.deleteModelAllInfoInCache).toHaveBeenCalledTimes(2);
    expect(webLlmMocks.deleteModelAllInfoInCache).toHaveBeenNthCalledWith(
      1,
      firstModel!.id,
    );
    expect(webLlmMocks.deleteModelAllInfoInCache).toHaveBeenNthCalledWith(
      2,
      secondModel!.id,
    );
  });

  it("reports browsers that refuse local model cache deletion", async () => {
    const [firstModel] = BROWSER_AI_MODEL_OPTIONS;
    webLlmMocks.deleteModelAllInfoInCache.mockRejectedValueOnce(
      new Error("storage denied"),
    );

    const result = await clearBrowserAiModelCache([firstModel!.id]);

    expect(result.clearedModelIds).toEqual([]);
    expect(result.failedModelIds).toEqual([
      { modelId: firstModel!.id, message: "storage denied" },
    ]);
  });
});
