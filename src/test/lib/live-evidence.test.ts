import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  call: vi.fn(),
  estimateGas: vi.fn(),
  env: {} as Record<string, string | undefined>,
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      call: mocks.call,
      estimateGas: mocks.estimateGas,
    })),
  };
});

vi.mock("../../lib/env", () => ({
  getRuntimeEnv: (key: string) => mocks.env[key],
}));

import { defaultFirewallSettings } from "../../lib/intentproof";
import { enrichLiveRequestEvidence } from "../../lib/live/liveEvidence";
import { evaluateLiveRequestPolicy } from "../../lib/live/livePolicyBridge";
import { normalizeLiveRequest } from "../../lib/live/requestNormalizer";

function mockJsonResponse(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
  });
}

function usdcTransferRequest() {
  return normalizeLiveRequest({
    id: "usdc-transfer",
    origin: "app.uniswap.org",
    method: "eth_sendTransaction",
    params: [
      {
        from: "0x7777777777777777777777777777777777777777",
        to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        value: "0x0",
        data: "0xa9059cbb000000000000000000000000111111111111111111111111111111111111111100000000000000000000000000000000000000000000000000000000000f4240",
        chainId: "0x1",
      },
    ],
  });
}

describe("live request evidence", () => {
  afterEach(() => {
    mocks.env = {};
    mocks.call.mockReset();
    mocks.estimateGas.mockReset();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("uses server-side Tenderly simulation before public browser providers", async () => {
    mocks.env.VITE_ALCHEMY_API_KEY = "test-alchemy-key";
    const fetchMock = vi.fn((url: string | URL | Request) => {
      const target = String(url);
      if (target === "/api/tenderly-simulate") {
        return mockJsonResponse({
          provider: "tenderly",
          status: "success",
          summary: "Tenderly simulation completed without an execution failure.",
          gasEstimate: "62418",
          publicSimulationUrl: "https://tdly.co/shared/simulation/test",
          assetChanges: [
            {
              assetType: "ERC20",
              changeType: "TRANSFER",
              from: "0x7777777777777777777777777777777777777777",
              to: "0x1111111111111111111111111111111111111111",
              rawAmount: "1000000",
              contractAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
              symbol: "USDC",
              amount: "1",
            },
          ],
        });
      }
      return mockJsonResponse({
        jsonrpc: "2.0",
        id: 1,
        result: { changes: [], gasUsed: "0x5208", error: null },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const enriched = await enrichLiveRequestEvidence(usdcTransferRequest());

    expect(enriched.evidence?.simulation).toMatchObject({
      status: "success",
      provider: "tenderly",
      gasEstimate: "62418",
      publicSimulationUrl: "https://tdly.co/shared/simulation/test",
    });
    expect(enriched.evidence?.simulation.assetChanges[0]).toMatchObject({
      symbol: "USDC",
      amount: "1",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses optional Alchemy asset-change simulation when configured", async () => {
    mocks.env.VITE_ALCHEMY_API_KEY = "test-alchemy-key";
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string | URL | Request) => {
        if (String(url) === "/api/tenderly-simulate") {
          return mockJsonResponse(
            {
              provider: "tenderly",
              status: "unavailable",
              summary: "Tenderly server simulation is not configured.",
            },
            false,
          );
        }
        return mockJsonResponse({
          jsonrpc: "2.0",
          id: 1,
          result: {
            changes: [
              {
                assetType: "ERC20",
                changeType: "TRANSFER",
                from: "0x7777777777777777777777777777777777777777",
                to: "0x1111111111111111111111111111111111111111",
                rawAmount: "1000000",
                contractAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                decimals: 6,
                symbol: "USDC",
                amount: "1",
              },
            ],
            gasUsed: "0x5208",
            error: null,
          },
        });
      }),
    );

    const enriched = await enrichLiveRequestEvidence(usdcTransferRequest());

    expect(enriched.evidence?.simulation).toMatchObject({
      status: "success",
      provider: "alchemy",
      gasEstimate: "0x5208",
    });
    expect(enriched.evidence?.simulation.assetChanges[0]).toMatchObject({
      symbol: "USDC",
      amount: "1",
    });
    expect(enriched.evidence?.decode).toMatchObject({
      status: "decoded",
      source: "verified",
      functionName: "transfer",
      contractVerified: true,
    });
  });

  it("falls back from unavailable Tenderly server simulation to Alchemy", async () => {
    mocks.env.VITE_ALCHEMY_API_KEY = "test-alchemy-key";
    const fetchMock = vi.fn((url: string | URL | Request) => {
      if (String(url) === "/api/tenderly-simulate") {
        return mockJsonResponse(
          {
            provider: "tenderly",
            status: "unavailable",
            summary: "Tenderly server simulation is not configured.",
          },
          false,
        );
      }
      return mockJsonResponse({
        jsonrpc: "2.0",
        id: 1,
        result: { changes: [], gasUsed: "0x5208", error: null },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const enriched = await enrichLiveRequestEvidence(usdcTransferRequest());

    expect(enriched.evidence?.simulation).toMatchObject({
      status: "success",
      provider: "alchemy",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces server-side Tenderly revert evidence for review", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        mockJsonResponse({
          provider: "tenderly",
          status: "revert",
          summary: "Tenderly simulation reported that the transaction may revert.",
          errorMessage: "execution reverted: STF",
          assetChanges: [],
        }),
      ),
    );

    const enriched = await enrichLiveRequestEvidence(usdcTransferRequest());
    const decision = evaluateLiveRequestPolicy({
      request: enriched,
      firewall: defaultFirewallSettings,
      warningAcknowledged: true,
    });

    expect(enriched.evidence?.simulation).toMatchObject({
      status: "revert",
      provider: "tenderly",
    });
    expect(decision.label).toBe("WARN");
    expect(decision.canForward).toBe(true);
    expect(decision.issues.map((issue) => issue.title)).toContain(
      "Simulation indicates revert",
    );
  });

  it("falls back to open RPC dry-run when no asset-change provider is configured", async () => {
    mocks.estimateGas.mockResolvedValue(51_000n);
    mocks.call.mockResolvedValue({ data: "0x" });

    const enriched = await enrichLiveRequestEvidence(usdcTransferRequest());

    expect(enriched.evidence?.simulation).toMatchObject({
      status: "success",
      provider: "rpc",
      gasEstimate: "51000",
    });
    expect(enriched.evidence?.simulation.assetChanges).toEqual([]);
  });

  it("surfaces open RPC revert evidence for review", async () => {
    mocks.estimateGas.mockRejectedValue(new Error("execution reverted: STF"));

    const enriched = await enrichLiveRequestEvidence(usdcTransferRequest());
    const decision = evaluateLiveRequestPolicy({
      request: enriched,
      firewall: defaultFirewallSettings,
      warningAcknowledged: true,
    });

    expect(enriched.evidence?.simulation.status).toBe("revert");
    expect(decision.label).toBe("WARN");
    expect(decision.canForward).toBe(true);
    expect(decision.issues.map((issue) => issue.title)).toContain(
      "Simulation indicates revert",
    );
  });
});
