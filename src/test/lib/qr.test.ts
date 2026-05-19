import { describe, expect, it } from "vitest";

import {
  findClipboardImageFile,
  readWalletConnectUriFromLocation,
  removeWalletConnectUriFromLocation,
  validateWalletConnectUri,
} from "../../lib/live/qr";

describe("WalletConnect QR helpers", () => {
  const validUri = `wc:demo@2?relay-protocol=irn&symKey=${"a".repeat(64)}`;

  it("validates WalletConnect v2 URIs", () => {
    expect(validateWalletConnectUri(validUri)).toEqual({ ok: true, uri: validUri });
    expect(validateWalletConnectUri("https://example.com").ok).toBe(false);
    expect(validateWalletConnectUri("wc:demo@1?symKey=abc").ok).toBe(false);
    expect(validateWalletConnectUri("wc:demo@2?relay-protocol=irn").ok).toBe(false);
  });

  it("reads supported launch routes and removes the URI from URLs", () => {
    const encoded = encodeURIComponent(validUri);

    expect(readWalletConnectUriFromLocation(`https://x.test/wc?uri=${encoded}`)).toBe(validUri);
    expect(readWalletConnectUriFromLocation(`https://x.test/connect?uri=${encoded}`)).toBe(
      validUri,
    );
    expect(readWalletConnectUriFromLocation(`https://x.test/?uri=${encoded}`)).toBe(validUri);
    expect(readWalletConnectUriFromLocation(`https://x.test/demo-dapp?uri=${encoded}`)).toBeUndefined();
    expect(removeWalletConnectUriFromLocation(`https://x.test/wc?uri=${encoded}&foo=1`)).toBe(
      "/wc?foo=1",
    );
  });

  it("finds pasted QR screenshot files on the clipboard", () => {
    const image = new File(["qr"], "walletconnect.png", { type: "image/png" });
    const textItem = {
      kind: "string",
      type: "text/plain",
      getAsFile: () => null,
    } as unknown as DataTransferItem;
    const imageItem = {
      kind: "file",
      type: "image/png",
      getAsFile: () => image,
    } as unknown as DataTransferItem;

    expect(findClipboardImageFile([textItem, imageItem])).toBe(image);
    expect(findClipboardImageFile([textItem])).toBeUndefined();
  });
});
