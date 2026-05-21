import { describe, expect, it } from "vitest";

import {
  decodeErc20Request,
  decodeLidoRequest,
  decodeSignatureRequest,
  decodeUniswapUniversalRouterRequest,
} from "../../lib/txUnderstanding/protocolDecoders";
import { normalizeLiveRequest } from "../../lib/live/requestNormalizer";
import {
  buildUniversalRouterUnsupportedV4Calldata,
  buildUniversalRouterV3ExactInCalldata,
} from "./uniswap-universal-router-fixtures";

describe("protocol decoders", () => {
  it("decodes Uniswap V3 routes and partially decodes V4 routes", () => {
    const v3 = normalizeLiveRequest({
      id: "v3",
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
    const v4 = normalizeLiveRequest({
      id: "v4",
      origin: "app.uniswap.org",
      method: "eth_sendTransaction",
      params: [
        {
          from: "0x7777777777777777777777777777777777777777",
          to: "0x4c82d1fbfe28c977cbb58d8c7ff8fcf9f70a2cca",
          value: "0x1",
          data: buildUniversalRouterUnsupportedV4Calldata(),
          chainId: "0x1",
        },
      ],
    });

    expect(decodeUniswapUniversalRouterRequest(v3)).toMatchObject({
      decodeQuality: "full-protocol-decode",
      tokenIn: "USDC",
      tokenOut: "WETH",
    });
    expect(decodeUniswapUniversalRouterRequest(v4)).toMatchObject({
      decodeQuality: "partial-protocol-decode",
      actionKind: "swap",
      riskLevel: "needs-review",
    });
  });

  it("decodes Lido, ERC-20 approval, and signatures through dedicated decoders", () => {
    const lido = normalizeLiveRequest({
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
    const approval = normalizeLiveRequest({
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
    const signature = normalizeLiveRequest({
      id: "signature",
      origin: "app.ens.domains",
      method: "personal_sign",
      params: [
        "0x5369676e20696e746f20454e53",
        "0x7777777777777777777777777777777777777777",
      ],
      chainId: "eip155:1",
    });

    expect(decodeLidoRequest(lido)?.actionTitle).toBe("Stake ETH with Lido");
    expect(decodeErc20Request(approval)).toMatchObject({
      actionKind: "approval",
      assetAuthorityKind: "limited-token-approval",
    });
    expect(decodeSignatureRequest(signature)).toMatchObject({
      actionKind: "signature",
      decodeQuality: "full-protocol-decode",
    });
  });
});
