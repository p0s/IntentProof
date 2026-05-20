import { isMainnetChainKey } from "../chains";
import type { LivePolicyDecision, LiveRequest } from "../live/types";

export interface LocalVaultSigningGateInput {
  request?: LiveRequest;
  decision?: LivePolicyDecision;
  vaultUnlocked: boolean;
  mainnetEnabled: boolean;
  mainnetAcknowledged: boolean;
  warningAcknowledged: boolean;
}

export interface LocalVaultSigningGate {
  allowed: boolean;
  reason: string;
}

export function evaluateLocalVaultSigningGate({
  request,
  decision,
  vaultUnlocked,
  mainnetEnabled,
  mainnetAcknowledged,
  warningAcknowledged,
}: LocalVaultSigningGateInput): LocalVaultSigningGate {
  if (!request || !decision) {
    return { allowed: false, reason: "Select a DApp request first." };
  }
  if (!vaultUnlocked) {
    return {
      allowed: false,
      reason: "Unlock the Local Token Core Vault before signing.",
    };
  }
  if (!decision.canForward || decision.severity === "block") {
    return {
      allowed: false,
      reason: "Blocked requests are never signed by the Local Token Core Vault.",
    };
  }
  if (decision.requiresAcknowledgement && !warningAcknowledged) {
    return {
      allowed: false,
      reason: "Review and acknowledge the warning before local vault signing.",
    };
  }
  if (isMainnetChainKey(request.chain.chainKey)) {
    if (!mainnetEnabled || !mainnetAcknowledged) {
      return {
        allowed: false,
        reason:
          "Mainnet local vault signing is disabled until you opt in for this session.",
      };
    }
  }
  if (
    request.method !== "eth_sendTransaction" &&
    request.method !== "personal_sign" &&
    request.method !== "eth_signTypedData_v4"
  ) {
    return {
      allowed: false,
      reason: `${request.method} is not supported by Local Token Core Vault signing yet.`,
    };
  }
  return { allowed: true, reason: "Ready to sign with Local Token Core Vault." };
}
