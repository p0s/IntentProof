import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  InboundWalletConnectWallet,
  buildEip155SessionNamespace,
  parseWalletKitSessionRequest,
} from "../../lib/live/inboundWallet";
import type { LiveConnectorState, LiveSessionAccount } from "../../lib/live/types";

type TestWalletKitSession = {
  peer?: {
    metadata?: {
      name?: string;
      url?: string;
      icons?: string[];
    };
  };
  namespaces?: Record<string, unknown>;
};

const walletKitHarness = vi.hoisted(() => {
  type Listener = (payload: unknown) => unknown | Promise<unknown>;
  const listeners = new Map<string, Listener[]>();
  const activeSessions: Record<string, TestWalletKitSession> = {};
  const walletkit = {
    on: vi.fn((event: string, listener: Listener) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
    }),
    pair: vi.fn(async () => undefined),
    approveSession: vi.fn(
      async (params: { id: number; namespaces: unknown }) => {
        activeSessions[`topic-${params.id}`] = {
          peer: {
            metadata: {
              name: "Uniswap",
              url: "https://app.uniswap.org",
              icons: [],
            },
          },
          namespaces: params.namespaces as Record<string, unknown>,
        };
      },
    ),
    rejectSession: vi.fn(async () => undefined),
    updateSession: vi.fn(
      async (params: { topic: string; namespaces: unknown }) => {
        activeSessions[params.topic] = {
          ...(activeSessions[params.topic] ?? {
            peer: {
              metadata: {
                name: "WalletConnect DApp",
                url: "https://dapp.example",
              },
            },
          }),
          namespaces: params.namespaces as Record<string, unknown>,
        };
      },
    ),
    getActiveSessions: vi.fn(() => activeSessions),
    getPendingSessionRequests: vi.fn(() => []),
    emitSessionEvent: vi.fn(async () => undefined),
    respondSessionRequest: vi.fn(async () => undefined),
  };
  return {
    activeSessions,
    listeners,
    walletkit,
    async emit(event: string, payload: unknown) {
      for (const listener of listeners.get(event) ?? []) {
        await listener(payload);
      }
    },
    reset() {
      listeners.clear();
      for (const key of Object.keys(activeSessions)) delete activeSessions[key];
      for (const method of Object.values(walletkit)) {
        if (typeof method === "function" && "mockClear" in method) {
          method.mockClear();
        }
      }
    },
  };
});

vi.mock("../../lib/live/walletConnectCore", () => ({
  getIntentProofWalletConnectCore: vi.fn(async () => ({})),
}));

vi.mock("@reown/walletkit", () => ({
  WalletKit: {
    init: vi.fn(async () => walletKitHarness.walletkit),
  },
}));

vi.mock("@walletconnect/utils", () => ({
  getSdkError: vi.fn(() => ({
    code: 5000,
    message: "Rejected by test",
  })),
  buildApprovedNamespaces: vi.fn(
    ({ supportedNamespaces }: { supportedNamespaces: unknown }) =>
      supportedNamespaces,
  ),
}));

const accountA: LiveSessionAccount = {
  address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  chains: ["eip155:1", "eip155:11155111"],
};

const accountB: LiveSessionAccount = {
  address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  chains: ["eip155:1", "eip155:11155111"],
};

