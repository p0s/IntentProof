import {
  formatUnits,
  hexToString,
  isHex,
  type Address,
  type Hex,
} from "viem";

import { getChainConfig, getChainKeyById } from "../chains";
import type { DemoChainKey } from "../types";
import { getKnownProtocolContractLabel, getProtocolSourceLabel } from "./protocolProfiles";
import type { LiveRequest } from "./types";
import {
  decodeUniversalRouterRequest,
  type DecodedUniversalRouterCommand,
} from "./uniswapUniversalRouter";

export interface LiveSemanticSummary {
  title: string;
  subtitle: string;
  whatItWants: string;
  whyDappNeedsIt?: string;
  userShouldCheck: string[];
  primaryAmount?: string;
  tokenIn?: string;
  tokenOut?: string;
  recipient?: string;
  spender?: string;
  route?: string;
  chips: string[];
}

const ERC20_APPROVE_SELECTOR = "0x095ea7b3";
const ERC20_TRANSFER_SELECTOR = "0xa9059cbb";
const LIDO_SUBMIT_SELECTOR = "0xa1903eab";
const MAX_UINT256 =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";

function selector(data?: string) {
  if (!data || data === "0x" || data.length < 10) return undefined;
  return data.slice(0, 10).toLowerCase();
}

function shortAddress(address?: string) {
  if (!address) return "n/a";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function chainKeyFromChainId(value: unknown): DemoChainKey | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const id = Number.parseInt(value, 16);
    return getChainKeyById(id);
  } catch {
    return undefined;
  }
}

function tokenInfo(chainKey: DemoChainKey, address?: string) {
  if (!address) return undefined;
  const lower = address.toLowerCase();
  const chain = getChainConfig(chainKey);
  if (chain.wrappedNativeToken.address.toLowerCase() === lower) {
    return chain.wrappedNativeToken;
  }
  return chain.tokenPresets.find((token) => token.address.toLowerCase() === lower);
}

function tokenLabel(chainKey: DemoChainKey, address?: string) {
  return tokenInfo(chainKey, address)?.symbol ?? shortAddress(address);
}

function formatTokenAmount(chainKey: DemoChainKey, address: string | undefined, amount?: bigint) {
  if (amount === undefined) return undefined;
  const token = tokenInfo(chainKey, address);
  if (!token) return `${amount.toString()} raw units`;
  return `${formatUnits(amount, token.decimals)} ${token.symbol}`;
}

function formatNativeValue(request: LiveRequest) {
  if (!request.tx?.value || request.tx.value === "0x") return undefined;
  try {
    const value = BigInt(request.tx.value);
    if (value === 0n) return undefined;
    return `${formatUnits(value, 18)} ${getChainConfig(request.chain.chainKey).nativeSymbol}`;
  } catch {
    return request.tx.value;
  }
}

function decodeWordAddress(data: string, index: number) {
  const normalized = data.toLowerCase().replace(/^0x/, "");
  const word = normalized.slice(8 + index * 64, 8 + (index + 1) * 64);
  if (word.length !== 64) return undefined;
  return `0x${word.slice(24)}` as Address;
}

function decodeWordUint(data: string, index: number) {
  const normalized = data.toLowerCase().replace(/^0x/, "");
  const word = normalized.slice(8 + index * 64, 8 + (index + 1) * 64);
  if (word.length !== 64) return undefined;
  try {
    return BigInt(`0x${word}`);
  } catch {
    return undefined;
  }
}

function baseSummary(request: LiveRequest): LiveSemanticSummary {
  return {
    title: request.method,
    subtitle: `${getProtocolSourceLabel(request)} on ${request.chain.label}`,
    whatItWants: "IntentProof can show the raw method, chain, and payload, but it does not have a specialized summary for this request yet.",
    userShouldCheck: ["Confirm the DApp, chain, target address, value, and method in the connected wallet."],
    chips: [request.chain.label, request.method],
  };
}

