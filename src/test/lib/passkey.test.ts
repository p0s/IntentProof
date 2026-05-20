// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { detectPasskeyPrfSupport } from "../../lib/localVault/passkey";

describe("local vault passkey support", () => {
  const originalPublicKeyCredential = window.PublicKeyCredential;
  const originalCredentials = window.navigator.credentials;

  afterEach(() => {
    Object.defineProperty(window, "PublicKeyCredential", {
      configurable: true,
      value: originalPublicKeyCredential,
    });
    Object.defineProperty(window.navigator, "credentials", {
      configurable: true,
      value: originalCredentials,
    });
  });

  it("falls back cleanly when WebAuthn PRF support cannot be proven", async () => {
    Object.defineProperty(window, "PublicKeyCredential", {
      configurable: true,
      value: undefined,
    });

    const support = await detectPasskeyPrfSupport();

    expect(support.supported).toBe(false);
    expect(support.reason).toMatch(/webauthn|unavailable/i);
  });

  it("does not infer PRF support from generic platform passkey support", async () => {
    Object.defineProperty(window.navigator, "credentials", {
      configurable: true,
      value: {},
    });
    class MockCredential {
      static async isUserVerifyingPlatformAuthenticatorAvailable() {
        return true;
      }
    }
    Object.defineProperty(window, "PublicKeyCredential", {
      configurable: true,
      value: MockCredential,
    });

    const support = await detectPasskeyPrfSupport();

    expect(support.supported).toBe(false);
    expect(support.platformAuthenticatorAvailable).toBe(true);
    expect(support.reason).toMatch(/could not be proven/i);
  });

  it("reports PRF support only when browser capabilities expose it", async () => {
    Object.defineProperty(window.navigator, "credentials", {
      configurable: true,
      value: {},
    });
    class MockCredential {
      static async isUserVerifyingPlatformAuthenticatorAvailable() {
        return true;
      }

      static async getClientCapabilities() {
        return { prf: true };
      }
    }
    Object.defineProperty(window, "PublicKeyCredential", {
      configurable: true,
      value: MockCredential,
    });

    const support = await detectPasskeyPrfSupport();

    expect(support.supported).toBe(true);
    expect(support.reason).toBeUndefined();
  });
});
