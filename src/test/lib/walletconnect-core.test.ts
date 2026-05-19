import { describe, expect, it } from "vitest";

import {
  getWalletConnectStoragePrefix,
  hashWalletConnectProjectId,
} from "../../lib/live/walletConnectCore";

describe("WalletConnect Core storage", () => {
  it("uses a deterministic project-scoped storage prefix", () => {
    const first = getWalletConnectStoragePrefix("project-alpha");
    const second = getWalletConnectStoragePrefix(" project-alpha ");

    expect(first).toBe(second);
    expect(first).toMatch(/^intentproof-live-v2-[0-9a-f]{8}$/);
  });

  it("separates sessions when the WalletConnect Project ID changes", () => {
    expect(getWalletConnectStoragePrefix("project-alpha")).not.toBe(
      getWalletConnectStoragePrefix("project-beta"),
    );
  });

  it("does not place the raw Project ID in browser storage keys", () => {
    const projectId = "public-but-not-worth-rendering-in-storage";

    expect(getWalletConnectStoragePrefix(projectId)).not.toContain(projectId);
    expect(hashWalletConnectProjectId("")).toBe("missing");
  });
});
