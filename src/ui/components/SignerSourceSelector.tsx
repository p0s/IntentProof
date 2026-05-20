import type { DemoChainKey } from "../../lib/types";
import {
  SIGNER_SOURCE_OPTIONS,
  type ConnectedSigner,
  type SignerSource,
} from "../../lib/signer/types";
import type {
  LocalTokenCoreVaultRecord,
  VaultUnlockMode,
} from "../../lib/localVault/types";
import { TokenAlert } from "../token-ui/Alert";
import { TokenBadge } from "../token-ui/Badge";
import { TokenButton } from "../token-ui/Button";
import { TokenCard } from "../token-ui/Card";
import { TokenTabs } from "../token-ui/Tabs";

interface SignerSourceSelectorProps {
  source: SignerSource;
  connectedSigner: ConnectedSigner;
  projectIdPresent: boolean;
  vaultRecord?: LocalTokenCoreVaultRecord;
  vaultStatus: string;
  vaultName: string;
  vaultPassword: string;
  vaultUnlockMode: VaultUnlockMode;
  vaultMainnetEnabled: boolean;
  vaultMainnetAcknowledged: boolean;
  selectedChainKey: DemoChainKey;
  onSourceChange: (source: SignerSource) => void;
  onVaultNameChange: (name: string) => void;
  onVaultPasswordChange: (password: string) => void;
  onVaultUnlockModeChange: (mode: VaultUnlockMode) => void;
  onCreateVault: () => void;
  onUnlockVault: () => void;
  onLockVault: () => void;
  onDeleteVault: () => void;
  onVaultMainnetEnabledChange: (enabled: boolean) => void;
  onVaultMainnetAcknowledgedChange: (acknowledged: boolean) => void;
}

function signerStatusBadge(signer: ConnectedSigner) {
  if (signer.isUnlocked) return <TokenBadge tone="success">Ready</TokenBadge>;
  if (signer.address) return <TokenBadge tone="warning">Locked</TokenBadge>;
  return <TokenBadge tone="neutral">Not connected</TokenBadge>;
}

export function SignerSourceSelector({
  source,
  connectedSigner,
  projectIdPresent,
  vaultRecord,
  vaultStatus,
  vaultName,
  vaultPassword,
  vaultUnlockMode,
  vaultMainnetEnabled,
  vaultMainnetAcknowledged,
  selectedChainKey,
  onSourceChange,
  onVaultNameChange,
  onVaultPasswordChange,
  onVaultUnlockModeChange,
  onCreateVault,
  onUnlockVault,
  onLockVault,
  onDeleteVault,
  onVaultMainnetEnabledChange,
  onVaultMainnetAcknowledgedChange,
}: SignerSourceSelectorProps) {
  const localVaultSelected = source === "local-token-core-vault";
  return (
    <TokenCard className="signer-source-panel" aria-label="Choose signer">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Signer source</span>
          <h2>Choose signer</h2>
        </div>
        {signerStatusBadge(connectedSigner)}
      </div>
      <TokenTabs
        aria-label="Signer source"
        value={source}
        options={SIGNER_SOURCE_OPTIONS.map((option) => ({
          value: option.source,
          label: option.title,
          description: option.description,
        }))}
        onChange={onSourceChange}
      />
      <div className="signer-source-state">
        <div>
          <span>Active signer</span>
          <strong>{connectedSigner.label}</strong>
          {connectedSigner.address ? <code>{connectedSigner.address}</code> : null}
        </div>
        <div>
          <span>Network scope</span>
          <strong>{selectedChainKey}</strong>
        </div>
      </div>
      {source === "imtoken-web" ? (
        <TokenAlert tone="info" title="Connect imToken Web">
          imToken Web handles its own login and passkey/account flow. IntentProof
          reviews DApp requests before forwarding; it does not create imToken
          accounts or store imToken passkeys.
        </TokenAlert>
      ) : null}
      {source === "walletconnect-fallback" ? (
        <TokenAlert tone={projectIdPresent ? "info" : "warning"} title="WalletConnect fallback">
          {projectIdPresent
            ? "Use this only when imToken Web is unavailable. Requests still pass through IntentProof gates first."
            : "Fallback pairing needs the public VITE_WALLETCONNECT_PROJECT_ID. Other product areas still work."}
        </TokenAlert>
      ) : null}
      {localVaultSelected ? (
        <section className="local-vault-card" aria-label="Local Token Core Vault">
          <div className="local-vault-header">
            <div>
              <span className="eyebrow">Local signer</span>
              <h3>Local Token Core Vault</h3>
            </div>
            <TokenBadge tone={connectedSigner.isUnlocked ? "success" : "warning"}>
              {connectedSigner.isUnlocked ? "Unlocked" : "Locked"}
            </TokenBadge>
          </div>
          <p>
            Create a fresh encrypted Token Core vault in this browser. It stores
            encrypted keystore data only and never stores the vault password,
            plaintext private key, or mnemonic.
          </p>
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
          {vaultRecord ? (
            <div className="vault-address-panel">
              <span>Vault address exposed to DApps</span>
              <code>{vaultRecord.address}</code>
            </div>
          ) : null}
          <div className="button-row">
            <TokenButton tone="primary" type="button" onClick={onCreateVault}>
              Create Local Token Core Vault
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
