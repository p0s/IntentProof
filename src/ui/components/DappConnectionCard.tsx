import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";

import {
  decodeWalletConnectQrFromFile,
  findClipboardImageFile,
  startWalletConnectQrScanner,
  validateWalletConnectUri,
  type QrScannerControls,
} from "../../lib/live/qr";
import type { LiveConnectorState, LiveDappSession } from "../../lib/live/types";
import { WalletConnectSetupNotice } from "./WalletConnectSetupNotice";

interface DappConnectionCardProps {
  state: LiveConnectorState;
  pairingUri: string;
  uriSource: "manual" | "route";
  projectIdPresent: boolean;
  signerConnected: boolean;
  signerConnecting: boolean;
  signerLabel: string;
  onPairingUriChange: (uri: string) => void;
  onConnectSigner: () => void;
  onConnect: () => void;
  onResetLiveSessions: () => void;
}

function CameraGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" focusable="false">
      <rect x="10" y="16" width="28" height="22" rx="7" />
      <path d="M18 16l3-5h7l3 5" />
      <circle cx="24" cy="27" r="7" />
      <path d="M34 21h.01" />
    </svg>
  );
}

function QrGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" focusable="false">
      <rect x="10" y="10" width="10" height="10" rx="2" />
      <rect x="28" y="10" width="10" height="10" rx="2" />
      <rect x="10" y="28" width="10" height="10" rx="2" />
      <path d="M28 28h4v4h-4zM36 28h2v10h-8v-2h6zM24 10v8M24 24h4M20 24h-6M24 32v6M10 24h4M34 24h4" />
    </svg>
  );
}

function statusIcon(status: LiveConnectorState["status"]) {
  if (status === "connected") return "✓";
  if (status === "error") return "×";
  if (status === "pairing") return "…";
  if (status === "setup-required") return "!";
  return "○";
}

function statusText(status: LiveConnectorState["status"]) {
  if (status === "connected") return "Connected";
  if (status === "error") return "Needs attention";
  if (status === "pairing") return "Pairing";
  if (status === "setup-required") return "Setup needed";
  return "Ready";
}

function sessionHost(session: LiveDappSession) {
  if (!session.url) return "WalletConnect session";
  try {
    return new URL(session.url).host.replace(/^www\./, "");
  } catch {
    return session.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
}

function sessionInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "D";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
}

function sessionNetworkCopy(session: LiveDappSession) {
  if (!session.chains.length) return "Network pending";
  if (session.chains.length === 1) return session.chains[0].replace("eip155:", "Chain ");
  return `${session.chains.length} networks`;
}

