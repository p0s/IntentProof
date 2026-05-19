import { describe, expect, it } from "vitest";

import { buildWalletCapabilitiesResponse } from "../../lib/live/capabilities";
import { normalizeLiveRequest } from "../../lib/live/requestNormalizer";

describe("wallet capabilities response", () => {
  it("returns EIP-5792 per-chain capability objects", () => {
    const request = normalizeLiveRequest({
      id: "capabilities",
      origin: "app.uniswap.org",
      method: "wallet_getCapabilities",
      params: [
        "0x7777777777777777777777777777777777777777",
        ["0x1", "0x2105"],
      ],
      chainId: "eip155:1",
    });

    expect(buildWalletCapabilitiesResponse(request)).toEqual({
      "0x1": {},
      "0x2105": {},
    });
  });

  it("normalizes chain ids and omits unsupported requested chains", () => {
    const request = normalizeLiveRequest({
      id: "capabilities",
      origin: "app.uniswap.org",
      method: "wallet_getCapabilities",
      params: [
        "0x7777777777777777777777777777777777777777",
        ["0x14A34", "0x89"],
      ],
      chainId: "eip155:84532",
    });

    expect(buildWalletCapabilitiesResponse(request)).toEqual({
      "0x14a34": {},
    });
  });

  it("falls back to the request chain when the DApp omits the chain list", () => {
    const request = normalizeLiveRequest({
      id: "capabilities",
      origin: "app.uniswap.org",
      method: "wallet_getCapabilities",
      params: ["0x7777777777777777777777777777777777777777"],
      chainId: "eip155:11155111",
    });

    expect(buildWalletCapabilitiesResponse(request)).toEqual({
      "0xaa36a7": {},
    });
  });
});
