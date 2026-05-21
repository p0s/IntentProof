import {
  decodeAbiParameters,
  decodeFunctionData,
  parseAbi,
  type Address,
  type Hex,
} from "viem";

import type { LiveRequest } from "./types";

const UNIVERSAL_ROUTER_ABI = parseAbi([
  "function execute(bytes commands, bytes[] inputs)",
  "function execute(bytes commands, bytes[] inputs, uint256 deadline)",
]);

const MAX_UINT160 = (1n << 160n) - 1n;
const KNOWN_TOKEN_METADATA: Record<string, { symbol: string; decimals: number }> = {
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { symbol: "USDC", decimals: 6 },
  "0xdac17f958d2ee523a2206206994597c13d831ec7": { symbol: "USDT", decimals: 6 },
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": { symbol: "WETH", decimals: 18 },
  "0x4200000000000000000000000000000000000006": { symbol: "WETH", decimals: 18 },
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { symbol: "USDC", decimals: 6 },
};

const COMMAND_NAMES: Record<number, string> = {
  0x00: "V3_SWAP_EXACT_IN",
  0x01: "V3_SWAP_EXACT_OUT",
  0x02: "PERMIT2_TRANSFER_FROM",
  0x03: "PERMIT2_PERMIT_BATCH",
  0x04: "SWEEP",
  0x05: "TRANSFER",
  0x06: "PAY_PORTION",
  0x07: "PAY_PORTION_FULL_PRECISION",
  0x08: "V2_SWAP_EXACT_IN",
  0x09: "V2_SWAP_EXACT_OUT",
  0x0a: "PERMIT2_PERMIT",
  0x0b: "WRAP_ETH",
  0x0c: "UNWRAP_WETH",
  0x0d: "PERMIT2_TRANSFER_FROM_BATCH",
  0x0e: "BALANCE_CHECK_ERC20",
  0x10: "V4_SWAP",
  0x11: "V3_POSITION_MANAGER_PERMIT",
  0x12: "V3_POSITION_MANAGER_CALL",
  0x13: "V4_INITIALIZE_POOL",
  0x14: "V4_POSITION_MANAGER_CALL",
  0x21: "EXECUTE_SUB_PLAN",
  0x40: "ACROSS_V4_DEPOSIT_V3",
};

const SUPPORTED_COMMANDS = new Set([
  0x00,
  0x01,
  0x02,
  0x04,
  0x05,
  0x06,
  0x07,
  0x08,
  0x09,
  0x0a,
  0x0b,
  0x0c,
  0x0e,
]);

export interface DecodedUniversalRouterCommand {
  byte: number;
  command: number;
  name: string;
  allowRevert: boolean;
  supported: boolean;
  summary: string;
  tokenPath?: Address[];
  amountIn?: bigint;
  amountOut?: bigint;
  amountOutMinimum?: bigint;
  amountInMaximum?: bigint;
  recipient?: Address;
  token?: Address;
  hasUnlimitedPermit?: boolean;
}

export interface DecodedUniversalRouterPlan {
  functionName: "execute";
  deadline?: bigint;
  commandsHex: Hex;
  commands: DecodedUniversalRouterCommand[];
  supported: boolean;
  hasUnsupportedCommands: boolean;
  hasUnlimitedPermit: boolean;
  hasAllowRevert: boolean;
  summary: string;
  unsupportedCommandNames: string[];
}

function commandName(command: number) {
  return COMMAND_NAMES[command] ?? `UNKNOWN_0x${command.toString(16)}`;
}