function summarizeCoordination(request: LiveRequest): LiveSemanticSummary | undefined {
  if (
    request.method === "eth_call" ||
    request.method === "eth_estimateGas" ||
    request.method === "eth_getBalance" ||
    request.method === "eth_getCode" ||
    request.method === "eth_getTransactionCount" ||
    request.method === "eth_getBlockByNumber" ||
    request.method === "eth_blockNumber" ||
    request.method === "eth_gasPrice" ||
    request.method === "eth_feeHistory" ||
    request.method === "eth_maxPriorityFeePerGas" ||
    request.method === "net_version"
  ) {
    return {
      title: request.method === "eth_estimateGas" ? "Gas estimate" : "Read-only chain check",
      subtitle: `${getProtocolSourceLabel(request)} reads ${request.chain.label}`,
      whatItWants:
        request.method === "eth_estimateGas"
          ? "Estimates whether the prepared transaction can execute and what network cost it may require."
          : "Reads public chain state so the DApp can price, quote, or validate the request before asking for a signature.",
      userShouldCheck: ["This does not ask for a signature or transaction."],
      chips: ["Routine", "Answered locally", request.chain.label],
    };
  }
  if (request.method === "wallet_getCapabilities") {
    return {
      title: "Wallet capability check",
      subtitle: `${getProtocolSourceLabel(request)} checks wallet features`,
      whatItWants: "Checks which wallet features IntentProof supports so the DApp can choose a compatible request flow.",
      whyDappNeedsIt: "DApps use this to decide whether to send a normal transaction request or a newer wallet capability request.",
      userShouldCheck: ["This does not ask for a signature or transaction."],
      chips: ["Routine", "Answered locally", "No signing"],
    };
  }
  if (request.method === "eth_accounts" || request.method === "eth_requestAccounts") {
    return {
      title: "Account request",
      subtitle: `${getProtocolSourceLabel(request)} asks for the connected wallet address`,
      whatItWants: "Asks IntentProof for the connected wallet address already approved for this DApp session.",
      userShouldCheck: ["This reveals the selected account to the connected DApp but does not sign anything."],
      chips: ["Routine", "Answered locally", "No signing"],
    };
  }
  if (request.method === "eth_chainId") {
    return {
      title: "Chain ID request",
      subtitle: `${getProtocolSourceLabel(request)} checks the active network`,
      whatItWants: `Checks that the active WalletConnect network is ${request.chain.label}.`,
      userShouldCheck: ["This does not ask for a signature or transaction."],
      chips: ["Routine", "Answered locally", request.chain.label],
    };
  }
  return undefined;
}

function summarizeNetworkSwitch(request: LiveRequest): LiveSemanticSummary | undefined {
  if (request.method !== "wallet_switchEthereumChain") return undefined;
  const params = Array.isArray(request.params) ? paramsFirstRecord(request.params) : undefined;
  const targetChain = chainKeyFromChainId(params?.chainId) ?? request.chain.chainKey;
  const target = getChainConfig(targetChain);
  return {
    title: `Switch to ${target.label}`,
    subtitle: `${getProtocolSourceLabel(request)} requests a wallet network switch`,
    whatItWants: `Requests switching the connected wallet to ${target.label}.`,
    whyDappNeedsIt: "DApps ask for a network switch when the current chain does not match the action they want to prepare.",
    userShouldCheck: [
      target.environment === "mainnet"
        ? "Mainnet uses real assets. Confirm you intended to use this network."
        : "Confirm this is the testnet you intended to use.",
    ],
    chips: ["Network switch", target.environment, target.label],
  };
}

function paramsFirstRecord(params: unknown[]) {
  const first = params[0];
  return typeof first === "object" && first !== null
    ? (first as Record<string, string>)
    : undefined;
}

function summarizeApproval(request: LiveRequest): LiveSemanticSummary | undefined {
  const data = request.tx?.data;
  if (!data || selector(data) !== ERC20_APPROVE_SELECTOR) return undefined;
  const spender = decodeWordAddress(data, 0);
  const amount = decodeWordUint(data, 1);
  const token = tokenInfo(request.chain.chainKey, request.tx?.to);
  const amountLabel =
    amount?.toString() === MAX_UINT256
      ? "unlimited"
      : formatTokenAmount(request.chain.chainKey, request.tx?.to, amount);
  const protocol = getProtocolSourceLabel(request);
  return {
    title: `${token?.symbol ?? "Token"} approval`,
    subtitle: `${protocol} requests token spending permission`,
    whatItWants: `Allow ${protocol} or its spender contract to spend ${token?.symbol ?? "this token"} from this wallet. Amount: ${amountLabel ?? "unknown"}.`,
    whyDappNeedsIt: "DApps request token approvals before they can pull ERC-20 tokens for swaps, deposits, or repayments.",
    userShouldCheck: [
      amountLabel === "unlimited"
        ? "Unlimited approvals stay usable until revoked."
        : "Confirm this amount matches the action you are about to take.",
      "Confirm the spender address in the connected wallet.",
    ],
    primaryAmount: amountLabel,
    spender,
    chips: ["Approval", amountLabel === "unlimited" ? "Unlimited" : "Limited", protocol],
  };
}