export function DappConnectionCard({
  state,
  pairingUri,
  uriSource,
  projectIdPresent,
  signerConnected,
  signerConnecting,
  signerLabel,
  onPairingUriChange,
  onConnectSigner,
  onConnect,
  onResetLiveSessions,
}: DappConnectionCardProps) {
  const [scanStatus, setScanStatus] = useState("Ready to scan a WalletConnect QR.");
  const [dragActive, setDragActive] = useState(false);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<QrScannerControls | undefined>(undefined);
  const hasRoutedUri = uriSource === "route" && pairingUri.trim().length > 0;
  const manualValidation =
    pairingUri.trim().length > 0 ? validateWalletConnectUri(pairingUri) : undefined;
  const hasValidPairingUri = Boolean(manualValidation?.ok);
  const canPair =
    projectIdPresent && signerConnected && hasValidPairingUri;
  const shouldShowStatusDetail =
    state.status !== "idle" && state.detail.trim().length > 0;
  const canCloseConnections = state.status === "connected";
  const connectedSessions = state.sessions ?? [];
  const buttonLabel =
    !signerConnected && hasValidPairingUri
      ? "Connect signer first"
      : hasRoutedUri
        ? "Pair routed DApp through IntentProof"
        : "Connect DApp through IntentProof";

  const handleClipboardQr = useCallback(
    async (file: File) => {
      setScanStatus("Reading pasted QR screenshot.");
      try {
        const uri = await decodeWalletConnectQrFromFile(file);
        onPairingUriChange(uri);
        setScanStatus("WalletConnect URI detected from pasted screenshot.");
      } catch (error) {
        setScanStatus(
          error instanceof Error
            ? error.message
            : "Pasted image did not contain a valid WalletConnect URI.",
        );
      }
    },
    [onPairingUriChange],
  );

  useEffect(() => {
    function handleWindowPaste(event: ClipboardEvent) {
      if (hasRoutedUri) return;
      const file = event.clipboardData?.items
        ? findClipboardImageFile(event.clipboardData.items)
        : undefined;
      if (!file) return;
      event.preventDefault();
      void handleClipboardQr(file);
    }

    window.addEventListener("paste", handleWindowPaste);
    return () => {
      window.removeEventListener("paste", handleWindowPaste);
      controlsRef.current?.stop();
    };
  }, [handleClipboardQr, hasRoutedUri]);

  async function handleScanQr() {
    if (!videoRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setScanStatus("Camera is unavailable. Upload a QR screenshot or paste the WalletConnect URI.");
      return;
    }
    setScanning(true);
    setScanStatus("Point the camera at the WalletConnect QR shown by the DApp.");
    try {
      controlsRef.current = await startWalletConnectQrScanner({
        video: videoRef.current,
        onUri: (uri) => {
          onPairingUriChange(uri);
          setScanning(false);
          setScanStatus("WalletConnect URI detected from camera.");
        },
        onError: setScanStatus,
      });
    } catch (error) {
      setScanning(false);
      setScanStatus(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Camera access denied. Upload a QR screenshot or paste the WalletConnect URI."
          : error instanceof Error
            ? error.message
            : "Camera scan failed. Upload a QR screenshot or paste the WalletConnect URI.",
      );
    }
  }

  function handleStopScan() {
    controlsRef.current?.stop();
    controlsRef.current = undefined;
    setScanning(false);
    setScanStatus("QR scanner stopped.");
  }

  async function handleUploadQr(file: File | undefined) {
    if (!file) return;
    setScanStatus("Reading QR image.");
    try {
      const uri = await decodeWalletConnectQrFromFile(file);
      onPairingUriChange(uri);
      setScanStatus("WalletConnect URI detected from uploaded image.");
    } catch (error) {
      setScanStatus(
        error instanceof Error
          ? error.message
          : "QR image did not contain a valid WalletConnect URI.",
      );
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleUploadQr(file);
  }

  return (
    <section className="surface live-connect-card">
      <div className="live-connect-heading">
        <div>
          <span className="eyebrow">DApp connection</span>
          <h2>Connect a DApp</h2>
        </div>
        <span
          className={`connection-status-pill ${state.status}`}
          title={`${state.label}. ${state.detail}`}
        >
          <span aria-hidden="true">{statusIcon(state.status)}</span>
          {statusText(state.status)}
        </span>
      </div>
      <p>
        {hasRoutedUri
          ? "Connect the selected signer here to approve the routed session and start receiving requests."
          : "Scan a DApp QR or paste its WalletConnect URI. IntentProof reviews requests before the selected signer continues."}
      </p>
      {shouldShowStatusDetail ? (
        <p className={`connection-status-detail ${state.status}`}>{state.detail}</p>
      ) : null}
      {connectedSessions.length ? (
        <section className="connected-dapps-panel" aria-label="Connected DApps">
          <div className="connected-dapps-heading">
            <div>
              <strong>Connected DApps</strong>
              <span>
                {connectedSessions.length === 1
                  ? "IntentProof is listening for this DApp."
                  : `IntentProof is listening for ${connectedSessions.length} DApps.`}
              </span>
            </div>
            <button
              type="button"
              className="button-secondary compact-close-button"
              onClick={onResetLiveSessions}
            >
              Close connections
            </button>
          </div>
          <ul className="connected-dapps-list">
            {connectedSessions.map((session) => (
              <li key={session.id}>
                <span className="connected-dapp-avatar" aria-hidden="true">
                  {sessionInitials(session.name)}
                </span>
                <span className="connected-dapp-copy">
                  <strong>{session.name}</strong>
                  <span>
                    {sessionHost(session)} · {sessionNetworkCopy(session)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {hasRoutedUri ? (
        <div className="live-status connected">
          <strong>DApp route detected</strong>
          <span>WalletConnect URI captured from the URL and hidden from the address bar.</span>
        </div>
      ) : (
        <>
          <div className="dapp-intake-grid" aria-label="DApp connection intake">
            <button
              type="button"
              className="qr-camera-action"
              onClick={() => void handleScanQr()}
            >
              <span className="dapp-svg-orb">
                <CameraGlyph />
              </span>
              <strong>Scan QR</strong>
              <span>Use this device camera.</span>
            </button>
            <div
              className={
                dragActive ? "walletconnect-intake drag-active" : "walletconnect-intake"
              }
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <span className="dapp-svg-orb">
                <QrGlyph />
              </span>
              <label className="walletconnect-uri-field">
                WalletConnect URI or QR screenshot
                <input
                  value={pairingUri}
                  onChange={(event) => onPairingUriChange(event.target.value)}
                  placeholder="wc:... or QR screenshot"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              {manualValidation && !manualValidation.ok ? (
                <p className="text-danger intake-error">{manualValidation.error}</p>
              ) : null}
              <div className="intake-actions">
                <label className="file-button subtle-file-button">
                  Upload QR screenshot
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => void handleUploadQr(event.target.files?.[0])}
                  />
                </label>
                <span>{scanStatus}</span>
              </div>
            </div>
          </div>

          <div
            className="qr-scan-panel"
            data-active={scanning ? "true" : "false"}
            aria-hidden={!scanning}
          >
            <video ref={videoRef} muted playsInline />
            {scanning ? (
              <>
                <span>{scanStatus}</span>
                <button type="button" className="button-secondary" onClick={handleStopScan}>
                  Stop scanner
                </button>
              </>
            ) : null}
          </div>

          <p className="demo-dapp-footnote">
            Optional integration example: <a href="/demo-dapp">demo merchant</a>.
          </p>
        </>
      )}
      {!projectIdPresent ? (
        <WalletConnectSetupNotice>
          Live DApp routing needs VITE_WALLETCONNECT_PROJECT_ID. Examples
          and the Token Core Lab still work without it.
        </WalletConnectSetupNotice>
      ) : null}
      {!signerConnected && hasValidPairingUri ? (
        <div className="signer-needed-callout">
          <div>
            <strong>Connect {signerLabel} to continue</strong>
            <span>
              DApp request detected. IntentProof needs the selected signer
              before it can approve this DApp session.
            </span>
          </div>
          <button
            type="button"
            onClick={onConnectSigner}
            disabled={!projectIdPresent || signerConnecting}
          >
            {signerConnecting ? "Connecting..." : `Connect ${signerLabel} to continue`}
          </button>
        </div>
      ) : null}
      <button
        type="button"
        onClick={onConnect}
        disabled={!canPair}
      >
        {buttonLabel}
      </button>
      {canCloseConnections && !connectedSessions.length ? (
        <button type="button" className="button-secondary compact-close-button" onClick={onResetLiveSessions}>
          Close connections
        </button>
      ) : null}
    </section>
  );
}
