import type { LiveRequest } from "../../live/types";
import type { TransactionUnderstanding } from "../types";
import {
  decodeWordAddress,
  decodeWordUint,
  formatTokenAmount,
  MAX_UINT256_DECIMAL,
  selector,
  tokenInfo,
} from "./helpers";

const ERC20_APPROVE_SELECTOR = "0x095ea7b3";
const ERC20_TRANSFER_SELECTOR = "0xa9059cbb";

export function decodeErc20Request(
  request: LiveRequest,
): TransactionUnderstanding | undefined {
  const data = request.tx?.data;
  const selected = selector(data);
  if (!data || (selected !== ERC20_APPROVE_SELECTOR && selected !== ERC20_TRANSFER_SELECTOR)) {
    return undefined;
  }

  const token = tokenInfo(request.chain.chainKey, request.tx?.to);
  const tokenLabel = token?.symbol ?? "token";

  if (selected === ERC20_APPROVE_SELECTOR) {
    const spender = decodeWordAddress(data, 0);
    const amount = decodeWordUint(data, 1);
    const amountLabel =
      amount?.toString() === MAX_UINT256_DECIMAL
        ? "Unlimited"
        : formatTokenAmount(request.chain.chainKey, request.tx?.to, amount);
    const unlimited = amount?.toString() === MAX_UINT256_DECIMAL;
    return {
      protocolName: request.origin,
      protocolConfidence: "probable",
      actionKind: "approval",
      actionTitle: `Approve ${tokenLabel} spending`,
      userSummary: `Allow a spender contract to spend ${tokenLabel} from this wallet. Amount: ${amountLabel ?? "unknown"}.`,
      tokenIn: tokenLabel,
      spender,
      amountIn: amountLabel,
      decodeQuality: "full-protocol-decode",
      assetAuthorityKind: unlimited ? "unlimited-token-approval" : "limited-token-approval",
      riskLevel: unlimited ? "high-impact-permission" : "needs-review",
      riskReasons: [
        unlimited
          ? "Unlimited approvals stay usable until revoked."
          : "Limited token approval grants spend authority for the decoded amount.",
      ],
      userChecks: [
        "Confirm the spender address in the connected wallet.",
        unlimited
          ? "Only grant unlimited approval if you deliberately trust this spender."
          : "Confirm the amount matches the action you initiated.",
      ],
      simulationStatus: "pending",
      evidence: ["ERC-20 approve(address,uint256) fully decoded."],
      advanced: { token: request.tx?.to, amount: amount?.toString() },
    };
  }

  const recipient = decodeWordAddress(data, 0);
  const amount = decodeWordUint(data, 1);
  const amountLabel = formatTokenAmount(request.chain.chainKey, request.tx?.to, amount);
  return {
    protocolName: request.origin,
    protocolConfidence: "probable",
    actionKind: "transfer",
    actionTitle: `${tokenLabel} transfer`,
    userSummary: `Transfer ${amountLabel ?? "an unknown amount"} to ${recipient ?? "an unknown recipient"}.`,
    recipient,
    amountIn: amountLabel,
    tokenIn: tokenLabel,
    decodeQuality: "full-protocol-decode",
    assetAuthorityKind: "value-transfer",
    riskLevel: "needs-review",
    riskReasons: ["Token transfer moves value from the selected account."],
    userChecks: ["Confirm the full recipient address and amount in the connected wallet."],
    simulationStatus: "pending",
    evidence: ["ERC-20 transfer(address,uint256) fully decoded."],
    advanced: { token: request.tx?.to, amount: amount?.toString() },
  };
}
