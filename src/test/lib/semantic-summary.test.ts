import { describe, expect, it } from "vitest";

import { normalizeLiveRequest } from "../../lib/live/requestNormalizer";
import { summarizeLiveRequest } from "../../lib/live/semanticSummary";
import { buildUniversalRouterV3ExactInCalldata } from "./uniswap-universal-router-fixtures";

describe("live semantic summaries", () => {
  it("formats a decoded Uniswap route with token decimals", () => {
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

    const summary = summarizeLiveRequest(request);

    expect(summary.title).toBe("Swap transaction");
    expect(summary.whatItWants).toMatch(/Swap/i);
    expect(summary.whatItWants).toMatch(/USDC|WETH|raw units/i);
    expect(summary.chips).toContain("Uniswap");
  });

  it("summarizes ERC-20 approvals with spender and amount", () => {
    const request = normalizeLiveRequest({
      id: "approval",
      origin: "curve.fi",
      method: "eth_sendTransaction",
      params: [
        {
          from: "0x7777777777777777777777777777777777777777",
          to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
          value: "0x0",
          data: "0x095ea7b3000000000000000000000000999999999999999999999999999999999999999900000000000000000000000000000000000000000000000000000000004c4b40",
          chainId: "0x1",
        },
      ],
    });

    const summary = summarizeLiveRequest(request);

    expect(summary.title).toBe("USDC approval");
    expect(summary.spender).toBe("0x9999999999999999999999999999999999999999");
    expect(summary.primaryAmount).toBe("5 USDC");
    expect(summary.whatItWants).toContain("Allow Curve");
  });

  it("summarizes Lido submit as ETH staking", () => {
    const request = normalizeLiveRequest({
      id: "lido",
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

    const summary = summarizeLiveRequest(request);

    expect(summary.title).toBe("Stake ETH with Lido");
    expect(summary.whatItWants).toContain("Stake 0.01 ETH");
    expect(summary.chips).toContain("stETH");
  });

  it("summarizes personal and typed-data signatures", () => {
    const personal = normalizeLiveRequest({
      id: "personal",
      origin: "app.ens.domains",
      method: "personal_sign",
      params: [
        "0x5369676e20696e746f20454e53",
        "0x7777777777777777777777777777777777777777",
      ],
      chainId: "eip155:1",
    });
    const typed = normalizeLiveRequest({
      id: "typed",
      origin: "app.ens.domains",
      method: "eth_signTypedData_v4",
      params: [
        "0x7777777777777777777777777777777777777777",
        JSON.stringify({
          domain: {
            name: "ENS",
            chainId: 1,
            verifyingContract: "0x253553366da8546fc250f225fe3d25d0c782303b",
          },
          primaryType: "Commitment",
          message: { label: "alice" },
        }),
      ],
      chainId: "eip155:1",
    });

    expect(summarizeLiveRequest(personal).whatItWants).toContain("Sign into ENS");
    const typedSummary = summarizeLiveRequest(typed);
    expect(typedSummary.title).toBe("Typed-data signature");
    expect(typedSummary.whatItWants).toContain("Commitment");
    expect(typedSummary.userShouldCheck.join(" ")).toContain(
      "0x253553366da8546fc250f225fe3d25d0c782303b",
    );
  });

  it("explains network switch targets", () => {
    const request = normalizeLiveRequest({
      id: "switch-base",
      origin: "app.uniswap.org",
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x2105" }],
      chainId: "eip155:1",
    });

    const summary = summarizeLiveRequest(request);

    expect(summary.title).toBe("Switch to Base Mainnet");
    expect(summary.whatItWants).toContain("Base Mainnet");
    expect(summary.chips).toContain("Network switch");
  });
});
