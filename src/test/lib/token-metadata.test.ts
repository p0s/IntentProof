import { describe, expect, it } from "vitest";

import {
  formatTokenQuantity,
  getKnownTokenMetadata,
  resolveTokenMetadata,
} from "../../lib/tokenMetadata";

describe("token metadata", () => {
  it("resolves Ethereum USDT and formats quantities with token decimals", () => {
    const metadata = getKnownTokenMetadata(
      "ethereum",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    );

    expect(metadata).toMatchObject({
      symbol: "USDT",
      decimals: 6,
      source: "known-mainnet",
    });
    expect(
      formatTokenQuantity({
        amount: 1_233_192n,
        metadata,
      }),
    ).toBe("1.233192 USDT");
  });

  it("returns a stable unknown-token label without raw units for main UI", async () => {
    const metadata = await resolveTokenMetadata(
      "ethereum",
      "0x1111111111111111111111111111111111111111",
    );

    expect(metadata.symbol).toBe("unknown token 0x1111...1111");
    expect(formatTokenQuantity({ amount: 123n, metadata })).toBe(
      "unknown token 0x1111...1111",
    );
  });
});
