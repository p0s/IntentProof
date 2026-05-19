export interface WalletConnectUriValidation {
  ok: boolean;
  uri?: string;
  error?: string;
}

export interface QrScannerControls {
  stop: () => void;
}

export function validateWalletConnectUri(value: string): WalletConnectUriValidation {
  const uri = value.trim();
  if (!uri) {
    return { ok: false, error: "Enter a WalletConnect URI that starts with wc:." };
  }
  if (!uri.toLowerCase().startsWith("wc:")) {
    return { ok: false, error: "WalletConnect URIs must start with wc:." };
  }
  if (!/^wc:[^@\s]+@2\?/.test(uri)) {
    return {
      ok: false,
      error: "This does not look like a WalletConnect v2 URI.",
    };
  }
  const query = uri.split("?")[1] ?? "";
  const queryParams = new URLSearchParams(query);
  if (!queryParams.get("symKey")) {
    return {
      ok: false,
      error: "WalletConnect URI is missing the required symKey parameter.",
    };
  }
  return { ok: true, uri };
}

export function readWalletConnectUriFromLocation(href: string) {
  const url = new URL(href);
  const supportedPath =
    url.pathname === "/" || url.pathname === "/connect" || url.pathname === "/wc";
  if (!supportedPath) return undefined;
  return url.searchParams.get("uri") ?? undefined;
}

export function removeWalletConnectUriFromLocation(href: string) {
  const url = new URL(href);
  if (!url.searchParams.has("uri")) return `${url.pathname}${url.search}${url.hash}`;
  url.searchParams.delete("uri");
  return `${url.pathname}${url.search}${url.hash}`;
}

export async function decodeWalletConnectQrFromFile(file: File) {
  const { BrowserQRCodeReader } = await import("@zxing/browser");
  const reader = new BrowserQRCodeReader();
  const objectUrl = URL.createObjectURL(file);
  try {
    const result = await reader.decodeFromImageUrl(objectUrl);
    const validation = validateWalletConnectUri(result.getText());
    if (!validation.ok || !validation.uri) {
      throw new Error(validation.error ?? "QR image did not contain a WalletConnect URI.");
    }
    return validation.uri;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function findClipboardImageFile(items: DataTransferItemList | DataTransferItem[]) {
  const clipboardItems = Array.from(items);
  for (const item of clipboardItems) {
    if (item.kind === "file" && item.type.toLowerCase().startsWith("image/")) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return undefined;
}

export async function startWalletConnectQrScanner(params: {
  video: HTMLVideoElement;
  onUri: (uri: string) => void;
  onError: (message: string) => void;
}): Promise<QrScannerControls> {
  const { BrowserQRCodeReader } = await import("@zxing/browser");
  const reader = new BrowserQRCodeReader();
  let stopped = false;
  const controls = await reader.decodeFromVideoDevice(
    undefined,
    params.video,
    (result, error, scannerControls) => {
      if (stopped) return;
      if (result) {
        const validation = validateWalletConnectUri(result.getText());
        if (validation.ok && validation.uri) {
          stopped = true;
          scannerControls.stop();
          params.onUri(validation.uri);
        } else {
          params.onError(validation.error ?? "QR code is not a WalletConnect URI.");
        }
        return;
      }
      if (error && error.name !== "NotFoundException") {
        params.onError("Camera could not read a WalletConnect QR yet.");
      }
    },
  );

  return {
    stop: () => {
      stopped = true;
      controls.stop();
    },
  };
}