function shortAddress(address?: string) {
  if (!address) return "n/a";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function tokenLabel(address?: string) {
  if (!address) return "unknown token";
  return KNOWN_TOKEN_METADATA[address.toLowerCase()]?.symbol ?? shortAddress(address);
}

function formatKnownTokenAmount(amount: bigint, token?: string) {
  const metadata = token ? KNOWN_TOKEN_METADATA[token.toLowerCase()] : undefined;
  if (!metadata) return `${amount.toString()} encoded token amount`;
  const divisor = 10n ** BigInt(metadata.decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  if (fraction === 0n) return `${whole.toString()} ${metadata.symbol}`;
  const padded = fraction.toString().padStart(metadata.decimals, "0").replace(/0+$/, "");
  return `${whole.toString()}.${padded} ${metadata.symbol}`;
}

function commandBytes(commands: Hex) {
  const body = commands.slice(2);
  if (body.length === 0 || body.length % 2 !== 0) return [];
  return body.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [];
}

function decodeV3Path(path: Hex) {
  const body = path.slice(2);
  const tokens: Address[] = [];
  const fees: number[] = [];
  if (body.length < 40) return { tokens, fees };

  let cursor = 0;
  tokens.push(`0x${body.slice(cursor, cursor + 40)}` as Address);
  cursor += 40;
  while (cursor + 46 <= body.length) {
    fees.push(Number.parseInt(body.slice(cursor, cursor + 6), 16));
    cursor += 6;
    tokens.push(`0x${body.slice(cursor, cursor + 40)}` as Address);
    cursor += 40;
  }
  return { tokens, fees };
}

function tokenPathSummary(tokens: readonly Address[]) {
  if (tokens.length === 0) return "path unavailable";
  return tokens.map(tokenLabel).join(" -> ");
}

function decodeV3Swap(input: Hex, exactIn: boolean): DecodedUniversalRouterCommand {
  const params = [
    { type: "address" },
    { type: "uint256" },
    { type: "uint256" },
    { type: "bytes" },
    { type: "bool" },
    { type: "uint256[]" },
  ] as const;
  const legacyParams = params.slice(0, 5);
  const decoded = tryDecode(params, input) ?? tryDecode(legacyParams, input);
  if (!decoded) throw new Error("Invalid V3 swap input");

  const recipient = decoded[0] as Address;
  const primaryAmount = decoded[1] as bigint;
  const secondaryAmount = decoded[2] as bigint;
  const path = decoded[3] as Hex;
  const { tokens } = decodeV3Path(path);
  return {
    byte: 0,
    command: exactIn ? 0x00 : 0x01,
    name: exactIn ? "V3_SWAP_EXACT_IN" : "V3_SWAP_EXACT_OUT",
    allowRevert: false,
    supported: true,
    recipient,
    tokenPath: tokens,
    amountIn: exactIn ? primaryAmount : undefined,
    amountOut: exactIn ? undefined : primaryAmount,
    amountOutMinimum: exactIn ? secondaryAmount : undefined,
    amountInMaximum: exactIn ? undefined : secondaryAmount,
    summary: exactIn
      ? `V3 exact-in swap ${formatKnownTokenAmount(primaryAmount, tokens[0])} for at least ${formatKnownTokenAmount(secondaryAmount, tokens.at(-1))} via ${tokenPathSummary(tokens)}`
      : `V3 exact-out swap ${formatKnownTokenAmount(primaryAmount, tokens.at(-1))} using at most ${formatKnownTokenAmount(secondaryAmount, tokens[0])} via ${tokenPathSummary(tokens)}`,
  };
}

function decodeV2Swap(input: Hex, exactIn: boolean): DecodedUniversalRouterCommand {
  const params = [
    { type: "address" },
    { type: "uint256" },
    { type: "uint256" },
    { type: "address[]" },
    { type: "bool" },
    { type: "uint256[]" },
  ] as const;
  const legacyParams = params.slice(0, 5);
  const decoded = tryDecode(params, input) ?? tryDecode(legacyParams, input);
  if (!decoded) throw new Error("Invalid V2 swap input");

  const recipient = decoded[0] as Address;
  const primaryAmount = decoded[1] as bigint;
  const secondaryAmount = decoded[2] as bigint;
  const path = decoded[3] as Address[];
  return {
    byte: 0,
    command: exactIn ? 0x08 : 0x09,
    name: exactIn ? "V2_SWAP_EXACT_IN" : "V2_SWAP_EXACT_OUT",
    allowRevert: false,
    supported: true,
    recipient,
    tokenPath: path,
    amountIn: exactIn ? primaryAmount : undefined,
    amountOut: exactIn ? undefined : primaryAmount,
    amountOutMinimum: exactIn ? secondaryAmount : undefined,
    amountInMaximum: exactIn ? undefined : secondaryAmount,
    summary: exactIn
      ? `V2 exact-in swap ${formatKnownTokenAmount(primaryAmount, path[0])} for at least ${formatKnownTokenAmount(secondaryAmount, path.at(-1))} via ${tokenPathSummary(path)}`
      : `V2 exact-out swap ${formatKnownTokenAmount(primaryAmount, path.at(-1))} using at most ${formatKnownTokenAmount(secondaryAmount, path[0])} via ${tokenPathSummary(path)}`,
  };
}

function tryDecode<TParams extends readonly { type: string }[]>(
  params: TParams,
  input: Hex,
) {
  try {
    return decodeAbiParameters(params, input);
  } catch {
    return undefined;
  }
}

function decodeSimpleTransferCommand(
  input: Hex,
  command: number,
): DecodedUniversalRouterCommand {
  const decoded = decodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "uint256" }],
    input,
  );
  const token = decoded[0] as Address;
  const recipient = decoded[1] as Address;
  const value = decoded[2] as bigint;
  return {
    byte: 0,
    command,
    name: commandName(command),
    allowRevert: false,
    supported: true,
    token,
    recipient,
    amountIn: value,
    summary: `${commandName(command)} ${formatKnownTokenAmount(value, token)} of ${tokenLabel(token)} to ${shortAddress(recipient)}`,
  };
}

