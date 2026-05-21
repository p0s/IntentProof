import type { LiveRequest } from "../../live/types";
import type { TransactionUnderstanding } from "../types";
import { decodeErc20Request } from "./erc20";
import { decodeLidoRequest } from "./lido";
import { decodeNetworkOrCoordinationRequest } from "./network";
import { decodePermit2Request } from "./permit2";
import { decodeSignatureRequest } from "./signatures";
import { decodeUniswapUniversalRouterRequest } from "./uniswapUniversalRouter";

export function decodeKnownProtocolRequest(
  request: LiveRequest,
): TransactionUnderstanding | undefined {
  return (
    decodeNetworkOrCoordinationRequest(request) ??
    decodeSignatureRequest(request) ??
    decodeLidoRequest(request) ??
    decodePermit2Request(request) ??
    decodeUniswapUniversalRouterRequest(request) ??
    decodeErc20Request(request)
  );
}

export { decodeErc20Request } from "./erc20";
export { decodeLidoRequest } from "./lido";
export { decodeNetworkOrCoordinationRequest } from "./network";
export { decodePermit2Request } from "./permit2";
export { decodeSignatureRequest } from "./signatures";
export { decodeUniswapUniversalRouterRequest } from "./uniswapUniversalRouter";
