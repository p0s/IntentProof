export type ProtocolIdentityConfidence = "known" | "probable" | "unknown";

export type DecodeQuality =
  | "full-protocol-decode"
  | "partial-protocol-decode"
  | "abi-decode"
  | "selector-only"
  | "unknown";

export type AssetAuthorityKind =
  | "none"
  | "value-transfer"
  | "limited-token-approval"
  | "unlimited-token-approval"
  | "permit2"
  | "signature-authority"
  | "batch";

export type UserRiskLevel =
  | "routine"
  | "standard"
  | "needs-review"
  | "high-impact-permission"
  | "blocked"
  | "unsupported";

export interface DeterministicRequestImpact {
  nativeValueOut?: string;
  nativeValueOutExact?: string;
  nativeValueOutWei?: string;
  tokenApproval?: string;
  permit2?: string;
  signatureAuthority?: string;
}

export interface SimulationAssetDeltaSummary {
  status: "available" | "unavailable" | "not-parsed";
  summary?: string;
}

export interface TransactionUnderstanding {
  protocolName: string;
  protocolConfidence: ProtocolIdentityConfidence;
  contractLabel?: string;
  actionKind:
    | "coordination"
    | "network-switch"
    | "swap"
    | "stake"
    | "approval"
    | "transfer"
    | "signature"
    | "batch"
    | "unknown";
  actionTitle: string;
  userSummary: string;
  valueSummary?: string;
  tokenIn?: string;
  tokenOut?: string;
  amountIn?: string;
  minAmountOut?: string;
  spender?: string;
  recipient?: string;
  router?: string;
  signatureDomain?: string;
  decodeQuality: DecodeQuality;
  assetAuthorityKind: AssetAuthorityKind;
  riskLevel: UserRiskLevel;
  riskReasons: string[];
  userChecks: string[];
  simulationStatus:
    | "not-applicable"
    | "simulated-no-revert"
    | "simulated-revert"
    | "unavailable"
    | "pending";
  deterministicImpact?: DeterministicRequestImpact;
  simulationAssetDelta?: SimulationAssetDeltaSummary;
  evidence: string[];
  advanced: Record<string, unknown>;
}
