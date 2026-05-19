import { encodeAbiParameters, encodeFunctionData, parseAbi, type Hex } from "viem";

export const UNIVERSAL_ROUTER_ABI = parseAbi([
  "function execute(bytes commands, bytes[] inputs)",
  "function execute(bytes commands, bytes[] inputs, uint256 deadline)",
]);

export const TOKEN_A = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
export const TOKEN_B = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
export const RECIPIENT = "0x7777777777777777777777777777777777777777";

function v3Path(tokenIn: string, fee: number, tokenOut: string): Hex {
  return `${tokenIn}${fee.toString(16).padStart(6, "0")}${tokenOut.slice(2)}` as Hex;
}

export function buildUniversalRouterV3ExactInCalldata() {
  const input = encodeAbiParameters(
    [
      { type: "address" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "bytes" },
      { type: "bool" },
      { type: "uint256[]" },
    ],
    [RECIPIENT, 10_000_000n, 9_900_000n, v3Path(TOKEN_A, 500, TOKEN_B), true, []],
  );

  return encodeFunctionData({
    abi: UNIVERSAL_ROUTER_ABI,
    functionName: "execute",
    args: ["0x00", [input], 2_000_000_000n],
  });
}

export function buildUniversalRouterUnsupportedV4Calldata() {
  const input = encodeAbiParameters(
    [{ type: "bytes" }, { type: "bytes[]" }],
    ["0x01", ["0x"]],
  );

  return encodeFunctionData({
    abi: UNIVERSAL_ROUTER_ABI,
    functionName: "execute",
    args: ["0x10", [input], 2_000_000_000n],
  });
}
