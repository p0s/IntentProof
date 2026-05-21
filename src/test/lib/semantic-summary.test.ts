import { describe, expect, it } from "vitest";

import { normalizeLiveRequest } from "../../lib/live/requestNormalizer";
import { summarizeLiveRequest } from "../../lib/live/semanticSummary";
import {
  buildUniversalRouterUnsupportedV4Calldata,
  buildUniversalRouterV3ExactInCalldata,
} from "./uniswap-universal-router-fixtures";

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

    expect(summary.title).toContain("Swap 10 USDC");
    expect(summary.whatItWants).toMatch(/Swap/i);
    expect(summary.whatItWants).toMatch(/USDC|WETH|encoded token amount/i);
    expect(summary.whatItWants).not.toMatch(/raw units/i);
    expect(summary.chips).toContain("Uniswap");
  });

  it("summarizes Uniswap V4 partial decode as recognized review work", () => {
    const request = normalizeLiveRequest({
      id: "uniswap-v4",
      origin: "app.uniswap.org",
      method: "eth_sendTransaction",
      params: [
        {
          from: "0x7777777777777777777777777777777777777777",
          to: "0x4c82d1fbfe28c977cbb58d8c7ff8fcf9f70a2cca",
          value: "0x21f1caa940e86",
          data: buildUniversalRouterUnsupportedV4Calldata(),
          chainId: "0x1",
        },
      ],
    });

    const summary = summarizeLiveRequest(request);

    expect(summary.title).toContain("Swap 0.000597 ETH");
    expect(summary.whatItWants).toBe(
      "Request a Uniswap V4 swap through Universal Router. IntentProof recognizes the router and V4 action, but cannot fully display the final token route yet.",
    );
    expect(summary.primaryAmount).toBe("0.000597 ETH");
    expect(summary.chips).toContain("Recognized protocol");
    expect(summary.chips).toContain("Partial V4 decode");
    expect(summary.whatItWants).not.toMatch(/cannot fully display yet$/i);
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

    expect(summary.title).toBe("Approve USDC spending");
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

  it("gives unknown contract calls a useful generic summary", () => {
    const request = normalizeLiveRequest({
      id: "unknown-call",
      origin: "tokenlon.im",
      method: "eth_sendTransaction",
      params: [
        {
          from: "0x7777777777777777777777777777777777777777",
          to: "0x2222222222222222222222222222222222222222",
          value: "0x2386f26fc10000",
          data: "0x36ac25a20000000000000000000000000000000000000000000000000000000000000001",
          chainId: "0x1",
        },
      ],
    });

    const summary = summarizeLiveRequest(request);

    expect(summary.whatItWants).toContain("0x2222222222222222222222222222222222222222");
    expect(summary.whatItWants).toContain("selector 0x36ac25a2");
    expect(summary.whatItWants).toContain("0.01 ETH");
    expect(summary.whyDappNeedsIt ?? summary.userShouldCheck.join(" ")).toMatch(/not fully decoded/i);
    expect(summary.userShouldCheck.join(" ")).toMatch(/does not prove/i);
    expect(summary.whatItWants).not.toMatch(/specialized summary/i);
  });
});
