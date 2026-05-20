import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/tokencore", () => ({
  broadcastSignedTransaction: vi.fn(),
  signDraftTransaction: vi.fn(),
}));

import {
  clearLocalTokenCoreVaults,
  isSecretSafeLocalVaultRecord,
  loadLocalTokenCoreVaults,
  saveLocalTokenCoreVault,
} from "../../lib/localVault/storage";
import { evaluateLocalVaultSigningGate } from "../../lib/localVault/mainnetGuard";
import {
  type LocalTokenCoreVaultRecord,
  vaultRecordToStoredWallet,
} from "../../lib/localVault/types";
import { signLiveRequestWithLocalVault } from "../../lib/localVault/vaultSigner";
import { normalizeLiveRequest } from "../../lib/live/requestNormalizer";
import type { LivePolicyDecision } from "../../lib/live/types";

const record: LocalTokenCoreVaultRecord = {
  id: "vault-1",
  name: "IntentProof test vault",
  address: "0x7777777777777777777777777777777777777777",
  chainKey: "sepolia",
  chainId: 11155111,
  unlockMode: "password",
  keystoreJson: "{\"crypto\":{\"ciphertext\":\"encrypted\"}}",
  publicKey: "0xpub",
  derivationPath: "m/44'/60'/0'/0/0",
  createdAt: "2026-05-20T00:00:00.000Z",
  updatedAt: "2026-05-20T00:00:00.000Z",
};

const passDecision: LivePolicyDecision = {
  severity: "pass",
  label: "PASS",
  summary: "Request can be relayed.",
  score: { value: 90, confidence: "high", summary: "decoded", reasons: [] },
  canForward: true,
  requiresAcknowledgement: false,
  issues: [],
};

describe("Local Token Core Vault", () => {
  beforeEach(async () => {
    await clearLocalTokenCoreVaults();
  });

  it("stores encrypted keystore metadata without plaintext vault secrets", async () => {
    expect(isSecretSafeLocalVaultRecord(record)).toBe(true);

    await saveLocalTokenCoreVault(record);
    const saved = await loadLocalTokenCoreVaults();

    expect(saved).toHaveLength(1);
    expect(JSON.stringify(saved[0]).toLowerCase()).not.toContain("mnemonic");
    expect(JSON.stringify(saved[0]).toLowerCase()).not.toContain("privatekey");
    expect(JSON.stringify(saved[0]).toLowerCase()).not.toContain("test-pass");
  });

  it("rejects records that contain plaintext secret markers", async () => {
    const unsafe = { ...record, name: "vault mnemonic backup" };

    expect(isSecretSafeLocalVaultRecord(unsafe)).toBe(false);
    await expect(saveLocalTokenCoreVault(unsafe)).rejects.toThrow(/forbidden secret/i);
  });

  it("does not allow BLOCK requests to sign locally", () => {
    const request = normalizeLiveRequest({
      id: "blocked",
      origin: "unsafe.example",
      method: "eth_sendRawTransaction",
      params: ["0xdeadbeef"],
      chainId: "0x1",
    });
    const decision: LivePolicyDecision = {
      ...passDecision,
      severity: "block",
      label: "BLOCK",
      canForward: false,
      issues: [
        {
          severity: "block",
          title: "Unsupported method",
          description: "Raw signing is not relayed.",
        },
      ],
    };

    const gate = evaluateLocalVaultSigningGate({
      request,
      decision,
      vaultUnlocked: true,
      mainnetEnabled: true,
      mainnetAcknowledged: true,
      warningAcknowledged: true,
    });

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/never signed/i);
  });

  it("requires explicit mainnet opt-in before local vault signing", () => {
    const request = normalizeLiveRequest({
      id: "mainnet",
      origin: "app.uniswap.org",
      method: "eth_sendTransaction",
      params: [
        {
          from: record.address,
          to: "0x1111111111111111111111111111111111111111",
          value: "0x0",
          data: "0x",
          chainId: "0x1",
        },
      ],
    });

    expect(
      evaluateLocalVaultSigningGate({
        request,
        decision: passDecision,
        vaultUnlocked: true,
        mainnetEnabled: false,
        mainnetAcknowledged: false,
        warningAcknowledged: true,
      }).allowed,
    ).toBe(false);
    expect(
      evaluateLocalVaultSigningGate({
        request,
        decision: passDecision,
        vaultUnlocked: true,
        mainnetEnabled: true,
        mainnetAcknowledged: true,
        warningAcknowledged: true,
      }).allowed,
    ).toBe(true);
  });

  it("rejects local signing when the DApp sender differs from the vault address", async () => {
    const request = normalizeLiveRequest({
      id: "wrong-sender",
      origin: "app.uniswap.org",
      method: "eth_sendTransaction",
      params: [
        {
          from: "0x9999999999999999999999999999999999999999",
          to: "0x1111111111111111111111111111111111111111",
          value: "0x0",
          data: "0x",
          chainId: "0xaa36a7",
        },
      ],
    });

    await expect(
      signLiveRequestWithLocalVault({
        wallet: vaultRecordToStoredWallet(record),
        password: "test-pass",
        request,
      }),
    ).rejects.toThrow(/sender does not match/i);
  });
});
