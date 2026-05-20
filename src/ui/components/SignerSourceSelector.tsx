import type { DemoChainKey } from "../../lib/types";
import {
  type ConnectedSigner,
  type SignerSource,
} from "../../lib/signer/types";
import type { LiveConnectorState } from "../../lib/live/types";
import type {
  LocalTokenCoreVaultRecord,
  VaultUnlockMode,
} from "../../lib/localVault/types";
import { TokenAlert } from "../token-ui/Alert";
import { TokenBadge } from "../token-ui/Badge";
import { TokenButton } from "../token-ui/Button";
import { TokenCard } from "../token-ui/Card";

interface SignerSourceSelectorProps {
  source: SignerSource;
  connectedSigner: ConnectedSigner;
  externalSignerState: LiveConnectorState;
  vaultRecord?: LocalTokenCoreVaultRecord;
  vaultStatus: string;
  vaultName: string;
  vaultPassword: string;
  vaultUnlockMode: VaultUnlockMode;
  vaultMainnetEnabled: boolean;
  vaultMainnetAcknowledged: boolean;
  selectedChainKey: DemoChainKey;
  onVaultNameChange: (name: string) => void;
  onVaultPasswordChange: (password: string) => void;
  onVaultUnlockModeChange: (mode: VaultUnlockMode) => void;
  onCreateVault: () => void;
  onUnlockVault: () => void;
  onLockVault: () => void;
  onDeleteVault: () => void;
  onVaultMainnetEnabledChange: (enabled: boolean) => void;
  onVaultMainnetAcknowledgedChange: (acknowledged: boolean) => void;
  onCancelExternalConnection: () => void;
}

export function SignerSourceSelector({
  source,
  connectedSigner,
  externalSignerState,
  vaultRecord,
  vaultStatus,
  vaultName,
  vaultPassword,
  vaultUnlockMode,
  vaultMainnetEnabled,
  vaultMainnetAcknowledged,
  selectedChainKey,
  onVaultNameChange,
  onVaultPasswordChange,
  onVaultUnlockModeChange,
  onCreateVault,
  onUnlockVault,
  onLockVault,
  onDeleteVault,
  onVaultMainnetEnabledChange,
  onVaultMainnetAcknowledgedChange,
  onCancelExternalConnection,
}: SignerSourceSelectorProps) {
  const localVaultSelected = source === "local-token-core-vault";
  const showExternalState =
    source !== "local-token-core-vault" &&
    externalSignerState.status !== "idle";
  const externalStateTone =
    externalSignerState.status === "connected"
      ? "success"
      : externalSignerState.status === "error" ||
          externalSignerState.status === "setup-required"
        ? "warning"
        : "info";
  if (!localVaultSelected && !showExternalState) {
    return null;
  }
  return (
    <TokenCard className="signer-source-panel compact-signer-panel" aria-label="Signer status">
      {showExternalState ? (
        <TokenAlert tone={externalStateTone} title={externalSignerState.label}>
          {externalSignerState.detail}
          {externalSignerState.status === "pairing" ? (
            <div className="button-row compact-action-row">
              <TokenButton
                type="button"
                tone="ghost"
                onClick={onCancelExternalConnection}
              >
                Cancel connection
              </TokenButton>
            </div>
          ) : null}
        </TokenAlert>
      ) : null}
      {localVaultSelected ? (
        <section className="local-vault-card" aria-label="Local Token Core Vault">
          <div className="local-vault-header">
            <div>
              <span className="eyebrow">Selected signer</span>
              <h3>Local Token Core Vault</h3>
            </div>
            <TokenBadge tone={connectedSigner.isUnlocked ? "success" : "warning"}>
              {connectedSigner.isUnlocked ? "Unlocked" : "Locked"}
            </TokenBadge>
          </div>
          <p>
            Create or unlock an encrypted Token Core vault in this browser. No
            wallet file import/export is exposed here.
          </p>
          <div className="signer-source-state compact-vault-state">
            <div>
              <span>Network scope</span>
              <strong>{selectedChainKey}</strong>
            </div>
            {connectedSigner.address ? (
              <div>
                <span>Vault address</span>
                <code>{connectedSigner.address}</code>
              </div>
            ) : null}
          </div>
          <div className="vault-form-grid">
            <label>
              <span>Vault label</span>
              <input
                value={vaultName}
                onChange={(event) => onVaultNameChange(event.target.value)}
                placeholder="IntentProof local vault"
              />
            </label>
            <label>
              <span>Vault password</span>
              <input
                type="password"
                value={vaultPassword}
                onChange={(event) => onVaultPasswordChange(event.target.value)}
                placeholder="Session-only password"
                autoComplete="new-password"
              />
            </label>
            <label>
              <span>Unlock mode</span>
              <select
                value={vaultUnlockMode}
                onChange={(event) =>
                  onVaultUnlockModeChange(event.target.value as VaultUnlockMode)
                }
              >
                <option value="password">Password vault</option>
                <option value="passkey-gated-password">Passkey-gated password</option>
                <option value="passkey-prf">Passkey PRF when supported</option>
              </select>
            </label>
          </div>
          <div className="button-row">
            <TokenButton tone="primary" type="button" onClick={onCreateVault}>
              Create vault
            </TokenButton>
            <TokenButton type="button" onClick={onUnlockVault} disabled={!vaultRecord}>
              Unlock vault
            </TokenButton>
            <TokenButton type="button" onClick={onLockVault} disabled={!connectedSigner.address}>
              Lock
            </TokenButton>
            <TokenButton tone="ghost" type="button" onClick={onDeleteVault} disabled={!vaultRecord}>
              Delete local vault
            </TokenButton>
          </div>
          <TokenAlert tone="info" title="Vault status">
            {vaultStatus}
          </TokenAlert>
          <details className="advanced-policy-controls">
            <summary>Mainnet local vault controls</summary>
            <TokenAlert tone="warning" title="Mainnet local signing is session opt-in">
              Local Token Core Vault mainnet signing is disabled by default. Use
              it only with a fresh vault you intentionally fund and control.
            </TokenAlert>
            <label className="ack-line">
              <input
                type="checkbox"
                checked={vaultMainnetEnabled}
                onChange={(event) => onVaultMainnetEnabledChange(event.target.checked)}
              />
              Allow Local Token Core Vault to sign mainnet requests for this session
            </label>
            <label className="ack-line">
              <input
                type="checkbox"
                checked={vaultMainnetAcknowledged}
                onChange={(event) =>
                  onVaultMainnetAcknowledgedChange(event.target.checked)
                }
              />
              I understand this local vault can sign real mainnet transactions.
            </label>
          </details>
        </section>
      ) : null}
    </TokenCard>
  );
}
