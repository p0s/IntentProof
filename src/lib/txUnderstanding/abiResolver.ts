import type { LiveRequest } from "../live/types";
import { lookupKeystoneAbiRegistry } from "../keystoneAbiRegistry";
import type { DecodeQuality } from "./types";

export interface AbiResolution {
  decodeQuality: DecodeQuality;
  evidence: string[];
  functionName?: string;
  functionSignature?: string;
  source?: string;
}

export function resolveLiveAbiEvidence(request: LiveRequest): AbiResolution {
  const decode = request.evidence?.decode;
  const registryEntry = lookupKeystoneAbiRegistry(
    request.chain.chainId,
    request.tx?.to,
  );
  const evidence: string[] = [];

  if (decode?.status === "decoded") {
    evidence.push(`ABI decode available from ${decode.source}.`);
    if (registryEntry) {
      evidence.push(`Selected ABI registry has metadata for ${registryEntry.contractName}.`);
    }
    return {
      decodeQuality: "abi-decode",
      evidence,
      functionName: decode.functionName,
      functionSignature: decode.functionSignature,
      source: decode.source,
    };
  }

  if (decode?.status === "selector") {
    evidence.push("Selector label is known, but parameters are not fully decoded.");
    return {
      decodeQuality: "selector-only",
      evidence,
      functionName: decode.functionName,
      functionSignature: decode.functionSignature,
      source: decode.source,
    };
  }

  if (registryEntry) {
    evidence.push(`Selected ABI registry has metadata for ${registryEntry.contractName}.`);
  }

  return {
    decodeQuality: "unknown",
    evidence: evidence.length ? evidence : ["No ABI-level decode evidence is available yet."],
    source: decode?.source,
  };
}
