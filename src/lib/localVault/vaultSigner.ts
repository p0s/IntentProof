import type { Address, Hex } from "viem";

import {
  broadcastSignedTransaction,
  signDraftTransaction,
} from "../tokencore";
import type { StoredTokenCoreWallet, TxRequestDraft } from "../types";
import type { LiveRequest } from "../live/types";

function hexToBigInt(value?: Hex) {
  if (!value) return undefined;
  return BigInt(value);
}

export async function signLiveRequestWithLocalVault(params: {
  wallet: StoredTokenCoreWallet;
  password: string;
  request: LiveRequest;
  broadcast?: boolean;
}) {
  const { wallet, password, request } = params;
  if (request.method !== "eth_sendTransaction") {
    throw new Error(
      `${request.method} is not supported by Local Token Core Vault signing yet.`,
    );
  }
  if (!request.tx) throw new Error("DApp request does not contain a transaction.");
  if (!request.tx.to && !request.tx.data) {
    throw new Error("Contract creation requests are not supported by the local vault.");
  }
  if (
    request.tx.from &&
    request.tx.from.toLowerCase() !== wallet.address.toLowerCase()
  ) {
    throw new Error(
      "DApp request sender does not match the Local Token Core Vault address.",
    );
  }

  const draft: TxRequestDraft = {
    chainId: request.chain.chainId,
    account: wallet.address as Address,
    to: request.tx.to,
    data: request.tx.data,
    value: hexToBigInt(request.tx.value) ?? 0n,
    gas: hexToBigInt(request.tx.gas),
  };
  const signed = await signDraftTransaction(wallet, password, request.chain.chainKey, draft);
  if (params.broadcast === false) {
    return {
      kind: "signed" as const,
      rawTransaction: signed.rawTransaction,
      txHash: signed.txHash,
    };
  }
  const broadcast = await broadcastSignedTransaction(
    request.chain.chainKey,
    signed.rawTransaction,
  );
  return {
    kind: "broadcast" as const,
    rawTransaction: signed.rawTransaction,
    txHash: signed.txHash,
    broadcastHash: broadcast.hash,
  };
}
