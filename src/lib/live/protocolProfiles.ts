import { getChainConfig } from "../chains";
import type { DemoChainKey } from "../types";
import type { LiveRequest } from "./types";

export type ProtocolId =
  | "uniswap"
  | "lido"
  | "curve"
  | "sushi"
  | "aave"
  | "compound"
  | "ens"
  | "oneinch"
  | "tokenlon";

export interface ProtocolProfile {
  id: ProtocolId;
  label: string;
  originPatterns: readonly string[];
  requestTypes: readonly string[];
  selectors: readonly string[];
  contracts: Partial<Record<DemoChainKey, Record<string, string>>>;
}

const LIDO_STETH = "0xae7ab96520de3a18e5e111b5eaab095312d7fe84";

const STATIC_PROFILES: ProtocolProfile[] = [
  {
    id: "lido",
    label: "Lido",
    originPatterns: ["lido.fi", "stake.lido.fi"],
    requestTypes: ["ETH staking", "stETH mint"],
    selectors: ["0xa1903eab"],
    contracts: {
      ethereum: {
        [LIDO_STETH]: "Lido stETH",
      },
    },
  },
  {
    id: "curve",
    label: "Curve",
    originPatterns: ["curve.fi"],
    requestTypes: ["Swap", "pool deposit", "approval"],
    selectors: ["0x095ea7b3", "0xa9059cbb"],
    contracts: {},
  },
  {
    id: "sushi",
    label: "Sushi",
    originPatterns: ["sushi.com", "sushi.com/ethereum", "sushi"],
    requestTypes: ["Swap", "approval"],
    selectors: ["0x095ea7b3", "0xa9059cbb"],
    contracts: {},
  },
  {
    id: "aave",
    label: "Aave",
    originPatterns: ["aave.com", "app.aave.com"],
    requestTypes: ["Lending", "approval", "network switch"],
    selectors: ["0x095ea7b3"],
    contracts: {
      ethereum: {
        "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2": "Aave Pool",
      },
    },
  },
  {
    id: "compound",
    label: "Compound",
    originPatterns: ["compound.finance"],
    requestTypes: ["Lending", "wallet capability check"],
    selectors: [],
    contracts: {
      ethereum: {
        "0xc3d688b66703497daa19211eedff47f25384cdc3": "Compound USDC Comet",
      },
    },
  },
  {
    id: "ens",
    label: "ENS",
    originPatterns: ["ens.domains", "app.ens.domains"],
    requestTypes: ["Name registration", "typed-data signature"],
    selectors: [],
    contracts: {
      ethereum: {
        "0x253553366da8546fc250f225fe3d25d0c782303b": "ENS Registrar Controller",
      },
    },
  },
  {
    id: "oneinch",
    label: "1inch",
    originPatterns: ["1inch.io", "1inch.com", "app.1inch.io", "app.1inch.com"],
    requestTypes: ["Swap", "approval"],
    selectors: ["0x095ea7b3"],
    contracts: {
      ethereum: {
        "0x111111125421ca6dc452d289314280a0f8842a65": "1inch Aggregation Router",
        "0x1111111254eeb25477b68fb85ed929f73a960582": "1inch Aggregation Router v5",
      },
    },
  },
  {
    id: "tokenlon",
    label: "Tokenlon",
    originPatterns: ["tokenlon.im", "tokenlon"],
    requestTypes: ["Swap", "account request"],
    selectors: ["0x095ea7b3"],
    contracts: {},
  },
];

function lower(value?: string) {
  return value?.toLowerCase() ?? "";
}

function selector(data?: string) {
  if (!data || data === "0x" || data.length < 10) return undefined;
  return data.slice(0, 10).toLowerCase();
}

function uniswapProfile(): ProtocolProfile {
  const contracts: ProtocolProfile["contracts"] = {};
  for (const chainKey of ["ethereum", "base", "sepolia", "baseSepolia"] as const) {
    const chain = getChainConfig(chainKey);
    const entries: Array<[string, string]> = [];
    if (chain.uniswap.swapRouter02) {
      entries.push([chain.uniswap.swapRouter02.toLowerCase(), "Uniswap SwapRouter02"]);
    }
    if (chain.uniswap.universalRouter) {
      entries.push([
        chain.uniswap.universalRouter.toLowerCase(),
        "Uniswap Universal Router",
      ]);
    }
    for (const address of chain.uniswap.universalRouterAliases ?? []) {
      entries.push([address.toLowerCase(), "Uniswap Universal Router"]);
    }
    contracts[chainKey] = Object.fromEntries(entries);
  }

  return {
    id: "uniswap",
    label: "Uniswap",
    originPatterns: ["uniswap.org", "app.uniswap.org", "uniswap"],
    requestTypes: ["Swap", "Permit2", "approval"],
    selectors: ["0x24856bc3", "0x3593564c", "0x414bf389"],
    contracts,
  };
}

export function getProtocolProfiles(): ProtocolProfile[] {
  return [uniswapProfile(), ...STATIC_PROFILES];
}

export function findProtocolProfile(request: LiveRequest): ProtocolProfile | undefined {
  const origin = lower(request.origin);
  const to = lower(request.tx?.to);
  const requestSelector = selector(request.tx?.data);
  return getProtocolProfiles().find((profile) => {
    const originMatches = profile.originPatterns.some((pattern) =>
      origin.includes(pattern.toLowerCase()),
    );
    const contractMatches = Boolean(
      to && profile.contracts[request.chain.chainKey]?.[to],
    );
    const selectorMatches = Boolean(
      requestSelector && profile.selectors.includes(requestSelector),
    );
    return contractMatches || (originMatches && (selectorMatches || request.method !== "eth_sendTransaction"));
  });
}

export function getProtocolSourceLabel(request: LiveRequest) {
  return findProtocolProfile(request)?.label ?? request.origin;
}

export function getKnownProtocolContractLabel(request: LiveRequest) {
  const to = lower(request.tx?.to);
  if (!to) return undefined;
  for (const profile of getProtocolProfiles()) {
    const label = profile.contracts[request.chain.chainKey]?.[to];
    if (label) return { profile, label };
  }
  return undefined;
}

export function isKnownProtocolRequest(request: LiveRequest) {
  return Boolean(findProtocolProfile(request) || getKnownProtocolContractLabel(request));
}
