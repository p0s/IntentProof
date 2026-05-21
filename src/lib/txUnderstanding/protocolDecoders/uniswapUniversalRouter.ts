import type { LiveRequest } from "../../live/types";
import {
  decodeUniversalRouterRequest,
  type DecodedUniversalRouterCommand,
} from "../../live/uniswapUniversalRouter";
import type { TransactionUnderstanding } from "../types";
import {
  formatNativeValue,
  formatNativeValueExact,
  formatTokenAmount,
  shortAddress,
  tokenLabel,
  nativeValueWei,
} from "./helpers";

function commandAmountIn(request: LiveRequest, command?: DecodedUniversalRouterCommand) {
  const token = command?.tokenPath?.[0] ?? command?.token;
  return formatTokenAmount(
    request.chain.chainKey,
    token,
    command?.amountIn ?? command?.amountInMaximum,
  );
}

function commandAmountOut(request: LiveRequest, command?: DecodedUniversalRouterCommand) {
  const token = command?.tokenPath?.at(-1);
  return formatTokenAmount(
    request.chain.chainKey,
    token,
    command?.amountOutMinimum ?? command?.amountOut,
  );
}

function routeSymbols(request: LiveRequest, command?: DecodedUniversalRouterCommand) {
  return command?.tokenPath
    ?.map((token) => tokenLabel(request.chain.chainKey, token))
    .join(" → ");
}

export function decodeUniswapUniversalRouterRequest(
  request: LiveRequest,
): TransactionUnderstanding | undefined {
  const plan = decodeUniversalRouterRequest(request);
  if (!plan) return undefined;

  const swap = plan.commands.find((command) => command.tokenPath?.length);
  const v4Command = plan.commands.find((command) => command.name === "V4_SWAP");
  const firstCommand = swap ?? v4Command ?? plan.commands[0];
  const amountIn = commandAmountIn(request, swap);
  const minAmountOut = commandAmountOut(request, swap);
  const nativeValue = formatNativeValue(request);
  const nativeValueExact = formatNativeValueExact(request);
  const route = routeSymbols(request, swap);
  const amountPhrase = amountIn ?? nativeValue ?? "encoded input amount";
  const title = v4Command && !swap
    ? `Swap ${amountPhrase} through Universal Router`
    : `Swap ${amountPhrase}${route ? ` through ${route}` : ""}`;
  const partialV4 = Boolean(v4Command?.partial);
  const fullDecode = plan.supported && !partialV4;

  return {
    protocolName: "Uniswap",
    protocolConfidence: "known",
    contractLabel: "Uniswap Universal Router",
    actionKind: "swap",
    actionTitle: title,
    userSummary: partialV4
      ? "Request a Uniswap V4 swap through Universal Router. IntentProof recognizes the router and V4 action, but cannot fully display the final token route yet."
      : `Swap ${amountPhrase}${minAmountOut ? ` for at least ${minAmountOut}` : ""}${route ? ` through ${route}` : ""}.`,
    valueSummary: nativeValue,
    tokenIn: swap?.tokenPath?.[0]
      ? tokenLabel(request.chain.chainKey, swap.tokenPath[0])
      : undefined,
    tokenOut: swap?.tokenPath?.at(-1)
      ? tokenLabel(request.chain.chainKey, swap.tokenPath.at(-1))
      : undefined,
    amountIn,
    minAmountOut,
    recipient: firstCommand?.recipient,
    router: request.tx?.to,
    decodeQuality: fullDecode ? "full-protocol-decode" : "partial-protocol-decode",
    assetAuthorityKind: plan.hasUnlimitedPermit ? "permit2" : nativeValue ? "value-transfer" : "batch",
    riskLevel: plan.hasUnlimitedPermit ? "high-impact-permission" : "needs-review",
    riskReasons: [
      plan.hasUnlimitedPermit
        ? "Universal Router includes an unlimited Permit2 permission."
        : partialV4
          ? "Recognized Uniswap request with partial V4 route decoding."
          : "Swap routes should be reviewed for token in, token out, minimum received, and recipient.",
      partialV4
        ? "V4 route details are partially decoded, so verify token in/out and minimum received in the connected wallet."
        : "Universal Router command stream is recognized.",
    ],
    userChecks: [
      partialV4
        ? "Verify token in, token out, minimum received, and recipient in the connected wallet."
        : "Confirm token path, amount in, minimum received, recipient, and native value.",
      plan.hasUnlimitedPermit
        ? "Review any Permit2 permission before forwarding."
        : "No unlimited Permit2 permission was detected in the decoded commands.",
    ],
    simulationStatus: "pending",
    deterministicImpact: {
      nativeValueOut: nativeValue,
      nativeValueOutExact: nativeValueExact,
      nativeValueOutWei: nativeValueWei(request),
      permit2: plan.hasUnlimitedPermit
        ? "Permit2 permission detected in router command stream"
        : undefined,
    },
    evidence: [
      "Uniswap Universal Router execute(...) envelope decoded.",
      partialV4
        ? `Partial V4 decode: ${(v4Command?.v4Actions ?? ["V4_SWAP"]).join(", ")}.`
        : "Universal Router command stream decoded into route evidence.",
      request.tx?.to ? `Router target: ${shortAddress(request.tx.to)}.` : "Router target unavailable.",
    ],
    advanced: {
      commandsHex: plan.commandsHex,
      commandNames: plan.commands.map((command) => command.name),
      unsupportedCommandNames: plan.unsupportedCommandNames,
      partialCommandNames: plan.partialCommandNames,
      v4Actions: v4Command?.v4Actions,
      nativeValueExact,
      nativeValueWei: nativeValueWei(request),
      summary: plan.summary,
    },
  };
}