function decodeTwoArgPaymentCommand(
  input: Hex,
  command: number,
): DecodedUniversalRouterCommand {
  const decoded = decodeAbiParameters([{ type: "address" }, { type: "uint256" }], input);
  const recipient = decoded[0] as Address;
  const amount = decoded[1] as bigint;
  return {
    byte: 0,
    command,
    name: commandName(command),
    allowRevert: false,
    supported: true,
    recipient,
    amountIn: amount,
    summary: `${commandName(command)} ${amount.toString()} encoded token amount for ${shortAddress(recipient)}`,
  };
}

function decodePermit2Transfer(input: Hex): DecodedUniversalRouterCommand {
  const decoded = decodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "uint160" }],
    input,
  );
  const token = decoded[0] as Address;
  const recipient = decoded[1] as Address;
  const amount = decoded[2] as bigint;
  return {
    byte: 0,
    command: 0x02,
    name: "PERMIT2_TRANSFER_FROM",
    allowRevert: false,
    supported: true,
    token,
    recipient,
    amountIn: amount,
    summary: `Permit2 transfers ${formatKnownTokenAmount(amount, token)} of ${tokenLabel(token)} to ${shortAddress(recipient)}`,
  };
}

function readPermitSingle(decodedPermit: unknown) {
  const permit = decodedPermit as {
    details?: { token?: Address; amount?: bigint };
    spender?: Address;
  };
  if (permit.details) {
    return {
      token: permit.details.token,
      amount: permit.details.amount,
      spender: permit.spender,
    };
  }
  const tuple = decodedPermit as readonly unknown[];
  const details = tuple[0] as readonly unknown[] | undefined;
  return {
    token: details?.[0] as Address | undefined,
    amount: details?.[1] as bigint | undefined,
    spender: tuple[1] as Address | undefined,
  };
}

