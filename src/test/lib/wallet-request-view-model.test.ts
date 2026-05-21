import { describe, expect, it } from "vitest";

import { defaultFirewallSettings } from "../../lib/intentproof";
import { evaluateLiveRequestPolicy } from "../../lib/live/livePolicyBridge";
import { normalizeLiveRequest } from "../../lib/live/requestNormalizer";
import { buildWalletRequestViewModel } from "../../lib/live/walletRequestViewModel";
import {
  buildUniversalRouterEthToUsdtCalldata,
  ETH_TO_USDT_AMOUNT_IN,
} from "./uniswap-universal-router-fixtures";

function buildEthToUsdtRequest() {
  return normalizeLiveRequest({
    id: "uniswap-eth-usdt",
    origin: "app.uniswap.org",
    method: "eth_sendTransaction",
    params: [
      {
        from: "0x7777777777777777777777777777777777777777",
        to: "0x4c82d1fbfe28c977cbb58d8c7ff8fcf9f70a2cca",
        value: `0x${ETH_TO_USDT_AMOUNT_IN.toString(16)}`,
        data: buildUniversalRouterEthToUsdtCalldata(),
        chainId: "0x1",
      },
    ],
  });
}

describe("wallet request view model", () => {
  it("renders a Uniswap ETH to USDT swap as a wallet confirmation", () => {
    const request = buildEthToUsdtRequest();
    const decision = evaluateLiveRequestPolicy({
      request,
      firewall: defaultFirewallSettings,
    });
    const viewModel = buildWalletRequestViewModel({ request, decision });
    const joinedMainCopy = [
      viewModel.rowTitle,
      viewModel.impactLine,
      viewModel.whatItWants,
      ...viewModel.whatCanChange,
      viewModel.resultTitle,
      viewModel.resultBody,
    ].join(" ");

    expect(viewModel.rowTitle).toBe("Swap 0.000597 ETH → USDT");
    expect(viewModel.impactLine).toBe(
      "Sends 0.000597 ETH · Minimum received 1.233192 USDT",
    );
    expect(viewModel.whatCanChange).toEqual(
      expect.arrayContaining([
        "Sends 0.000597 ETH",
        "Router wraps ETH to WETH before the swap",
        "Swaps WETH → USDT",
        "Minimum received: 1.233192 USDT",
        "No Permit2 permission detected",
      ]),
    );
    expect(viewModel.resultTitle).toBe("Recognized Uniswap request · Needs review");
    expect(joinedMainCopy).not.toMatch(/encoded token amount/i);
    expect(joinedMainCopy).not.toMatch(/0xdac1/i);
    expect(viewModel.advancedFacts).toEqual(
      expect.arrayContaining([
        {
          label: "Raw input amount",
          value: ETH_TO_USDT_AMOUNT_IN.toString(),
        },
        {
          label: "Raw minimum output",
          value: "1233192",
        },
      ]),
    );
  });
});
