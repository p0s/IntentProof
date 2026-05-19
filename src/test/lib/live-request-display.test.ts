import { describe, expect, it } from "vitest";

import {
  describeLiveRequestAction,
  describeLiveRequestMethod,
} from "../../lib/live/requestDisplay";
import { normalizeLiveRequest } from "../../lib/live/requestNormalizer";

describe("live request display labels", () => {
  it("labels Uniswap Universal Router execute calldata as a swap transaction", () => {
    const request = normalizeLiveRequest({
      id: "swap",
      origin: "Uniswap",
      method: "eth_sendTransaction",
      params: [
        {
          from: "0x7777777777777777777777777777777777777777",
          to: "0x4c82d1fbfe28c977cbb58d8c7ff8fcf9f70a2cca",
          value: "0x0",
          data: "0x3593564c00000000",
          chainId: "0x1",
        },
      ],
    });

    expect(describeLiveRequestAction(request)).toBe("Swap transaction");
    expect(describeLiveRequestMethod(request)).toBe(
      "Swap transaction (eth_sendTransaction)",
    );
  });

  it("keeps unknown writes labeled as transaction requests", () => {
    const request = normalizeLiveRequest({
      id: "unknown",
      origin: "DApp",
      method: "eth_sendTransaction",
      params: [
        {
          from: "0x7777777777777777777777777777777777777777",
          to: "0x1111111111111111111111111111111111111111",
          value: "0x0",
          data: "0x12345678",
          chainId: "0xaa36a7",
        },
      ],
    });

    expect(describeLiveRequestAction(request)).toBe("Transaction request");
  });
});
