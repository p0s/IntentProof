import { decodeFunctionData, parseAbi } from "viem";

import type { LiveRequest } from "../../live/types";
import type { TransactionUnderstanding } from "../types";
import {
  formatTokenAmount,
  MAX_UINT256_DECIMAL,
  shortAddress,
  tokenLabel,
} from "./helpers";

const PERMIT2_ADDRESS = "0x000000000022d473030f116ddee9f6b43ac78ba3";
const MAX_UINT160 = (1n << 160n) - 1n;
const PERMIT2_ABI = parseAbi([
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
]);

export function decodePermit2Request(
  request: LiveRequest,
): TransactionUnderstanding | undefined {
  if (
    request.method !== "eth_sendTransaction" ||
    request.tx?.to?.toLowerCase() !== PERMIT2_ADDRESS ||
    !request.tx.data
  ) {
    return undefined;
  }

  try {
    const decoded = decodeFunctionData({
      abi: PERMIT2_ABI,
      data: request.tx.data,
    });
    if (decoded.functionName !== "approve") return undefined;
    const [token, spender, amount, expiration] = decoded.args;
    const unlimited = amount === MAX_UINT160;
    const amountLabel = unlimited
      ? "Unlimited"
      : formatTokenAmount(request.chain.chainKey, token, amount) ?? amount.toString();
    return {
      protocolName: "Permit2",
      protocolConfidence: "known",
      contractLabel: "Permit2",
      actionKind: "approval",
      actionTitle: `Permit2 ${tokenLabel(request.chain.chainKey, token)} approval`,
      userSummary: `Allow ${shortAddress(spender)} to spend ${amountLabel} through Permit2.`,
      spender,
      amountIn: amountLabel,
      tokenIn: tokenLabel(request.chain.chainKey, token),
      decodeQuality: "full-protocol-decode",
      assetAuthorityKind: "permit2",
      riskLevel: unlimited ? "high-impact-permission" : "needs-review",
      riskReasons: [
        unlimited
          ? "Unlimited Permit2 permission can remain active until revoked."
          : "Permit2 grants token spending authority to the decoded spender.",
      ],
      userChecks: [
        "Confirm the token, spender, amount, and expiry in the connected wallet.",
        unlimited ? "Unlimited Permit2 approvals deserve extra caution." : "Confirm the expiry is expected.",
      ],
      simulationStatus: "pending",
      evidence: ["Permit2 approve(address,address,uint160,uint48) fully decoded."],
      advanced: {
        token,
        spender,
        amount: unlimited ? MAX_UINT256_DECIMAL : amount.toString(),
        expiration: expiration.toString(),
      },
    };
  } catch {
    return undefined;
  }
}
