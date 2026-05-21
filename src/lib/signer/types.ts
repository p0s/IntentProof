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
    source: "walletconnect-fallback",
    title: "WalletConnect wallet",
    shortLabel: "WalletConnect",
    description:
      "Connect imToken mobile or any WalletConnect-compatible final signer.",
  },
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
