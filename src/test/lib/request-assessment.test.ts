import { describe, expect, it } from "vitest";

import { defaultFirewallSettings } from "../../lib/intentproof";
import {
  assessLiveRequest,
  isRoutineWalletCoordinationRequest,
} from "../../lib/live/requestAssessment";
import { evaluateLiveRequestPolicy } from "../../lib/live/livePolicyBridge";
import { normalizeLiveRequest } from "../../lib/live/requestNormalizer";
import type { LiveRequest } from "../../lib/live/types";
import { buildUniversalRouterV3ExactInCalldata } from "./uniswap-universal-router-fixtures";

function decisionFor(request: LiveRequest, warningAcknowledged = false) {
  return evaluateLiveRequestPolicy({
    request,
    firewall: defaultFirewallSettings,
    warningAcknowledged,
  });
}

describe("live request assessment", () => {
  it("treats decoded Uniswap Universal Router swaps as high evidence but review risk", () => {
    const request = normalizeLiveRequest({
      id: "uniswap",
      origin: "app.uniswap.org",
      method: "eth_sendTransaction",
      params: [
        {
          from: "0x7777777777777777777777777777777777777777",
          to: "0x4c82d1fbfe28c977cbb58d8c7ff8fcf9f70a2cca",
          value: "0x0",
          data: buildUniversalRouterV3ExactInCalldata(),
          chainId: "0x1",
        },
      ],
    });

    const assessment = assessLiveRequest({
      request,
      decision: decisionFor(request),
    });

    expect(assessment.sourceLabel).toBe("Uniswap");
    expect(assessment.evidenceConfidence).toBe("high");
    expect(assessment.riskLevel).toBe("needs-review");
    expect(assessment.evidenceReasons.join(" ")).toMatch(/Universal Router/i);
    expect(assessment.riskReasons.join(" ")).toMatch(/Mainnet|Swap route/i);
  });

  it("does not lower evidence confidence just because simulation reverted", () => {
    const request = normalizeLiveRequest({
      id: "reverted",
      origin: "app.uniswap.org",
      method: "eth_sendTransaction",
      params: [
        {
          from: "0x7777777777777777777777777777777777777777",
          to: "0x4c82d1fbfe28c977cbb58d8c7ff8fcf9f70a2cca",
          value: "0x0",
          data: buildUniversalRouterV3ExactInCalldata(),
          chainId: "0x1",
        },
      ],
    });
    request.evidence = {
      updatedAt: "2026-05-20T00:00:00.000Z",
      decode: {
        status: "decoded",
        source: "common",
        summary: "Universal Router route decoded.",
        functionName: "execute",
      },
      simulation: {
        status: "revert",
        provider: "rpc",
        summary: "eth_call reverted.",
        assetChanges: [],
      },
    };

    const assessment = assessLiveRequest({
      request,
      decision: decisionFor(request),
    });

    expect(assessment.evidenceConfidence).toBe("high");
    expect(assessment.executionStatus).toBe("revert");
    expect(assessment.riskLevel).toBe("needs-review");
    expect(assessment.riskReasons.join(" ")).toMatch(/revert/i);
  });

  it("keeps mainnet as a risk signal instead of an evidence penalty", () => {
    const request = normalizeLiveRequest({
      id: "mainnet-transfer",
      origin: "demo.vendor.example",
      method: "eth_sendTransaction",
      params: [
        {
          from: "0x7777777777777777777777777777777777777777",
          to: "0x1111111111111111111111111111111111111111",
          value: "0x1",
          data: "0x",
          chainId: "0x1",
        },
      ],
    });

    const assessment = assessLiveRequest({
      request,
      decision: decisionFor(request),
    });

    expect(assessment.evidenceConfidence).toBe("medium");
    expect(assessment.riskLevel).toBe("needs-review");
    expect(assessment.riskReasons.join(" ")).toMatch(/Mainnet/i);
  });

  it("marks unlimited approvals as high-impact when the approval is decoded", () => {
    const request = normalizeLiveRequest({
      id: "curve-approval",
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

    const assessment = assessLiveRequest({
      request,
      decision: decisionFor(request),
    });

    expect(assessment.sourceLabel).toBe("Curve");
    expect(assessment.evidenceConfidence).toBe("high");
    expect(assessment.riskLevel).toBe("high-impact");
    expect(assessment.riskReasons.join(" ")).toMatch(/Unlimited/i);
  });

  it("recognizes Lido submit requests", () => {
    const request = normalizeLiveRequest({
      id: "lido-submit",
      origin: "stake.lido.fi",
      method: "eth_sendTransaction",
      params: [
        {
          from: "0x7777777777777777777777777777777777777777",
          to: "0xae7ab96520de3a18e5e111b5eaab095312d7fe84",
          value: "0x2386f26fc10000",
          data: "0xa1903eab0000000000000000000000000000000000000000000000000000000000000000",
          chainId: "0x1",
        },
      ],
    });

    const assessment = assessLiveRequest({
      request,
      decision: decisionFor(request),
    });

    expect(assessment.sourceLabel).toBe("Lido");
    expect(assessment.evidenceConfidence).toBe("high");
    expect(assessment.riskLevel).toBe("needs-review");
  });

  it("treats typed-data signatures as recognized requests that need review", () => {
    const request = normalizeLiveRequest({
      id: "ens-typed",
      origin: "app.ens.domains",
      method: "eth_signTypedData_v4",
      params: [
        "0x7777777777777777777777777777777777777777",
        JSON.stringify({
          domain: { name: "ENS", chainId: 1 },
          primaryType: "Commitment",
          message: { name: "alice.eth" },
        }),
      ],
      chainId: "eip155:1",
    });

    const assessment = assessLiveRequest({
      request,
      decision: decisionFor(request),
    });

    expect(assessment.sourceLabel).toBe("ENS");
    expect(assessment.evidenceConfidence).toBe("high");
    expect(assessment.riskLevel).toBe("needs-review");
  });

  it("marks routine coordination requests as high-evidence routine work", () => {
    const request = normalizeLiveRequest({
      id: "capabilities",
      origin: "tokenlon.im",
      method: "wallet_getCapabilities",
      params: ["0x7777777777777777777777777777777777777777"],
      chainId: "eip155:1",
    });

    const assessment = assessLiveRequest({
      request,
      decision: decisionFor(request),
    });

    expect(isRoutineWalletCoordinationRequest(request)).toBe(true);
    expect(assessment.evidenceConfidence).toBe("high");
    expect(assessment.riskLevel).toBe("routine");
    expect(assessment.userActionLabel).toBe("Answer locally");
  });

  it("treats supported mainnet network switches as high-evidence review items, not blocked transactions", () => {
    const request = normalizeLiveRequest({
      id: "curve-switch-mainnet",
      origin: "curve.fi",
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x1" }],
      chainId: "eip155:1",
    });

    const decision = decisionFor(request);
    const assessment = assessLiveRequest({ request, decision });

    expect(decision.severity).toBe("warn");
    expect(decision.issues.map((issue) => issue.title)).toContain("Network switch to mainnet");
    expect(assessment.evidenceConfidence).toBe("high");
    expect(assessment.evidenceReasons.join(" ")).toContain("Ethereum Mainnet");
    expect(assessment.riskLevel).toBe("needs-review");
    expect(assessment.riskReasons.join(" ")).toContain("No transaction or message signature");
    expect(assessment.userActionLabel).toBe("Review, then answer locally");
  });

  it("blocks unsupported network switches while keeping evidence high because the request is understood", () => {
    const request = normalizeLiveRequest({
      id: "polygon-switch",
      origin: "curve.fi",
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x89" }],
      chainId: "eip155:137",
    });

    const assessment = assessLiveRequest({
      request,
      decision: decisionFor(request),
    });

    expect(assessment.evidenceConfidence).toBe("high");
    expect(assessment.riskLevel).toBe("blocked");
    expect(assessment.userActionLabel).toBe("Reject");
  });
});
