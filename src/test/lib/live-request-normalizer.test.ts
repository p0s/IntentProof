import { describe, expect, it } from "vitest";

import { normalizeLiveRequest } from "../../lib/live/requestNormalizer";

describe("live request normalizer", () => {
  it("normalizes supported transaction requests and chain ids", () => {
    const request = normalizeLiveRequest({
      id: "req-1",
      origin: "demo",
      method: "eth_sendTransaction",
      params: [
        {
          from: "0x7777777777777777777777777777777777777777",
          to: "0x1111111111111111111111111111111111111111",
          value: "0x0",
          data: "0x",
          chainId: "0x2105",
        },
      ],
    });

    expect(request.chain.caip2).toBe("eip155:8453");
    expect(request.tx?.to).toBe("0x1111111111111111111111111111111111111111");
    expect(request.unsupportedReason).toBeUndefined();
  });

  it("marks unsafe methods as unsupported", () => {
    const request = normalizeLiveRequest({
      id: "req-2",
      origin: "demo",
      method: "eth_sendRawTransaction",
      params: ["0xdeadbeef"],
    });

    expect(request.unsupportedReason).toContain("bypasses readable transaction review");
  });

  it("uses session chain id for non-transaction requests", () => {
    const request = normalizeLiveRequest({
      id: "typed",
      origin: "demo",
      method: "eth_signTypedData_v4",
      params: ["0x7777777777777777777777777777777777777777", "{}"],
      chainId: "eip155:84532",
    });

    expect(request.chain.caip2).toBe("eip155:84532");
  });

  it("normalizes wallet capability probes without marking them unsupported", () => {
    const request = normalizeLiveRequest({
      id: "capabilities",
      origin: "app.uniswap.org",
      method: "wallet_getCapabilities",
      params: ["0x7777777777777777777777777777777777777777"],
      chainId: "eip155:1",
    });

    expect(request.method).toBe("wallet_getCapabilities");
    expect(request.chain.caip2).toBe("eip155:1");
    expect(request.unsupportedReason).toBeUndefined();
  });

  it("marks unknown WalletConnect chains unsupported instead of defaulting silently", () => {
    const request = normalizeLiveRequest({
      id: "polygon",
      origin: "demo",
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x89" }],
      chainId: "eip155:137",
    });

    expect(request.unsupportedChainId).toBe("0x89");
    expect(request.unsupportedReason).toContain("Unsupported chain 0x89");
    expect(request.chain.caip2).toBe("eip155:1");
  });
});
