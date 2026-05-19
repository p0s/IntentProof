import type { LiveRequest } from "../../lib/live/types";

interface MainnetGuardProps {
  request?: LiveRequest;
}

export function MainnetGuard({
  request,
}: MainnetGuardProps) {
  if (request?.chain.environment !== "mainnet") return null;

  return (
    <section className="mainnet-guard" aria-label="Mainnet warning">
      <span className="eyebrow">Mainnet warning</span>
      <strong>This request uses mainnet.</strong>
      <p>
        IntentProof can review mainnet requests and relay reviewable requests
        to imToken, but mainnet assets are real. Check full addresses and values.
      </p>
      <p className="small-text">
        Mainnet requests always use the connected wallet for final signing;
        IntentProof never signs mainnet transactions locally. Requests that
        IntentProof cannot mediate are not relayed.
        Full target address: {request.tx?.to ?? "n/a"}
      </p>
    </section>
  );
}
