import { describe, expect, it, vi } from "vitest";

import { defaultFirewallSettings } from "../../lib/intentproof";
import { buildFakeLiveRequests, FakeSignerClient } from "../../lib/live/fakeLiveClients";
import { ImTokenWalletConnectSigner } from "../../lib/live/imtokenSigner";
import { evaluateLiveRequestPolicy } from "../../lib/live/livePolicyBridge";
import { normalizeLiveRequest } from "../../lib/live/requestNormalizer";

type TestProvider = {
  accounts: string[];
  chainId: number;
  connect: () => Promise<void>;
  disconnect?: () => Promise<void>;
  on: (event: string, listener: (payload: unknown) => void) => void;
  request: ReturnType<typeof vi.fn>;
  signer?: {
    session?: { topic?: string };
    client?: { request: ReturnType<typeof vi.fn> };
  };
};

function attachProvider(signer: ImTokenWalletConnectSigner, provider: TestProvider) {
  (signer as unknown as { provider: TestProvider }).provider = provider;
}

describe("live forwarding", () => {
  it("fake signer forwards routine requests once and never needs secrets in receipts", async () => {
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

  it("policy gates fake mainnet approval for explicit review", () => {
    const signer = new FakeSignerClient();
    const [, approval] = buildFakeLiveRequests();
    const decision = evaluateLiveRequestPolicy({
      request: approval!,
      firewall: defaultFirewallSettings,
    });
    const acknowledged = evaluateLiveRequestPolicy({
      request: approval!,
      firewall: defaultFirewallSettings,
      warningAcknowledged: true,
    });

    expect(decision.label).toBe("WARN");
    expect(decision.canForward).toBe(false);
    expect(acknowledged.canForward).toBe(true);
    expect(signer.forwarded).toBe(0);
  });

  it("switches imToken to the request chain before forwarding the exact request", async () => {
    const signer = new ImTokenWalletConnectSigner("test-project");
    const provider: TestProvider = {
      accounts: ["0x7777777777777777777777777777777777777777"],
      chainId: 1,
      connect: vi.fn(),
      on: vi.fn(),
      request: vi.fn(async ({ method }: { method: string }) => {
        if (method === "wallet_switchEthereumChain") {
          provider.chainId = 11155111;
          return null;
        }
        return "0ximtoken-result";
      }),
    };
    attachProvider(signer, provider);
    const request = normalizeLiveRequest({
      id: "sepolia-transfer",
      origin: "demo",
      method: "eth_sendTransaction",
      params: [
        {
          from: "0x7777777777777777777777777777777777777777",
          to: "0x1111111111111111111111111111111111111111",
          value: "0x0",
          data: "0x",
          chainId: "0xaa36a7",
        },
      ],
    });

    const result = await signer.forward(request);

    expect(result).toBe("0ximtoken-result");
    expect(provider.request).toHaveBeenNthCalledWith(1, {
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xaa36a7" }],
    });
    expect(provider.request).toHaveBeenNthCalledWith(2, {
      method: "eth_sendTransaction",
      params: request.request.params,
    });
  });

  it("forwards through the WalletConnect session on the explicit request chain", async () => {
    const signer = new ImTokenWalletConnectSigner("test-project");
    const provider: TestProvider = {
      accounts: ["0x7777777777777777777777777777777777777777"],
      chainId: 1,
      connect: vi.fn(),
      on: vi.fn(),
      request: vi.fn(async () => "provider-result"),
      signer: {
        session: { topic: "imtoken-topic" },
        client: { request: vi.fn(async () => "session-result") },
      },
    };
    attachProvider(signer, provider);
    const request = normalizeLiveRequest({
      id: "mainnet-transfer",
      origin: "1inch",
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

    const result = await signer.forward(request);

    expect(result).toBe("session-result");
    expect(provider.request).not.toHaveBeenCalled();
    expect(provider.signer?.client?.request).toHaveBeenCalledTimes(1);
    expect(provider.signer?.client?.request).toHaveBeenCalledWith({
      topic: "imtoken-topic",
      chainId: "eip155:1",
      request: {
        method: "eth_sendTransaction",
        params: request.request.params,
      },
    });
  });
});
