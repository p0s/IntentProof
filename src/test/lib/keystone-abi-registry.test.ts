import { encodeFunctionData } from "viem";
import { describe, expect, it, vi } from "vitest";

import { decodeParsedInput } from "../../lib/decode";
import { defaultFirewallSettings } from "../../lib/intentproof";
import { lookupKeystoneAbiRegistry } from "../../lib/keystoneAbiRegistry";
import { evaluateLiveRequestPolicy } from "../../lib/live/livePolicyBridge";
import { normalizeLiveRequest } from "../../lib/live/requestNormalizer";
import { evaluatePolicies } from "../../lib/policy";
import type {
  ContractVerificationStatus,
  ParsedInput,
  PolicyDocument,
  SimulationSummary,
} from "../../lib/types";

const unknownVerification: ContractVerificationStatus = {
  verified: false,
  source: "unknown",
  message: "test",
};

const simulation: SimulationSummary = {
  success: true,
  source: "heuristic",
  summary: "test",
  tokenChanges: [],
};

const forbidUnknownPolicy: PolicyDocument = {
  version: 1,
  name: "test",
  policies: [
    {
      id: "forbid-unknown",
      name: "Forbid unknown",
      type: "forbidUnknownFunction",
      level: "high",
    },
    {
      id: "require-verified",
      name: "Require verified",
      type: "requireVerifiedContract",
      level: "high",
    },
  ],
};

describe("Keystone ABI registry", () => {
  it("looks up entries by chainId and address case-insensitively", () => {
    const entry = lookupKeystoneAbiRegistry(
      1,
      "0xEF1C6E67703c7BD7107eed8303Fbe6EC2554BF6B",
    );

    expect(entry?.contractName).toBe("UniversalRouter");
    expect(entry?.address).toBe("0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b");
    expect(entry?.abi.some((item) => item.type === "function")).toBe(true);
  });

  it("decodes a registry ABI when no verified ABI is available", async () => {
    const entry = lookupKeystoneAbiRegistry(
      1,
      "0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b",
    );
    expect(entry).toBeDefined();

    const parsed: ParsedInput = {
      type: "json",
      chainId: 1,
      to: "0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b",
      data: encodeFunctionData({
        abi: entry!.abi,
        functionName: "execute",
        args: ["0x00", ["0x"], 1n],
      }),
      value: 0n,
      raw: "{}",
    };

    const action = await decodeParsedInput("ethereum", parsed, unknownVerification);

    expect(action.functionName).toBe("execute");
    expect(action.decodeSource).toBe("registry");
    expect(action.title).toContain("execute");
  });

  it("keeps unknown contracts on the existing selector/unknown fallback path", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const parsed: ParsedInput = {
      type: "json",
      chainId: 1,
      to: "0x2222222222222222222222222222222222222222",
      data: "0x12345678",
      value: 0n,
      raw: "{}",
    };

    const action = await decodeParsedInput("ethereum", parsed, unknownVerification);

    expect(action.functionName).toBeUndefined();
    expect(action.title).toBe("未知合約呼叫");
    expect(action.selector).toBe("0x12345678");
  });

  it("does not use registry ABI matches to bypass strict policy or verification", async () => {
    const entry = lookupKeystoneAbiRegistry(
      1,
      "0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b",
    );
    const parsed: ParsedInput = {
      type: "json",
      chainId: 1,
      to: "0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b",
      data: encodeFunctionData({
        abi: entry!.abi,
        functionName: "execute",
        args: ["0x00", ["0x"], 1n],
      }),
      value: 0n,
      raw: "{}",
    };

    const action = await decodeParsedInput("ethereum", parsed, unknownVerification);
    const { violations } = evaluatePolicies({
      document: forbidUnknownPolicy,
      chainKey: "ethereum",
      parsed,
      action,
      verification: unknownVerification,
      simulation,
    });

    expect(action.decodeSource).toBe("registry");
    expect(violations.map((violation) => violation.policyId)).toEqual([
      "forbid-unknown",
      "require-verified",
    ]);
  });

  it("does not use registry decoding to bypass approval or mainnet review", () => {
    const approval = normalizeLiveRequest({
      id: "approval",
      origin: "demo",
      method: "eth_sendTransaction",
      params: [
        {
          from: "0x7777777777777777777777777777777777777777",
          to: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
          value: "0x0",
          data: "0x095ea7b30000000000000000000000009999999999999999999999999999999999999999ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
          chainId: "0x1",
        },
      ],
    });

    const decision = evaluateLiveRequestPolicy({
      request: approval,
      firewall: defaultFirewallSettings,
    });

    expect(decision.label).toBe("WARN");
    expect(decision.issues.map((issue) => issue.title)).toContain("Mainnet request");
    expect(decision.issues.map((issue) => issue.title)).toContain(
      "Unlimited approval",
    );
  });
});
