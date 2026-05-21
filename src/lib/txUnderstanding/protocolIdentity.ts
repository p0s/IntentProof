import {
  findProtocolProfile,
  getKnownProtocolContractLabel,
  getProtocolSourceLabel,
} from "../live/protocolProfiles";
import type { LiveRequest } from "../live/types";
import type { ProtocolIdentityConfidence } from "./types";

export interface ProtocolIdentity {
  protocolName: string;
  protocolConfidence: ProtocolIdentityConfidence;
  contractLabel?: string;
  evidence: string[];
}

export function identifyProtocol(request: LiveRequest): ProtocolIdentity {
  const profile = findProtocolProfile(request);
  const knownContract = getKnownProtocolContractLabel(request);
  const evidence: string[] = [];

  if (knownContract) {
    evidence.push(`Known ${knownContract.profile.label} contract: ${knownContract.label}.`);
  }
  if (profile) {
    evidence.push(`Recognized DApp or protocol profile: ${profile.label}.`);
  }

  if (knownContract) {
    return {
      protocolName: knownContract.profile.label,
      protocolConfidence: "known",
      contractLabel: knownContract.label,
      evidence,
    };
  }

  if (profile) {
    return {
      protocolName: profile.label,
      protocolConfidence: "probable",
      evidence,
    };
  }

  return {
    protocolName: getProtocolSourceLabel(request),
    protocolConfidence: "unknown",
    evidence: ["DApp or protocol profile is not recognized yet."],
  };
}
