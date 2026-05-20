export interface PasskeyPrfSupport {
  supported: boolean;
  platformAuthenticatorAvailable: boolean;
  reason?: string;
}

type PublicKeyCredentialWithCapabilities = typeof PublicKeyCredential & {
  getClientCapabilities?: () => Promise<Record<string, unknown>>;
};

interface VaultPasskeyCredential {
  id: string;
  rawIdBase64Url: string;
}

function randomBytes(length = 32) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function toBase64Url(buffer: ArrayBuffer | Uint8Array) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function prfExtensionInputs(salt = randomBytes()) {
  return {
    prf: {
      eval: {
        first: salt,
      },
    },
  };
}

export async function detectPasskeyPrfSupport(): Promise<PasskeyPrfSupport> {
  if (
    typeof window === "undefined" ||
    !window.PublicKeyCredential ||
    !navigator.credentials
  ) {
    return {
      supported: false,
      platformAuthenticatorAvailable: false,
      reason: "WebAuthn is unavailable in this browser.",
    };
  }

  const PublicKeyCredentialCtor =
    window.PublicKeyCredential as PublicKeyCredentialWithCapabilities;
  const platformAuthenticatorAvailable =
    typeof PublicKeyCredentialCtor.isUserVerifyingPlatformAuthenticatorAvailable === "function"
      ? await PublicKeyCredentialCtor.isUserVerifyingPlatformAuthenticatorAvailable()
      : false;

  if (typeof PublicKeyCredentialCtor.getClientCapabilities !== "function") {
    return {
      supported: false,
      platformAuthenticatorAvailable,
      reason:
        "Passkey PRF support could not be proven; password vault mode is available.",
    };
  }

  const capabilities = await PublicKeyCredentialCtor.getClientCapabilities().catch(
    () => undefined,
  );
  const prfSupported =
    capabilities?.prf === true || capabilities?.prfExtension === true;

  return {
    supported: platformAuthenticatorAvailable && prfSupported,
    platformAuthenticatorAvailable,
    reason:
      platformAuthenticatorAvailable && prfSupported
        ? undefined
        : "Passkey PRF support could not be proven; password vault mode is available.",
  };
}

export async function createVaultPasskeyCredential(
  label: string,
): Promise<VaultPasskeyCredential> {
  const support = await detectPasskeyPrfSupport();
  if (!support.supported) {
    throw new Error(support.reason ?? "Passkey PRF is not available.");
  }
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(),
      rp: {
        name: "IntentProof Tx Guard",
        id: window.location.hostname || "localhost",
      },
      user: {
        id: randomBytes(16),
        name: label,
        displayName: label,
      },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "preferred",
        userVerification: "required",
      },
      timeout: 60_000,
      extensions: prfExtensionInputs() as AuthenticationExtensionsClientInputs,
    },
  });

  if (!(credential instanceof PublicKeyCredential)) {
    throw new Error("Passkey creation did not return a public-key credential.");
  }
  return {
    id: credential.id,
    rawIdBase64Url: toBase64Url(credential.rawId),
  };
}

export async function deriveVaultKeyWithPrf(credentialIdBase64Url: string) {
  const support = await detectPasskeyPrfSupport();
  if (!support.supported) {
    throw new Error(support.reason ?? "Passkey PRF is not available.");
  }
  const salt = randomBytes();
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(),
      allowCredentials: [
        {
          id: fromBase64Url(credentialIdBase64Url),
          type: "public-key",
        },
      ],
      userVerification: "required",
      timeout: 60_000,
      extensions: prfExtensionInputs(salt) as AuthenticationExtensionsClientInputs,
    },
  });
  if (!(assertion instanceof PublicKeyCredential)) {
    throw new Error("Passkey unlock did not return a public-key credential.");
  }

  const extensionResults = assertion.getClientExtensionResults() as Record<
    string,
    unknown
  >;
  const prf = extensionResults.prf as
    | { results?: { first?: ArrayBuffer } }
    | undefined;
  const first = prf?.results?.first;
  if (!first) {
    throw new Error("Passkey PRF result was not returned by this browser.");
  }
  return toBase64Url(first);
}

export async function requirePasskeyApproval(credentialIdBase64Url?: string) {
  if (!credentialIdBase64Url) {
    throw new Error("No vault passkey credential is registered.");
  }
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(),
      allowCredentials: [
        {
          id: fromBase64Url(credentialIdBase64Url),
          type: "public-key",
        },
      ],
      userVerification: "required",
      timeout: 60_000,
    },
  });
  if (!(assertion instanceof PublicKeyCredential)) {
    throw new Error("Passkey approval was not completed.");
  }
  return true;
}
