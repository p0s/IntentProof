import { describe, expect, it } from "vitest";

import { defaultFirewallSettings } from "../../lib/intentproof";
import { evaluateLiveRequestPolicy } from "../../lib/live/livePolicyBridge";
import { normalizeLiveRequest } from "../../lib/live/requestNormalizer";
import {
  buildUniversalRouterUnsupportedV4Calldata,
  buildUniversalRouterV3ExactInCalldata,
} from "./uniswap-universal-router-fixtures";

describe("live policy bridge", () => {
  it("warns on mainnet requests without blocking them", () => {
    const request = normalizeLiveRequest({
      id: "mainnet",
      origin: "demo",
      method: "eth_sendTransaction",
      params: [
        {
          from: "0x7777777777777777777777777777777777777777",
          to: "0x1111111111111111111111111111111111111111",
          value: "0x0",
          data: "0x",
          chainId: "0x1",
        },
      ],
    });

    const warning = evaluateLiveRequestPolicy({
      request,
      firewall: defaultFirewallSettings,
    });
    const allowedAfterAcknowledgement = evaluateLiveRequestPolicy({
      request,
      firewall: defaultFirewallSettings,
      warningAcknowledged: true,
    });

    expect(warning.label).toBe("WARN");
    expect(warning.issues[0]?.title).toBe("Mainnet request");
    expect(warning.canForward).toBe(false);
    expect(allowedAfterAcknowledgement.canForward).toBe(true);
  });

  it("allows read-only wallet capability probes on mainnet without warning", () => {
    const request = normalizeLiveRequest({
      id: "capabilities",
      origin: "app.uniswap.org",
      method: "wallet_getCapabilities",
      params: ["0x7777777777777777777777777777777777777777"],
      chainId: "eip155:1",
    });

    const decision = evaluateLiveRequestPolicy({
      request,
      firewall: defaultFirewallSettings,
    });

    expect(decision.label).toBe("PASS");
    expect(decision.canForward).toBe(true);
    expect(decision.issues).toEqual([]);
    expect(decision.score).toMatchObject({
      value: 96,
      confidence: "high",
    });
    expect(decision.score.reasons).toContain(
      "Read-only wallet coordination request.",
    );
  });

  it("allows account requests through the local coordination path", () => {
    const request = normalizeLiveRequest({
      id: "accounts",
      origin: "app.uniswap.org",
      method: "eth_requestAccounts",
      params: [],
      chainId: "eip155:1",
    });

    const decision = evaluateLiveRequestPolicy({
      request,
      firewall: defaultFirewallSettings,
    });

    expect(decision.label).toBe("PASS");
    expect(decision.canForward).toBe(true);
    expect(decision.score.reasons).toContain(
      "Read-only wallet coordination request.",
    );
  });

  it("blocks unsupported methods even when a DApp session can be approved", () => {
    const request = normalizeLiveRequest({
      id: "batch",
      origin: "app.uniswap.org",
      method: "wallet_sendCalls",
      params: [{ calls: [] }],
      chainId: "eip155:1",
    });

    const decision = evaluateLiveRequestPolicy({
      request,
      firewall: defaultFirewallSettings,
    });

    expect(decision.label).toBe("BLOCK");
    expect(decision.canForward).toBe(false);
    expect(decision.issues[0]?.title).toBe("Cannot relay request");
  });

  it("flags unlimited approvals and gates review on acknowledgement", () => {
    const approval = normalizeLiveRequest({
      id: "approval",
      origin: "demo",
      method: "eth_sendTransaction",
      params: [
        {
          from: "0x7777777777777777777777777777777777777777",
          to: "0x1111111111111111111111111111111111111111",
          value: "0x0",
          data: "0x095ea7b30000000000000000000000009999999999999999999999999999999999999999ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
          chainId: "0xaa36a7",
        },
      ],
    });
    const typedData = normalizeLiveRequest({
      id: "typed",
      origin: "demo",
      method: "eth_signTypedData_v4",
      params: ["0x7777777777777777777777777777777777777777", "{}"],
      chainId: "0xaa36a7",
    });

    const approvalWarning = evaluateLiveRequestPolicy({
      request: approval,
      firewall: defaultFirewallSettings,
    });
    const acknowledgedApproval = evaluateLiveRequestPolicy({
      request: approval,
      firewall: defaultFirewallSettings,
      warningAcknowledged: true,
    });

    expect(approvalWarning.label).toBe("WARN");
    expect(approvalWarning.canForward).toBe(false);
    expect(approvalWarning.issues.map((item) => item.title)).toContain(
      "Unlimited approval",
    );
    expect(acknowledgedApproval.canForward).toBe(true);
    expect(
      evaluateLiveRequestPolicy({
        request: typedData,
        firewall: defaultFirewallSettings,
      }).canForward,
    ).toBe(false);
    expect(
      evaluateLiveRequestPolicy({
        request: typedData,
        firewall: defaultFirewallSettings,
        warningAcknowledged: true,
      }).canForward,
    ).toBe(true);
  });

  it("blocks unsupported WalletConnect chains", () => {
    const request = normalizeLiveRequest({
      id: "polygon",
      origin: "demo",
      method: "eth_sendTransaction",
      params: [
        {
          from: "0x7777777777777777777777777777777777777777",
          to: "0x1111111111111111111111111111111111111111",
          value: "0x0",
          data: "0x",
          chainId: "0x89",
        },
      ],
    });

    const decision = evaluateLiveRequestPolicy({
      request,
      firewall: defaultFirewallSettings,
    });

    expect(decision.label).toBe("BLOCK");
    expect(decision.canForward).toBe(false);
    expect(decision.issues[0]?.description).toContain("Unsupported chain 0x89");
  });

  it("warn-gates decoded Uniswap Universal Router swaps", () => {
    const request = normalizeLiveRequest({
      id: "uniswap-swap",
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

    const warning = evaluateLiveRequestPolicy({
      request,
      firewall: defaultFirewallSettings,
    });
    const acknowledged = evaluateLiveRequestPolicy({
      request,
      firewall: defaultFirewallSettings,
      warningAcknowledged: true,
    });

    expect(warning.label).toBe("WARN");
    expect(warning.canForward).toBe(false);
    expect(warning.issues.map((item) => item.title)).toContain(
      "Decoded Universal Router route",
    );
    expect(warning.score).toMatchObject({
      value: 66,
      confidence: "medium",
    });
    expect(warning.score.reasons.some((reason) =>
      reason.startsWith("Universal Router command stream decoded:"),
    )).toBe(true);
    expect(acknowledged.canForward).toBe(true);
  });

  it("keeps decoded Uniswap swaps medium confidence when simulation is unavailable", () => {
    const request = normalizeLiveRequest({
      id: "uniswap-swap-no-sim",
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
        source: "registry",
        summary: "Universal Router execute",
        functionName: "execute",
      },
      simulation: {
        status: "unavailable",
        provider: "none",
        summary: "Simulation unavailable",
        assetChanges: [],
      },
    };

    const decision = evaluateLiveRequestPolicy({
      request,
      firewall: defaultFirewallSettings,
    });

    expect(decision.label).toBe("WARN");
    expect(decision.score.confidence).toBe("medium");
    expect(decision.score.reasons.some((reason) =>
      reason.startsWith("Universal Router command stream decoded:"),
    )).toBe(true);
  });

  it("warn-gates partially decoded Uniswap V4 Universal Router command streams", () => {
    const request = normalizeLiveRequest({
      id: "uniswap-v4",
      origin: "app.uniswap.org",
      method: "eth_sendTransaction",
      params: [
        {
          from: "0x7777777777777777777777777777777777777777",
          to: "0x4c82d1fbfe28c977cbb58d8c7ff8fcf9f70a2cca",
          value: "0x0",
          data: buildUniversalRouterUnsupportedV4Calldata(),
          chainId: "0x1",
        },
      ],
    });

    const decision = evaluateLiveRequestPolicy({
      request,
      firewall: defaultFirewallSettings,
      warningAcknowledged: true,
    });

    expect(decision.label).toBe("WARN");
    expect(decision.canForward).toBe(true);
    expect(decision.issues.map((item) => item.title)).toContain(
      "Partial V4 decode",
    );
    expect(decision.issues.map((item) => item.description).join(" ")).toContain(
      "Uniswap V4 swap",
    );
    expect(decision.score.confidence).toBe("medium");
  });

  it("keeps exactInputSingle router calls warning-gated when selector is readable", () => {
    const request = normalizeLiveRequest({
      id: "uniswap-exact-input",
      origin: "app.uniswap.org",
      method: "eth_sendTransaction",
      params: [
        {
          from: "0x7777777777777777777777777777777777777777",
          to: "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45",
          value: "0x0",
          data: "0x414bf38900000000",
          chainId: "0x1",
        },
      ],
    });

    const warning = evaluateLiveRequestPolicy({
      request,
      firewall: defaultFirewallSettings,
    });
    const acknowledged = evaluateLiveRequestPolicy({
      request,
      firewall: defaultFirewallSettings,
      warningAcknowledged: true,
    });

    expect(warning.label).toBe("WARN");
    expect(warning.issues.map((item) => item.title)).toContain(
      "Known Uniswap router",
    );
    expect(acknowledged.canForward).toBe(true);
  });

  it("shows incomplete evidence for spoofed Universal Router selectors on unknown contracts", () => {
    const request = normalizeLiveRequest({
      id: "spoofed-router",
      origin: "app.uniswap.org",
      method: "eth_sendTransaction",
      params: [
        {
          from: "0x7777777777777777777777777777777777777777",
          to: "0x1111111111111111111111111111111111111111",
          value: "0x0",
          data: "0x3593564c00000000",
          chainId: "0x1",
        },
      ],
    });

    const decision = evaluateLiveRequestPolicy({
      request,
      firewall: defaultFirewallSettings,
      warningAcknowledged: true,
    });

    expect(decision.label).toBe("WARN");
    expect(decision.canForward).toBe(true);
    expect(decision.issues.map((item) => item.title)).toContain(
      "Undecodable mainnet calldata",
    );
    expect(decision.score.confidence).toBe("low");
    expect(decision.score.reasons).toContain(
      "Calldata is not fully decoded by IntentProof.",
    );
  });
});
