import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/tokencore", () => ({
  broadcastSignedTransaction: vi.fn(),
  signDraftTransaction: vi.fn(),
  signTokenCoreMessage: vi.fn(),
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
import {
  signDraftTransaction,
  signTokenCoreMessage,
} from "../../lib/tokencore";

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
    vi.mocked(signDraftTransaction).mockReset();
    vi.mocked(signTokenCoreMessage).mockReset();
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

  it("allows Token Core encrypted mnemonic keystore fields", async () => {
    const tokenCoreRecord = {
      ...record,
      keystoreJson:
        '{"userId":"vault","credentialId":"vault-sepolia","encryptedMnemonic":"abc","mnemonicIv":"def","identity":{"encKey":"ghi"}}',
    };

    expect(isSecretSafeLocalVaultRecord(tokenCoreRecord)).toBe(true);
    await expect(saveLocalTokenCoreVault(tokenCoreRecord)).resolves.toBeUndefined();
  });

  it("rejects records that contain plaintext secret markers", async () => {
    const unsafe = { ...record, name: "vault mnemonic backup" };

    expect(isSecretSafeLocalVaultRecord(unsafe)).toBe(false);
    await expect(saveLocalTokenCoreVault(unsafe)).rejects.toThrow(/forbidden secret/i);
  });

  it("rejects keystore JSON with plaintext secret field names", async () => {
    const unsafe = {
      ...record,
      keystoreJson: '{"mnemonic":"abandon abandon abandon"}',
    };

    expect(isSecretSafeLocalVaultRecord(unsafe)).toBe(false);
    await expect(saveLocalTokenCoreVault(unsafe)).rejects.toThrow(
      /plaintext secret field/i,
    );
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

  it("allows reviewed message and typed-data signing gates when unlocked", () => {
    const personal = normalizeLiveRequest({
      id: "personal",
      origin: "login.example",
      method: "personal_sign",
      params: ["0x48656c6c6f", record.address],
      chainId: "eip155:11155111",
    });
    const typed = normalizeLiveRequest({
      id: "typed",
      origin: "ens.domains",
      method: "eth_signTypedData_v4",
      params: [
        record.address,
        JSON.stringify({
          domain: { name: "Demo" },
          types: { Commitment: [{ name: "contents", type: "string" }] },
          primaryType: "Commitment",
          message: { contents: "Review" },
        }),
      ],
      chainId: "eip155:11155111",
    });

    expect(
      evaluateLocalVaultSigningGate({
        request: personal,
        decision: passDecision,
        vaultUnlocked: true,
        mainnetEnabled: false,
        mainnetAcknowledged: false,
        warningAcknowledged: true,
      }).allowed,
    ).toBe(true);
    expect(
      evaluateLocalVaultSigningGate({
        request: typed,
        decision: passDecision,
        vaultUnlocked: true,
        mainnetEnabled: false,
        mainnetAcknowledged: false,
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

  it("passes legacy gasPrice transactions through to Token Core signing", async () => {
    vi.mocked(signDraftTransaction).mockResolvedValue({
      rawTransaction: "0xsigned",
      txHash: "0xhash",
      preparedRequest: {
        chainId: 11155111,
        gas: 21000n,
        nonce: 1,
        gasPrice: 1_000_000_000n,
      },
    });
    const request = normalizeLiveRequest({
      id: "legacy-gas",
      origin: "legacy.example",
      method: "eth_sendTransaction",
      params: [
        {
          from: record.address,
          to: "0x1111111111111111111111111111111111111111",
          value: "0x0",
          data: "0x",
          gas: "0x5208",
          gasPrice: "0x3b9aca00",
          chainId: "0xaa36a7",
        },
      ],
    });

    const result = await signLiveRequestWithLocalVault({
      wallet: vaultRecordToStoredWallet(record),
      password: "test-pass",
      request,
      broadcast: false,
    });

    expect(result.kind).toBe("signed");
    expect(vi.mocked(signDraftTransaction).mock.calls[0]?.[3]).toMatchObject({
      gas: 21000n,
      gasPrice: 1_000_000_000n,
      maxFeePerGas: undefined,
      maxPriorityFeePerGas: undefined,
    });
  });

  it("signs personal_sign with Token Core sign_message PersonalSign", async () => {
    vi.mocked(signTokenCoreMessage).mockResolvedValue({
      signature: "0xsig",
      signatureType: "PersonalSign",
    });
    const request = normalizeLiveRequest({
      id: "personal",
      origin: "login.example",
      method: "personal_sign",
      params: ["0x48656c6c6f", record.address],
      chainId: "eip155:11155111",
    });

    const result = await signLiveRequestWithLocalVault({
      wallet: vaultRecordToStoredWallet(record),
      password: "test-pass",
      request,
    });

    expect(result).toMatchObject({
      kind: "signature",
      signature: "0xsig",
      signatureMethod: "personal_sign",
    });
    expect(vi.mocked(signTokenCoreMessage)).toHaveBeenCalledWith(
      expect.objectContaining({ address: record.address }),
      "test-pass",
      {
        message: "Hello",
        signatureType: "PersonalSign",
      },
    );
  });

  it("signs eth_signTypedData_v4 by hashing EIP-712 data then Token Core EcSign", async () => {
    vi.mocked(signTokenCoreMessage).mockResolvedValue({
      signature: "0xtyped",
      signatureType: "EcSign",
    });
    const typedData = {
      domain: {
        name: "IntentProof Demo",
        version: "1",
        chainId: 11155111,
        verifyingContract: "0x1111111111111111111111111111111111111111",
      },
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        Commitment: [{ name: "contents", type: "string" }],
      },
      primaryType: "Commitment",
      message: { contents: "Review before signing" },
    };
    const request = normalizeLiveRequest({
      id: "typed",
      origin: "ens.domains",
      method: "eth_signTypedData_v4",
      params: [record.address, JSON.stringify(typedData)],
      chainId: "eip155:11155111",
    });

    const result = await signLiveRequestWithLocalVault({
      wallet: vaultRecordToStoredWallet(record),
      password: "test-pass",
      request,
    });

    expect(result).toMatchObject({
      kind: "signature",
      signature: "0xtyped",
      signatureMethod: "eth_signTypedData_v4",
      evidence: "Viem EIP-712 hash + Token Core sign_message EcSign",
    });
    const call = vi.mocked(signTokenCoreMessage).mock.calls[0];
    expect(call?.[2].signatureType).toBe("EcSign");
    expect(call?.[2].message).toMatch(/^0x[a-fA-F0-9]{64}$/);
  });
});