function summarizeTransfer(request: LiveRequest): LiveSemanticSummary | undefined {
  const data = request.tx?.data;
  if (!data || selector(data) !== ERC20_TRANSFER_SELECTOR) return undefined;
  const recipient = decodeWordAddress(data, 0);
  const amount = decodeWordUint(data, 1);
  const token = tokenInfo(request.chain.chainKey, request.tx?.to);
  const amountLabel = formatTokenAmount(request.chain.chainKey, request.tx?.to, amount);
  return {
    title: `${token?.symbol ?? "Token"} transfer`,
    subtitle: `${getProtocolSourceLabel(request)} asks to transfer tokens`,
    whatItWants: `Transfer ${amountLabel ?? "an unknown token amount"} to ${recipient ?? "an unknown recipient"}.`,
    userShouldCheck: ["Confirm the full recipient address and amount in the connected wallet."],
    primaryAmount: amountLabel,
    recipient,
    chips: ["Transfer", token?.symbol ?? "ERC-20", request.chain.label],
  };
}

function summarizeLido(request: LiveRequest): LiveSemanticSummary | undefined {
  if (request.method !== "eth_sendTransaction") return undefined;
  const data = request.tx?.data;
  if (selector(data) !== LIDO_SUBMIT_SELECTOR) return undefined;
  const amount = formatNativeValue(request) ?? "ETH value from the transaction";
  return {
    title: "Stake ETH with Lido",
    subtitle: "Lido stETH submit request",
    whatItWants: `Stake ${amount}. Sends ETH to the stETH contract and receives stETH if accepted.`,
    whyDappNeedsIt: "Lido uses submit(address) to deposit ETH and mint stETH to the sender.",
    userShouldCheck: [
      "Confirm the ETH amount.",
      "Confirm the target contract is the Lido stETH contract.",
    ],
    primaryAmount: amount,
    chips: ["Lido", "Stake ETH", "stETH"],
  };
}

function summarizeUniversalRouter(request: LiveRequest): LiveSemanticSummary | undefined {
  const plan = decodeUniversalRouterRequest(request);
  if (!plan) return undefined;
  const swap = plan.commands.find((command) => command.tokenPath?.length);
  const firstCommand = swap ?? plan.commands[0];
  const route = swap?.tokenPath
    ?.map((token) => tokenLabel(request.chain.chainKey, token))
    .join(" → ");
  const amountIn = commandAmountIn(request.chain.chainKey, swap);
  const amountOut = commandAmountOut(request.chain.chainKey, swap);
  const nativeValue = formatNativeValue(request);
  const amountPart = amountIn ?? nativeValue ?? "the encoded input amount";
  const outputPart = amountOut ? ` for at least ${amountOut}` : "";
  const routePart = route ? ` through ${route}` : "";

  return {
    title: "Swap transaction",
    subtitle: "Uniswap Universal Router request",
    whatItWants: plan.supported
      ? `Swap ${amountPart}${outputPart}${routePart}.`
      : "Run a Uniswap Universal Router command stream that IntentProof cannot fully display yet.",
    whyDappNeedsIt: "Uniswap uses the Universal Router to combine swaps, Permit2 transfers, wrapping, and cleanup commands into one transaction.",
    userShouldCheck: [
      "Confirm token in, token out, minimum received, recipient, and any Permit2 permission in the connected wallet.",
      plan.hasUnsupportedCommands
        ? "Some router commands are not decoded by IntentProof yet."
        : "Router commands are decoded into a readable route summary.",
    ],
    primaryAmount: amountIn ?? nativeValue,
    tokenIn: swap?.tokenPath?.[0]
      ? tokenLabel(request.chain.chainKey, swap.tokenPath[0])
      : undefined,
    tokenOut: swap?.tokenPath?.at(-1)
      ? tokenLabel(request.chain.chainKey, swap.tokenPath.at(-1))
      : undefined,
    recipient: firstCommand?.recipient,
    route,
    chips: [
      "Uniswap",
      plan.supported ? "Decoded route" : "Partial decode",
      plan.hasAllowRevert ? "Partial fill possible" : "Atomic route",
    ],
  };
}

