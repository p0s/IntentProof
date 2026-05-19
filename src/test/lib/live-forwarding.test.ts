import { describe, expect, it } from "vitest";

import { defaultFirewallSettings } from "../../lib/intentproof";
import { buildFakeLiveRequests, FakeSignerClient } from "../../lib/live/fakeLiveClients";
import { evaluateLiveRequestPolicy } from "../../lib/live/livePolicyBridge";

describe("live forwarding", () => {
  it("fake signer forwards PASS requests once and never needs secrets in receipts", async () => {
    const signer = new FakeSignerClient();
    const [safeRequest] = buildFakeLiveRequests();
    const decision = evaluateLiveRequestPolicy({
      request: safeRequest!,
      firewall: defaultFirewallSettings,
    });

    expect(decision.canForward).toBe(true);
    const result = await signer.forward(safeRequest!);

    expect(result).toBe("0xfake-imtoken-result");
    expect(signer.forwarded).toBe(1);
    expect(JSON.stringify({ result })).not.toMatch(/mnemonic|private|keystore|password/i);
  });

  it("policy blocks fake mainnet approval before forwarding", () => {
    const signer = new FakeSignerClient();
    const [, approval] = buildFakeLiveRequests();
    const decision = evaluateLiveRequestPolicy({
      request: approval!,
      firewall: defaultFirewallSettings,
    });

    expect(decision.label).toBe("BLOCK");
    expect(decision.canForward).toBe(false);
    expect(signer.forwarded).toBe(0);
  });
});
