import { describe, expect, it } from "vitest";

import {
  buildEip155SessionNamespace,
  parseWalletKitSessionRequest,
} from "../../lib/live/inboundWallet";

describe("WalletKit inbound adapter", () => {
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
});
