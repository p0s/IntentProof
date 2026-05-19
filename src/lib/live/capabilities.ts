import { LIVE_CHAIN_ORDER, LIVE_CHAIN_CONFIGS } from "./chainConfig";
import type { LiveRequest } from "./types";

type CapabilityResponse = Record<`0x${string}`, Record<string, never>>;

function isHexChainId(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value);
}

function normalizeHexChainId(value: `0x${string}`) {
  return value.toLowerCase() as `0x${string}`;
}

function requestedCapabilityChains(request: Pick<LiveRequest, "chain" | "params">) {
  if (!Array.isArray(request.params)) {
    return [request.chain.hexChainId];
  }

  const requestedChains = request.params[1];
  if (Array.isArray(requestedChains)) {
    const supported = requestedChains
      .filter(isHexChainId)
      .map(normalizeHexChainId)
      .filter((chainId) =>
        LIVE_CHAIN_ORDER.some(
          (key) => normalizeHexChainId(LIVE_CHAIN_CONFIGS[key].hexChainId) === chainId,
        ),
      );
    if (supported.length) return supported;
  }

  return [request.chain.hexChainId];
}

export function buildWalletCapabilitiesResponse(
  request: Pick<LiveRequest, "chain" | "params">,
): CapabilityResponse {
  return Object.fromEntries(
    requestedCapabilityChains(request).map((chainId) => [
      normalizeHexChainId(chainId),
      {},
    ]),
  ) as CapabilityResponse;
}
