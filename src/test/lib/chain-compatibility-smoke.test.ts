import { describe, expect, it } from "vitest";

import {
  getChainConfig,
  getChainKeyById,
  getMainnetChainConfigs,
  getTokenPresets,
  parseDemoChainKey,
} from "../../lib/chains";
import { parsePolicyDocument } from "../../lib/policy";
import { createTemplateTransaction } from "../../lib/templates";
import type { PolicyRule } from "../../lib/types";
import defaultRiskPolicyJson from "../../policies/default-risk-policy.json";

const TESTNET_CHAINS = ["sepolia", "baseSepolia"] as const;
const ALL_READY_CHAINS = ["sepolia", "baseSepolia", "ethereum", "base"] as const;

describe("testnet-default / mainnet-warning forwarding compatibility smoke", () => {
  it("maps chainId to chain key correctly", () => {
    const sepolia = getChainConfig("sepolia");
    const baseSepolia = getChainConfig("baseSepolia");
    const ethereum = getChainConfig("ethereum");
    const base = getChainConfig("base");

    expect(getChainKeyById(sepolia.chainId)).toBe("sepolia");
    expect(getChainKeyById(baseSepolia.chainId)).toBe("baseSepolia");
    expect(getChainKeyById(ethereum.chainId)).toBe("ethereum");
    expect(getChainKeyById(base.chainId)).toBe("base");
    expect(getChainKeyById(999999)).toBeUndefined();
  });

  it("keeps mainnet chains configured for analysis and forwarding metadata", () => {
    expect(getMainnetChainConfigs().map((chain) => chain.key)).toEqual([
      "ethereum",
      "base",
    ]);
    for (const chain of getMainnetChainConfigs()) {
      expect(chain.environment).toBe("mainnet");
      expect(chain.explorerBaseUrl).toMatch(/^https:\/\//);
      expect(chain.wrappedNativeToken.address).toMatch(/^0x/);
      expect(getTokenPresets(chain.key).find((token) => token.symbol === "USDC"))
        .toBeDefined();
    }
  });

  it("parses testnet and mainnet chain aliases", () => {
    expect(parseDemoChainKey("eth-sepolia")).toBe("sepolia");
    expect(parseDemoChainKey("base-sepolia")).toBe("baseSepolia");
    expect(parseDemoChainKey("eth-mainnet")).toBe("ethereum");
    expect(parseDemoChainKey("base-mainnet")).toBe("base");
  });

  it("builds native transfer template for all configured chains", () => {
    for (const chainKey of ALL_READY_CHAINS) {
      const tx = createTemplateTransaction({
        chainKey,
        kind: "nativeTransfer",
        from: "0x1111111111111111111111111111111111111111",
        recipient: "0x2222222222222222222222222222222222222222",
        amount: "0.01",
      });

      expect(tx.chainId).toBe(getChainConfig(chainKey).chainId);
      expect(tx.request.to).toBe("0x2222222222222222222222222222222222222222");
      expect(tx.request.data).toBeUndefined();
      expect(tx.request.value).toBeGreaterThan(0n);
    }
  });

  it("builds uniswap exactInputSingle template for all configured chains", () => {
    for (const chainKey of ALL_READY_CHAINS) {
      const chain = getChainConfig(chainKey);
      const tokenOut = getTokenPresets(chainKey)[0]?.address;
      expect(chain.uniswap.swapRouter02).toBeDefined();
      expect(tokenOut).toBeDefined();

      const tx = createTemplateTransaction({
        chainKey,
        kind: "uniswapV2SwapExactETHForTokens",
        from: "0x1111111111111111111111111111111111111111",
        recipient: "0x1111111111111111111111111111111111111111",
        tokenOut,
        amountIn: "0.01",
        amountOutMin: "1",
        tokenOutDecimals: "6",
        feeBps: "500",
      });

      expect(tx.request.to?.toLowerCase()).toBe(
        chain.uniswap.swapRouter02?.toLowerCase(),
      );
      expect(tx.request.data?.slice(0, 10)).toBe("0x04e45aaf");
    }
  });

  it("keeps default policy token mapping aligned with chain presets", () => {
    const document = parsePolicyDocument(JSON.stringify(defaultRiskPolicyJson));
    const tokenRules = document.policies.filter(
      (policy) => policy.type === "maxAssetOut" && policy.assetKind === "erc20",
    ) as Array<Extract<PolicyRule, { type: "maxAssetOut" }>>;

    for (const chainKey of ALL_READY_CHAINS) {
      const presetMap = new Map(
        getTokenPresets(chainKey).map((token) => [
          token.symbol.toLowerCase(),
          token.address.toLowerCase(),
        ]),
      );

      for (const rule of tokenRules) {
        const expected = presetMap.get(rule.symbol.toLowerCase());
        const configured = rule.tokenAddressByChain?.[chainKey]?.toLowerCase();
        expect(configured).toBe(expected);
      }
    }
  });

  it("keeps the product default on testnets", () => {
    for (const chainKey of TESTNET_CHAINS) {
      expect(getChainConfig(chainKey).environment).toBe("testnet");
    }
  });
});
