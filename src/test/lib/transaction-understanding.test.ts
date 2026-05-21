import { describe, expect, it } from "vitest";

import { understandLiveRequest } from "../../lib/txUnderstanding/understandLiveRequest";
import { normalizeLiveRequest } from "../../lib/live/requestNormalizer";
import {
  buildUniversalRouterUnsupportedV4Calldata,
  buildUniversalRouterV3ExactInCalldata,
} from "./uniswap-universal-router-fixtures";

describe("transaction understanding", () => {
  it("recognizes canonical and alias Uniswap Universal Router contracts", () => {
    for (const to of [
      "0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b",
      "0x4c82d1fbfe28c977cbb58d8c7ff8fcf9f70a2cca",
    ]) {
      const request = normalizeLiveRequest({
        id: to,
        origin: "app.uniswap.org",
        method: "eth_sendTransaction",
        params: [
          {
            from: "0x7777777777777777777777777777777777777777",
            to,
            value: "0x0",
            data: buildUniversalRouterV3ExactInCalldata(),
            chainId: "0x1",
          },
        ],
      });

      const understanding = understandLiveRequest(request);

      expect(understanding.protocolName).toBe("Uniswap");
      expect(understanding.protocolConfidence).toBe("known");
      expect(understanding.actionKind).toBe("swap");
      expect(understanding.decodeQuality).toBe("full-protocol-decode");
      expect(understanding.riskLevel).toBe("needs-review");
      expect(understanding.riskLevel).not.toBe("high-impact-permission");
    }
  });

  it("recognizes Uniswap V4_SWAP as a partial V4 protocol decode", () => {
    const request = normalizeLiveRequest({
      id: "uniswap-v4",
      origin: "app.uniswap.org",
      method: "eth_sendTransaction",
      params: [
        {
          from: "0x7777777777777777777777777777777777777777",
          to: "0x4c82d1fbfe28c977cbb58d8c7ff8fcf9f70a2cca",
          value: "0x21c786a8c28000",
          data: buildUniversalRouterUnsupportedV4Calldata(),
          chainId: "0x1",
        },
      ],
    });

    const understanding = understandLiveRequest(request);

    expect(understanding.protocolName).toBe("Uniswap");
    expect(understanding.actionKind).toBe("swap");
    expect(understanding.decodeQuality).toBe("partial-protocol-decode");
    expect(understanding.actionTitle).toContain("Universal Router");
    expect(understanding.userSummary).toContain("Recognized Uniswap V4 swap");
    expect(understanding.evidence.join(" ")).toContain("Partial V4 decode");
    expect(understanding.assetAuthorityKind).toBe("value-transfer");
    expect(understanding.riskLevel).toBe("needs-review");
  });

  it("decodes Lido submit as ETH staking", () => {
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

    const understanding = understandLiveRequest(request);

    expect(understanding.protocolName).toBe("Lido");
    expect(understanding.actionTitle).toBe("Stake ETH with Lido");
    expect(understanding.valueSummary).toBe("0.01 ETH");
    expect(understanding.decodeQuality).toBe("full-protocol-decode");
  });

  it("classifies limited and unlimited ERC-20 approvals separately", () => {
    const limited = normalizeLiveRequest({
      id: "limited",
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
    const unlimited = normalizeLiveRequest({
      id: "unlimited",
      origin: "curve.fi",
      method: "eth_sendTransaction",
      params: [
        {
          from: "0x7777777777777777777777777777777777777777",
          to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
          value: "0x0",
          data: "0x095ea7b30000000000000000000000009999999999999999999999999999999999999999ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
          chainId: "0x1",
        },
      ],
    });

    expect(understandLiveRequest(limited).assetAuthorityKind).toBe("limited-token-approval");
    expect(understandLiveRequest(limited).riskLevel).toBe("needs-review");
    expect(understandLiveRequest(unlimited).assetAuthorityKind).toBe("unlimited-token-approval");
    expect(understandLiveRequest(unlimited).riskLevel).toBe("high-impact-permission");
  });

  it("recognizes typed data and routine coordination requests", () => {
    const typed = normalizeLiveRequest({
      id: "ens",
      origin: "app.ens.domains",
      method: "eth_signTypedData_v4",
      params: [
        "0x7777777777777777777777777777777777777777",
        JSON.stringify({
          domain: { name: "ENS", chainId: 1 },
          primaryType: "Commitment",
          message: { name: "alice.eth" },
        }),
      ],
      chainId: "eip155:1",
    });
    const chain = normalizeLiveRequest({
      id: "chain",
      origin: "tokenlon.im",
      method: "eth_chainId",
      params: [],
      chainId: "eip155:1",
    });

    expect(understandLiveRequest(typed)).toMatchObject({
      actionKind: "signature",
      signatureDomain: "ENS",
      riskLevel: "needs-review",
    });
    expect(understandLiveRequest(chain)).toMatchObject({
      actionKind: "coordination",
      riskLevel: "routine",
    });
  });
});
