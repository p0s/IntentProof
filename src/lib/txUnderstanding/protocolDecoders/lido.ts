import type { LiveRequest } from "../../live/types";
import type { TransactionUnderstanding } from "../types";
import { formatNativeValue, selector } from "./helpers";

const LIDO_STETH = "0xae7ab96520de3a18e5e111b5eaab095312d7fe84";
const LIDO_SUBMIT_SELECTOR = "0xa1903eab";

export function decodeLidoRequest(
  request: LiveRequest,
): TransactionUnderstanding | undefined {
  if (
    request.method !== "eth_sendTransaction" ||
    request.tx?.to?.toLowerCase() !== LIDO_STETH ||
    selector(request.tx.data) !== LIDO_SUBMIT_SELECTOR
  ) {
    return undefined;
  }

  const value = formatNativeValue(request) ?? "ETH value from the transaction";
  return {
    protocolName: "Lido",
    protocolConfidence: "known",
    contractLabel: "Lido stETH",
    actionKind: "stake",
    actionTitle: "Stake ETH with Lido",
    userSummary: `Stake ${value} with Lido and receive stETH if accepted.`,
    valueSummary: value,
    recipient: request.tx.to,
    decodeQuality: "full-protocol-decode",
    assetAuthorityKind: "value-transfer",
    riskLevel: "needs-review",
    riskReasons: ["Staking sends ETH to the Lido stETH contract."],
    userChecks: [
      "Confirm the ETH amount.",
      "Confirm the target contract is the Lido stETH contract.",
    ],
    simulationStatus: "pending",
    evidence: ["Lido submit(address) selector and stETH contract recognized."],
    advanced: { selector: LIDO_SUBMIT_SELECTOR },
  };
}
