import type { DemoChainKey } from "../types";

export type SignerSource =
  | "imtoken-web"
  | "local-token-core-vault"
  | "walletconnect-fallback";

export interface ConnectedSigner {
  source: SignerSource;
  label: string;
  address?: `0x${string}`;
  chainId?: number;
  chainKey?: DemoChainKey;
  canSignMainnet: boolean;
  canSignTestnet: boolean;
  isUnlocked: boolean;
}

export interface SignerSourceOption {
  source: SignerSource;
  title: string;
  shortLabel: string;
  description: string;
}

export const SIGNER_SOURCE_OPTIONS: readonly SignerSourceOption[] = [
  {
    source: "imtoken-web",
    title: "imToken Web",
    shortLabel: "imToken Web",
    description:
      "Use imToken Web as the final signer. IntentProof reviews requests before forwarding.",
  },
  {
    source: "local-token-core-vault",
    title: "Local Token Core Vault",
    shortLabel: "Local Vault",
    description:
      "Create a local encrypted Token Core vault and sign reviewed requests in this browser.",
  },
  {
    source: "walletconnect-fallback",
    title: "WalletConnect fallback",
    shortLabel: "WC fallback",
    description:
      "Use another WalletConnect-compatible wallet when imToken Web is unavailable.",
  },
] as const;

export function signerSourceLabel(source: SignerSource) {
  return (
    SIGNER_SOURCE_OPTIONS.find((option) => option.source === source)?.title ??
    "Connected signer"
  );
}

export function forwardActionLabel(source: SignerSource, connectedLabel?: string) {
  if (source === "local-token-core-vault") return "Sign with Local Token Core Vault";
  if (source === "imtoken-web") return "Forward to imToken Web";
  if (connectedLabel && /imtoken/i.test(connectedLabel)) return "Forward to imToken";
  return "Forward to connected wallet";
}