describe("WalletKit inbound adapter", () => {
  beforeEach(() => {
    walletKitHarness.reset();
  });

  it("parses current WalletKit session_request events", () => {
    const parsed = parseWalletKitSessionRequest({
      id: 42,
      topic: "topic-1",
      params: {
        chainId: "eip155:11155111",
        request: {
          method: "eth_sendTransaction",
          params: [{ to: "0x1111111111111111111111111111111111111111" }],
        },
      },
    });

    expect(parsed?.id).toBe(42);
    expect(parsed?.topic).toBe("topic-1");
    expect(parsed?.chainId).toBe("eip155:11155111");
    expect(parsed?.request?.method).toBe("eth_sendTransaction");
  });

  it("also accepts direct request fields from older WalletKit docs", () => {
    const parsed = parseWalletKitSessionRequest({
      id: 7,
      topic: "topic-2",
      chainId: "eip155:84532",
      request: {
        method: "personal_sign",
        params: ["0x68656c6c6f"],
      },
    });

    expect(parsed?.id).toBe(7);
    expect(parsed?.chainId).toBe("eip155:84532");
    expect(parsed?.request?.method).toBe("personal_sign");
  });

  it("accepts request ids nested in params", () => {
    const parsed = parseWalletKitSessionRequest({
      params: {
        id: "jsonrpc-9",
        topic: "topic-3",
        chainId: "eip155:1",
        request: {
          method: "eth_sendTransaction",
          params: [{ to: "0x2222222222222222222222222222222222222222" }],
        },
      },
    });

    expect(parsed?.id).toBe("jsonrpc-9");
    expect(parsed?.topic).toBe("topic-3");
    expect(parsed?.chainId).toBe("eip155:1");
    expect(parsed?.request?.method).toBe("eth_sendTransaction");
  });

  it("advertises only the chains granted by the imToken session account", () => {
    const namespace = buildEip155SessionNamespace({
      address: "0x7777777777777777777777777777777777777777",
      chains: ["eip155:11155111", "eip155:84532"],
    });

    expect(namespace.chains).toEqual(["eip155:11155111", "eip155:84532"]);
    expect(namespace.accounts).toEqual([
      "eip155:11155111:0x7777777777777777777777777777777777777777",
      "eip155:84532:0x7777777777777777777777777777777777777777",
    ]);
    expect(namespace.accounts.join(" ")).not.toContain("eip155:1:");
    expect(namespace.accounts.join(" ")).not.toContain("eip155:8453:");
  });

  it("advertises wallet_getCapabilities so DApps can fall back to legacy tx requests", () => {
    const namespace = buildEip155SessionNamespace({
      address: "0x7777777777777777777777777777777777777777",
      chains: ["eip155:1", "eip155:11155111"],
    });

    expect(namespace.methods).toContain("wallet_getCapabilities");
    expect(namespace.methods).toContain("eth_sendTransaction");
    expect(namespace.methods).toContain("eth_estimateGas");
    expect(namespace.methods).toContain("eth_call");
    expect(namespace.methods).toContain("eth_getLogs");
    expect(namespace.methods).toContain("eth_getStorageAt");
  });

  it("advertises common modern DApp methods so policy can judge them after pairing", () => {
    const namespace = buildEip155SessionNamespace({
      address: "0x7777777777777777777777777777777777777777",
      chains: ["eip155:1", "eip155:11155111"],
    });

    expect(namespace.methods).toEqual(
      expect.arrayContaining([
        "eth_requestAccounts",
        "wallet_sendCalls",
        "wallet_addEthereumChain",
        "wallet_watchAsset",
        "eth_sign",
      ]),
    );
  });

  it("approves a new DApp proposal with the latest signer account", async () => {
    const stateUpdates: LiveConnectorState[] = [];
    const inbound = new InboundWalletConnectWallet(
      "project-id",
      vi.fn(),
      (state) => stateUpdates.push(state),
    );

    await inbound.restoreSession(accountB);
    await inbound.connectDapp("wc:fresh@2?relay-protocol=irn&symKey=abc", accountA);
    await walletKitHarness.emit("session_proposal", {
      id: 101,
      params: {
        requiredNamespaces: {
          eip155: {},
        },
      },
    });

    const approveParams =
      walletKitHarness.walletkit.approveSession.mock.calls.at(-1)?.[0];
    const eip155 = (approveParams?.namespaces as { eip155?: { accounts?: string[] } })
      .eip155;

    expect(eip155?.accounts).toContain(`eip155:1:${accountA.address}`);
    expect(eip155?.accounts).not.toContain(`eip155:1:${accountB.address}`);
    expect(stateUpdates.at(-1)?.account?.address).toBe(accountA.address);
  });

  it("resyncs restored DApp sessions when the signer account changes", async () => {
    walletKitHarness.activeSessions["uniswap-topic"] = {
      peer: {
        metadata: {
          name: "Uniswap",
          url: "https://app.uniswap.org",
        },
      },
      namespaces: {
        eip155: buildEip155SessionNamespace(accountB),
      },
    };
    const inbound = new InboundWalletConnectWallet("project-id", vi.fn());

    await inbound.restoreSession(accountA);

    const updateParams =
      walletKitHarness.walletkit.updateSession.mock.calls.at(-1)?.[0];
    const eip155 = (updateParams?.namespaces as { eip155?: { accounts?: string[] } })
      .eip155;

    expect(updateParams?.topic).toBe("uniswap-topic");
    expect(eip155?.accounts).toContain(`eip155:1:${accountA.address}`);
    expect(eip155?.accounts).not.toContain(`eip155:1:${accountB.address}`);
    expect(walletKitHarness.walletkit.emitSessionEvent).toHaveBeenCalledWith({
      topic: "uniswap-topic",
      event: { name: "accountsChanged", data: [accountA.address] },
      chainId: "eip155:1",
    });
  });
});
