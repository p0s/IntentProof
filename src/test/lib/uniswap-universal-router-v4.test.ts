import { describe, expect, it } from "vitest";

import { decodeUniversalRouterRequest } from "../../lib/live/uniswapUniversalRouter";
import { normalizeLiveRequest } from "../../lib/live/requestNormalizer";
import { buildUniversalRouterUnsupportedV4Calldata } from "./uniswap-universal-router-fixtures";

describe("Uniswap Universal Router V4 command handling", () => {
  it("recognizes V4_SWAP as partial protocol decode rather than unknown", () => {
    const request = normalizeLiveRequest({
      id: "uniswap-v4",
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

    const decoded = decodeUniversalRouterRequest(request);

    expect(decoded?.supported).toBe(false);
    expect(decoded?.hasPartialProtocolDecode).toBe(true);
    expect(decoded?.partialCommandNames).toContain("V4_SWAP");
    expect(decoded?.summary).toContain("Recognized Uniswap V4 swap");
    expect(decoded?.commands[0]?.v4Actions).toEqual(["UNKNOWN_ACTION_0x1"]);
  });
});
