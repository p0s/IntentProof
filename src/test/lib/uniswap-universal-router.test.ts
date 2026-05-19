import { describe, expect, it } from "vitest";

import { decodeUniversalRouterRequest } from "../../lib/live/uniswapUniversalRouter";
import { normalizeLiveRequest } from "../../lib/live/requestNormalizer";
import {
  buildUniversalRouterUnsupportedV4Calldata,
  buildUniversalRouterV3ExactInCalldata,
} from "./uniswap-universal-router-fixtures";

const UNIVERSAL_ROUTER = "0x4c82d1fbfe28c977cbb58d8c7ff8fcf9f70a2cca";

describe("Uniswap Universal Router decoder", () => {
  it("decodes common V3 exact-in command streams", () => {
    const request = normalizeLiveRequest({
      id: "uniswap-v3",
      origin: "app.uniswap.org",
      method: "eth_sendTransaction",
      params: [
        {
          from: "0x7777777777777777777777777777777777777777",
          to: UNIVERSAL_ROUTER,
          value: "0x0",
          data: buildUniversalRouterV3ExactInCalldata(),
          chainId: "0x1",
        },
      ],
    });

    const decoded = decodeUniversalRouterRequest(request);

    expect(decoded?.supported).toBe(true);
    expect(decoded?.commands).toHaveLength(1);
    expect(decoded?.commands[0]?.name).toBe("V3_SWAP_EXACT_IN");
    expect(decoded?.summary).toContain("V3 exact-in swap");
    expect(decoded?.summary).toContain("9900000");
  });

  it("marks unsupported command streams as not supported", () => {
    const request = normalizeLiveRequest({
      id: "uniswap-v4",
      origin: "app.uniswap.org",
      method: "eth_sendTransaction",
      params: [
        {
          from: "0x7777777777777777777777777777777777777777",
          to: UNIVERSAL_ROUTER,
          value: "0x0",
          data: buildUniversalRouterUnsupportedV4Calldata(),
          chainId: "0x1",
        },
      ],
    });

    const decoded = decodeUniversalRouterRequest(request);

    expect(decoded?.supported).toBe(false);
    expect(decoded?.unsupportedCommandNames).toContain("V4_SWAP");
  });
});