function decodePermit2Permit(input: Hex): DecodedUniversalRouterCommand {
  const decoded = decodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          {
            name: "details",
            type: "tuple",
            components: [
              { name: "token", type: "address" },
              { name: "amount", type: "uint160" },
              { name: "expiration", type: "uint48" },
              { name: "nonce", type: "uint48" },
            ],
          },
          { name: "spender", type: "address" },
          { name: "sigDeadline", type: "uint256" },
        ],
      },
      { type: "bytes" },
    ],
    input,
  );
  const permit = readPermitSingle(decoded[0]);
  const amount = permit.amount ?? 0n;
  const unlimited = amount === MAX_UINT160;
  return {
    byte: 0,
    command: 0x0a,
    name: "PERMIT2_PERMIT",
    allowRevert: false,
    supported: true,
    token: permit.token,
    recipient: permit.spender,
    amountIn: amount,
    hasUnlimitedPermit: unlimited,
    summary: `Permit2 permit for ${formatKnownTokenAmount(amount, permit.token)} of ${tokenLabel(permit.token)} to ${shortAddress(permit.spender)}`,
  };
}

function decodeCommand(command: number, input: Hex) {
  if (!SUPPORTED_COMMANDS.has(command)) {
    return unsupportedCommand(command, "Command is not in the supported live decoder set.");
  }

  try {
    if (command === 0x00) return decodeV3Swap(input, true);
    if (command === 0x01) return decodeV3Swap(input, false);
    if (command === 0x02) return decodePermit2Transfer(input);
    if (command === 0x04 || command === 0x05 || command === 0x06 || command === 0x07) {
      return decodeSimpleTransferCommand(input, command);
    }
    if (command === 0x08) return decodeV2Swap(input, true);
    if (command === 0x09) return decodeV2Swap(input, false);
    if (command === 0x0a) return decodePermit2Permit(input);
    if (command === 0x0b || command === 0x0c) {
      return decodeTwoArgPaymentCommand(input, command);
    }
    if (command === 0x0e) return decodeSimpleTransferCommand(input, command);
  } catch {
    return unsupportedCommand(command, "Command input could not be decoded.");
  }

  return unsupportedCommand(command, "Command is not implemented.");
}

function unsupportedCommand(command: number, reason: string): DecodedUniversalRouterCommand {
  return {
    byte: 0,
    command,
    name: commandName(command),
    allowRevert: false,
    supported: false,
    summary: `${commandName(command)} unsupported: ${reason}`,
  };
}

export function decodeUniversalRouterRequest(
  request: LiveRequest,
): DecodedUniversalRouterPlan | undefined {
  const data = request.tx?.data;
  if (!data || data === "0x") return undefined;

  try {
    const decoded = decodeFunctionData({
      abi: UNIVERSAL_ROUTER_ABI,
      data,
    });
    if (decoded.functionName !== "execute") return undefined;
    const [commands, inputs, deadline] = decoded.args as [
      Hex,
      readonly Hex[],
      bigint | undefined,
    ];
    const bytes = commandBytes(commands);
    const commandsDecoded = bytes.map((byte, index) => {
      const command = byte & 0x7f;
      const decodedCommand = inputs[index]
        ? decodeCommand(command, inputs[index]!)
        : unsupportedCommand(command, "Missing matching input payload.");
      return {
        ...decodedCommand,
        byte,
        command,
        allowRevert: (byte & 0x80) !== 0,
      };
    });
    if (inputs.length !== bytes.length) {
      commandsDecoded.push({
        ...unsupportedCommand(0xff, "Command/input length mismatch."),
        name: "COMMAND_INPUT_LENGTH_MISMATCH",
      });
    }
    const unsupportedCommandNames = commandsDecoded
      .filter((command) => !command.supported)
      .map((command) => command.name);
    const hasUnlimitedPermit = commandsDecoded.some(
      (command) => command.hasUnlimitedPermit,
    );
    const hasAllowRevert = commandsDecoded.some((command) => command.allowRevert);
    const summary = commandsDecoded.map((command) => command.summary).join("; ");
    return {
      functionName: "execute",
      deadline,
      commandsHex: commands,
      commands: commandsDecoded,
      supported: unsupportedCommandNames.length === 0,
      hasUnsupportedCommands: unsupportedCommandNames.length > 0,
      hasUnlimitedPermit,
      hasAllowRevert,
      summary,
      unsupportedCommandNames,
    };
  } catch {
    return undefined;
  }
}
