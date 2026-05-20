import {
  hashTypedData,
  isHex,
  type Address,
  type Hex,
} from "viem";

import {
  broadcastSignedTransaction,
  signDraftTransaction,
  signTokenCoreMessage,
} from "../tokencore";
import type { StoredTokenCoreWallet, TxRequestDraft } from "../types";
import type { LiveRequest } from "../live/types";

function hexToBigInt(value?: Hex) {
  if (!value) return undefined;
  return BigInt(value);
}

function assertSignatureSenderMatchesWallet(request: LiveRequest, wallet: StoredTokenCoreWallet) {
  if (
    request.signatureAddress &&
    request.signatureAddress.toLowerCase() !== wallet.address.toLowerCase()
  ) {
    throw new Error(
      "DApp signature account does not match the Local Token Core Vault address.",
    );
  }
}

function utf8StringFromPersonalSignMessage(message: string) {
  if (!isHex(message)) return message;
  const hex = message.slice(2);
  if (hex.length % 2 !== 0) {
    throw new Error(
      "Local vault personal_sign requires a UTF-8 readable message.",
    );
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(
      "Local vault personal_sign requires a UTF-8 readable message. Use imToken Web for arbitrary byte signatures.",
    );
  }
}

function asTypedDataDefinition(value: unknown) {
  const parsed =
    typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Typed-data payload is not a JSON object.");
  }
  const record = parsed as Record<string, unknown>;
  if (
    typeof record.primaryType !== "string" ||
    typeof record.types !== "object" ||
    record.types === null ||
    typeof record.message !== "object" ||
    record.message === null
  ) {
    throw new Error("Typed-data payload is missing primaryType, types, or message.");
  }
  const domain =
    typeof record.domain === "object" && record.domain !== null
      ? record.domain
      : {};
  const types = { ...(record.types as Record<string, unknown>) };
  delete types.EIP712Domain;
  return {
    domain,
    types,
    primaryType: record.primaryType,
    message: record.message,
  } as Parameters<typeof hashTypedData>[0];
}

async function signPersonalMessageWithLocalVault(params: {
  wallet: StoredTokenCoreWallet;
  password: string;
  request: LiveRequest;
}) {
  const { wallet, password, request } = params;
  assertSignatureSenderMatchesWallet(request, wallet);
  if (!request.message) {
    throw new Error("DApp personal_sign request does not contain a message.");
  }
  const signed = await signTokenCoreMessage(wallet, password, {
    message: utf8StringFromPersonalSignMessage(request.message),
    signatureType: "PersonalSign",
  });
  return {
    kind: "signature" as const,
    signature: signed.signature,
    signatureMethod: "personal_sign" as const,
    evidence: "Token Core sign_message PersonalSign",
  };
}

async function signTypedDataWithLocalVault(params: {
  wallet: StoredTokenCoreWallet;
  password: string;
  request: LiveRequest;
}) {
  const { wallet, password, request } = params;
  assertSignatureSenderMatchesWallet(request, wallet);
  if (request.typedData === undefined) {
    throw new Error("DApp typed-data request does not contain a typed-data payload.");
  }
  const digest = hashTypedData(asTypedDataDefinition(request.typedData));
  const signed = await signTokenCoreMessage(wallet, password, {
    message: digest,
    signatureType: "EcSign",
  });
  return {
    kind: "signature" as const,
    signature: signed.signature,
    signatureMethod: "eth_signTypedData_v4" as const,
    evidence: "Viem EIP-712 hash + Token Core sign_message EcSign",
    digest,
  };
}

export async function signLiveRequestWithLocalVault(params: {
  wallet: StoredTokenCoreWallet;
  password: string;
  request: LiveRequest;
  broadcast?: boolean;
}) {
  const { wallet, password, request } = params;
  if (request.method === "personal_sign") {
    return signPersonalMessageWithLocalVault({ wallet, password, request });
  }
  if (request.method === "eth_signTypedData_v4") {
    return signTypedDataWithLocalVault({ wallet, password, request });
  }
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
    gasPrice: hexToBigInt(request.tx.gasPrice),
    maxFeePerGas: hexToBigInt(request.tx.maxFeePerGas),
    maxPriorityFeePerGas: hexToBigInt(request.tx.maxPriorityFeePerGas),
    nonce:
      request.tx.nonce !== undefined
        ? Number(hexToBigInt(request.tx.nonce))
        : undefined,
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
