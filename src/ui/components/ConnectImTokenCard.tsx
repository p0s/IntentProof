import type { LiveConnectorState } from "../../lib/live/types";

interface ConnectImTokenCardProps {
  state: LiveConnectorState;
  projectIdPresent: boolean;
  onConnect: () => void;
}

export function ConnectImTokenCard({
  state,
  projectIdPresent,
  onConnect,
}: ConnectImTokenCardProps) {
  const isConnected = state.status === "connected" && Boolean(state.account);
  const isPairing = state.status === "pairing";
  const heading = isConnected ? "imToken connected" : "Connect imToken";
  const buttonLabel = !projectIdPresent
    ? "WalletConnect setup required"
    : isConnected
      ? "imToken connected"
      : isPairing
        ? "Pairing imToken"
        : "Connect imToken";
  const buttonDisabled =
    (!projectIdPresent && state.status === "setup-required") || isConnected || isPairing;

  return (
    <section className="surface live-connect-card">
      <span className="eyebrow">Final signer</span>
      <h2>{heading}</h2>
      <p>
        {isConnected
          ? "IntentProof is ready to forward approved requests to imToken for final signing."
          : "imToken remains the final signer. IntentProof stores only session metadata and forwards requests after policy review."}
      </p>
      <div className={`live-status ${state.status}`}>
        <strong>{state.label}</strong>
        <span>{state.detail}</span>
        {state.account ? <code>{state.account.address}</code> : null}
      </div>
      <button
        type="button"
        className="primary-action"
        onClick={onConnect}
        disabled={buttonDisabled}
      >
        {buttonLabel}
      </button>
      {!projectIdPresent ? (
        <p className="small-text">
          Add the public `VITE_WALLETCONNECT_PROJECT_ID` to enable live pairing.
          Examples and the Token Core Lab still work without it.
        </p>
      ) : null}
      {state.pairingUri ? (
        <details>
          <summary>Show pairing URI</summary>
          <pre>{state.pairingUri}</pre>
        </details>
      ) : null}
    </section>
  );
}
