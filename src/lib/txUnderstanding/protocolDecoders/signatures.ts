import { hexToString, isHex, type Hex } from "viem";

import type { LiveRequest } from "../../live/types";
import type { TransactionUnderstanding } from "../types";

function readablePersonalSignMessage(request: LiveRequest) {
  const params = Array.isArray(request.params) ? request.params : [];
  const candidate = params.find(
    (item) => typeof item === "string" && !/^0x[a-fA-F0-9]{40}$/.test(item),
  );
  if (typeof candidate !== "string") return undefined;
  if (isHex(candidate)) {
    try {
      const decoded = hexToString(candidate as Hex).replace(/\0+$/g, "");
      return decoded.trim().length > 0 ? decoded : undefined;
    } catch {
      return undefined;
    }
  }
  return candidate;
}

function typedDataRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "string") {
    try {
      return typedDataRecord(JSON.parse(value) as unknown);
    } catch {
      return undefined;
    }
  }
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

export function decodeSignatureRequest(
  request: LiveRequest,
): TransactionUnderstanding | undefined {
  if (request.method === "personal_sign") {
    const message = readablePersonalSignMessage(request);
    return {
      protocolName: request.origin,
      protocolConfidence: "probable",
      actionKind: "signature",
      actionTitle: "Message signature",
      userSummary: message
        ? `Sign this readable message: "${message}".`
        : "Sign a message that is not fully readable as UTF-8 text.",
      signatureDomain: request.origin,
      decodeQuality: message ? "full-protocol-decode" : "partial-protocol-decode",
      assetAuthorityKind: "signature-authority",
      riskLevel: "needs-review",
      riskReasons: ["Message signatures can authorize off-chain login or permissions."],
      userChecks: ["Only sign if the message and DApp match the action you initiated."],
      simulationStatus: "not-applicable",
      evidence: [message ? "Personal-sign message is readable." : "Personal-sign method is recognized."],
      advanced: { messagePreview: message },
    };
  }

  if (request.method !== "eth_signTypedData_v4") return undefined;
  const typed = typedDataRecord(request.typedData);
  const domain = typedDataRecord(typed?.domain);
  const message = typedDataRecord(typed?.message);
  const domainName = stringValue(domain?.name);
  const primaryType = stringValue(typed?.primaryType);
  const verifyingContract = stringValue(domain?.verifyingContract);
  const chainId = domain?.chainId ? String(domain.chainId) : undefined;
  const fields = Object.keys(message ?? {}).slice(0, 6);

  return {
    protocolName: request.origin,
    protocolConfidence: "probable",
    actionKind: "signature",
    actionTitle: "Typed-data signature",
    userSummary: `Sign typed data${primaryType ? ` of type ${primaryType}` : ""}${domainName ? ` for ${domainName}` : ""}.`,
    recipient: verifyingContract,
    signatureDomain: domainName,
    decodeQuality: typed ? "full-protocol-decode" : "partial-protocol-decode",
    assetAuthorityKind: "signature-authority",
    riskLevel: "needs-review",
    riskReasons: ["Typed-data signatures can authorize orders, logins, or permissions."],
    userChecks: [
      verifyingContract
        ? `Verify contract: ${verifyingContract}.`
        : "No verifying contract is visible in the typed-data domain.",
      fields.length
        ? `Review fields: ${fields.join(", ")}.`
        : "Review all typed-data fields in the connected wallet.",
    ],
    simulationStatus: "not-applicable",
    evidence: [
      typed ? "Typed-data payload parsed." : "Typed-data method recognized.",
      domainName ? `Domain: ${domainName}.` : "Domain name unavailable.",
    ],
    advanced: { primaryType, chainId, fields },
  };
}