function commandAmountIn(chainKey: DemoChainKey, command?: DecodedUniversalRouterCommand) {
  const token = command?.tokenPath?.[0] ?? command?.token;
  return formatTokenAmount(chainKey, token, command?.amountIn ?? command?.amountInMaximum);
}

function commandAmountOut(chainKey: DemoChainKey, command?: DecodedUniversalRouterCommand) {
  const token = command?.tokenPath?.at(-1);
  return formatTokenAmount(chainKey, token, command?.amountOutMinimum ?? command?.amountOut);
}

function summarizeSignature(request: LiveRequest): LiveSemanticSummary | undefined {
  if (request.method === "personal_sign") {
    const message = readablePersonalSignMessage(request);
    return {
      title: "Message signature",
      subtitle: `${getProtocolSourceLabel(request)} asks for a personal signature`,
      whatItWants: message
        ? `Sign this message: "${message}"`
        : "Sign a message that is not fully readable as UTF-8 text.",
      whyDappNeedsIt: "DApps use message signatures for login, authorization, or off-chain approvals.",
      userShouldCheck: ["Only sign if the message and domain match what you intended."],
      chips: ["Signature", message ? "Readable message" : "Hex message"],
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
  const fields = Object.keys(message ?? {}).slice(0, 5);
  return {
    title: "Typed-data signature",
    subtitle: `${domainName ?? getProtocolSourceLabel(request)} asks for structured data signing`,
    whatItWants: `Sign typed data${primaryType ? ` of type ${primaryType}` : ""}${domainName ? ` for ${domainName}` : ""}.`,
    whyDappNeedsIt: "DApps use typed-data signatures for readable off-chain permissions, orders, and logins.",
    userShouldCheck: [
      verifyingContract
        ? `Verify contract: ${verifyingContract}.`
        : "No verifying contract is visible in the typed-data domain.",
      fields.length
        ? `Review fields: ${fields.join(", ")}.`
        : "Review all typed-data fields in the connected wallet.",
    ],
    recipient: verifyingContract,
    chips: [
      "Typed data",
      primaryType ?? "Unknown type",
      chainId ? `chain ${chainId}` : "chain unknown",
    ],
  };
}

function typedDataRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return typedDataRecord(parsed);
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

function summarizeNativeTransfer(request: LiveRequest): LiveSemanticSummary | undefined {
  if (request.method !== "eth_sendTransaction") return undefined;
  if (request.tx?.data && request.tx.data !== "0x") return undefined;
  const value = formatNativeValue(request);
  return {
    title: "Native token transfer",
    subtitle: `${getProtocolSourceLabel(request)} asks to send ${getChainConfig(request.chain.chainKey).nativeSymbol}`,
    whatItWants: `Send ${value ?? "0 native token"} to ${request.tx?.to ?? "an unknown recipient"}.`,
    userShouldCheck: ["Confirm the full recipient address and native token amount."],
    primaryAmount: value,
    recipient: request.tx?.to,
    chips: ["Native transfer", request.chain.label],
  };
}

function summarizeKnownContractFallback(request: LiveRequest): LiveSemanticSummary | undefined {
  const known = getKnownProtocolContractLabel(request);
  if (!known) return undefined;
  return {
    title: request.evidence?.decode.functionName ?? "Protocol transaction",
    subtitle: `${known.profile.label} · ${known.label}`,
    whatItWants: request.evidence?.decode.summary ?? `Call ${known.label}.`,
    userShouldCheck: ["Confirm the action details and full target address in the connected wallet."],
    chips: [known.profile.label, "Known contract", request.evidence?.decode.status ?? "decode pending"],
  };
}

export function summarizeLiveRequest(request: LiveRequest): LiveSemanticSummary {
  return (
    summarizeCoordination(request) ??
    summarizeNetworkSwitch(request) ??
    summarizeLido(request) ??
    summarizeUniversalRouter(request) ??
    summarizeApproval(request) ??
    summarizeTransfer(request) ??
    summarizeSignature(request) ??
    summarizeNativeTransfer(request) ??
    summarizeKnownContractFallback(request) ??
    baseSummary(request)
  );
}
