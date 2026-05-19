type CoreModule = typeof import("@walletconnect/core");
type WalletConnectCore = InstanceType<CoreModule["Core"]>;
type WalletConnectCoreRole = "dapp-inbound" | "imtoken-signer";

const coreByRole: Partial<Record<WalletConnectCoreRole, Promise<WalletConnectCore>>> = {};

export function getIntentProofWalletConnectCore(
  projectId: string,
  role: WalletConnectCoreRole,
) {
  coreByRole[role] ??= import("@walletconnect/core").then(({ Core }) => {
    return new Core({
      projectId,
      customStoragePrefix:
        role === "dapp-inbound"
          ? "intentproof-dapp-inbound"
          : "intentproof-imtoken-signer",
    });
  });
  return coreByRole[role];
}
