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
      <strong>Mainnet · real assets</strong>
      <details>
        <summary>Review mainnet boundary</summary>
        <p>
          IntentProof reviews and relays to the connected wallet for final
          signing. It never signs mainnet transactions locally.
        </p>
        <p className="small-text">Full target address: {request.tx?.to ?? "n/a"}</p>
      </details>
    </section>
  );
}
