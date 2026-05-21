import { describe, expect, it } from "vitest";

import { resolveContractVerification } from "../../lib/decode";
import { resolveLiveAbiEvidence } from "../../lib/txUnderstanding/abiResolver";
import { normalizeLiveRequest } from "../../lib/live/requestNormalizer";
import { buildUniversalRouterV3ExactInCalldata } from "./uniswap-universal-router-fixtures";

describe("ABI resolver", () => {
  it("uses selected registry metadata and local aliases without treating them as safety proof", async () => {
    const request = normalizeLiveRequest({
      id: "uniswap-alias",
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
    request.evidence = {
      updatedAt: "2026-05-21T00:00:00.000Z",
      decode: {
        status: "decoded",
        source: "common",
        summary: "Uniswap Universal Router protocol decode.",
        functionName: "execute",
        contractVerified: true,
        contractSource: "local",
      },
      simulation: {
        status: "unavailable",
        provider: "none",
        summary: "No simulation.",
        assetChanges: [],
      },
    };

    const verification = await resolveContractVerification(
      "ethereum",
      "0x4c82d1fbfe28c977cbb58d8c7ff8fcf9f70a2cca",
    );
    const evidence = resolveLiveAbiEvidence(request);

    expect(verification.source).toBe("local");
    expect(verification.contractName).toBe("Uniswap Universal Router");
    expect(evidence.decodeQuality).toBe("abi-decode");
    expect(evidence.evidence.join(" ")).toContain("ABI decode available");
  });
});
