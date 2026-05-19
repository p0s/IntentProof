import { useEffect, useMemo, useState } from "react";

import {
  clearStoredWallets,
  loadStoredWallets,
  saveStoredWallets,
} from "../../lib/storage";
import {
  createTokenCoreWallet,
  initTokenCoreWasm,
} from "../../lib/tokencore";
import type { DemoChainKey, StoredTokenCoreWallet } from "../../lib/types";

export function useWalletManager(requireChainSelected: () => DemoChainKey) {
  const [tokenCoreWallets, setTokenCoreWallets] = useState<
    StoredTokenCoreWallet[]
  >(() => loadStoredWallets());
  const [activeTokenCoreWalletId, setActiveTokenCoreWalletId] =
    useState<string>(() => loadStoredWallets()[0]?.id ?? "");
  const [tokenCoreName, setTokenCoreName] = useState("demo-wallet");
  const [tokenCorePassword, setTokenCorePassword] = useState("");
  const [tokenCoreStatus, setTokenCoreStatus] =
    useState("No local Token Core wallet yet.");

  useEffect(() => {
    initTokenCoreWasm().catch(() => {
      setTokenCoreStatus("Token Core WASM failed to initialize. Refresh and try again.");
    });
  }, []);

  useEffect(() => {
    saveStoredWallets(tokenCoreWallets);
  }, [tokenCoreWallets]);

  const activeTokenCoreWallet = useMemo(
    () =>
      tokenCoreWallets.find((wallet) => wallet.id === activeTokenCoreWalletId),
    [activeTokenCoreWalletId, tokenCoreWallets],
  );

  function upsertTokenCoreWallet(nextWallet: StoredTokenCoreWallet) {
    setTokenCoreWallets((previous) => {
      const filtered = previous.filter(
        (wallet) =>
          !(
            wallet.address.toLowerCase() === nextWallet.address.toLowerCase() &&
            wallet.chainId === nextWallet.chainId
          ),
      );
      return [nextWallet, ...filtered];
    });
    setActiveTokenCoreWalletId(nextWallet.id);
  }

  function selectTokenCoreWallet(walletId: string) {
    setActiveTokenCoreWalletId(walletId);
  }

  function formatTokenCoreUiError(
    error: unknown,
    fallback: string,
  ) {
    if (!(error instanceof Error)) return fallback;
    const message = error.message.trim();
    if (!message) return fallback;

    return message;
  }

  function handleDeleteTokenCoreWallet(walletId: string) {
    const targetWallet = tokenCoreWallets.find(
      (wallet) => wallet.id === walletId,
    );
    if (!targetWallet) return;

    const confirmed = window.confirm(
      `Delete local testnet wallet "${targetWallet.name}" from this browser? This cannot be undone.`,
    );
    if (!confirmed) return;

    setTokenCoreWallets((previous) =>
      previous.filter((wallet) => wallet.id !== walletId),
    );
    if (activeTokenCoreWalletId === walletId) {
      const nextWallet = tokenCoreWallets.find(
        (wallet) => wallet.id !== walletId,
      );
      setActiveTokenCoreWalletId(nextWallet?.id ?? "");
    }
    setTokenCoreStatus(`Deleted local Token Core wallet: ${targetWallet.address}`);
  }

  function handleClearTokenCoreWallets() {
    if (tokenCoreWallets.length === 0) {
      setTokenCoreStatus("No local testnet wallets to delete.");
      return;
    }

    const confirmed = window.confirm(
      "Clear all local testnet wallets from this browser? This deletes testnet keystores stored in localStorage and cannot be undone.",
    );
    if (!confirmed) return;

    clearStoredWallets();
    setTokenCoreWallets([]);
    setActiveTokenCoreWalletId("");
    setTokenCoreStatus(
      "All local testnet wallets were deleted from this browser. No server upload was involved.",
    );
  }

  async function handleCreateTokenCoreWallet() {
    try {
      const chainKey = requireChainSelected();
      if (!tokenCorePassword.trim()) {
        throw new Error("Enter a password for the new local Token Core wallet.");
      }

      const result = await createTokenCoreWallet({
        name: tokenCoreName.trim() || `wallet-${tokenCoreWallets.length + 1}`,
        password: tokenCorePassword,
        chainKey,
      });

      upsertTokenCoreWallet(result.wallet);
      setTokenCoreStatus(`Created local Token Core wallet: ${result.wallet.address}`);
    } catch (error) {
      setTokenCoreStatus(
        formatTokenCoreUiError(error, "Token Core wallet creation failed."),
      );
    }
  }

  return {
    tokenCoreWallets,
    activeTokenCoreWalletId,
    activeTokenCoreWallet,
    tokenCoreName,
    setTokenCoreName,
    tokenCorePassword,
    setTokenCorePassword,
    tokenCoreStatus,
    selectTokenCoreWallet,
    handleDeleteTokenCoreWallet,
    handleClearTokenCoreWallets,
    handleCreateTokenCoreWallet,
  };
}
