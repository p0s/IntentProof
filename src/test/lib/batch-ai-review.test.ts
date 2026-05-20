import { describe, expect, it } from "vitest";

import {
  buildAiTransactionReviewPacket,
  buildBatchAiReview,
  type AiTransactionReview,
} from "../../lib/live/browserAiReview";
import { defaultFirewallSettings } from "../../lib/intentproof";
import { evaluateLiveRequestPolicy } from "../../lib/live/livePolicyBridge";
import { normalizeLiveRequest } from "../../lib/live/requestNormalizer";

function review(overrides: Partial<AiTransactionReview> = {}): AiTransactionReview {
  return {
    headline: "Readable request",
    plainEnglishSummary: "The normalized packet was reviewed locally.",
    userIntentMatch: "unclear",
    mainRisks: [],
    questionsToAskBeforeSigning: ["Do you recognize this request?"],
    whyPolicyDecisionMakesSense: "Deterministic policy remains authoritative.",
    scamPatternHints: [],
    confidence: "medium",
    ...overrides,
  };
}

describe("batch local AI review", () => {
  it("aggregates multiple open request reviews without changing policy decisions", () => {
    const result = buildBatchAiReview({
      reviews: [
        {
          requestId: "swap",
          policyDecision: "WARN",
          review: review({ headline: "Review swap route" }),
        },
        {
          requestId: "approval",
          policyDecision: "WARN",
          review: review({
            headline: "Approval needs attention",
            confidence: "low",
            mainRisks: ["Unlimited approval"],
          }),
        },
      ],
    });

    expect(result.overallHeadline).toContain("1 request");
    expect(result.overallSummary).toContain("high-risk or blocked signals");
    expect(result.requests).toHaveLength(2);
    expect(result.requests[0]).toMatchObject({
      requestId: "swap",
      attentionLevel: "review",
      judgement:
        "No concrete scam pattern found by local AI, but the request still needs user review.",
    });
    expect(result.requests[1]).toMatchObject({
      requestId: "approval",
      attentionLevel: "high",
      judgement:
        "High-risk or blocked signal found; do not treat this as safe without wallet-level verification.",
    });
  });

  it("uses a concrete no-scam-signal summary when every request is readable", () => {
    const result = buildBatchAiReview({
      reviews: [
        {
          requestId: "switch",
          policyDecision: "INFO",
          review: review({
            headline: "Network switch",
            confidence: "high",
            mainRisks: [],
            questionsToAskBeforeSigning: [],
          }),
        },
      ],
    });

    expect(result.overallHeadline).toBe("No concrete scam pattern found in open requests");
    expect(result.overallSummary).toContain("no concrete scam pattern");
    expect(result.requests[0]).toMatchObject({
      attentionLevel: "routine",
      judgement: "No concrete scam pattern found in the normalized packet.",
    });
  });

  it("builds sanitized packets without session secrets or raw calldata", () => {
    const request = normalizeLiveRequest({
      id: "approval",
      topic: "session-topic-secret",
      origin: "curve.fi",
      method: "eth_sendTransaction",
      params: [
        {
          from: "0x7777777777777777777777777777777777777777",
          to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
          value: "0x0",
          data: "0x095ea7b30000000000000000000000009999999999999999999999999999999999999999ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
          chainId: "0x1",
        },
      ],
    });
    const decision = evaluateLiveRequestPolicy({
      request,
      firewall: defaultFirewallSettings,
    });

    const packet = buildAiTransactionReviewPacket({
      mode: "live",
      request,
      decision,
    });
    const serialized = JSON.stringify(packet);

    expect(serialized).not.toContain("session-topic-secret");
    expect(serialized).not.toContain(request.tx?.data?.slice(10));
    expect(packet.requestSource).toBe("curve.fi");
    expect(packet.policyDecision).toBe(decision.label);
    expect(packet.isUnlimitedApproval).toBe(true);
  });
});
