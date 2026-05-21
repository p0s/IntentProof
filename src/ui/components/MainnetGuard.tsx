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
      <span>Review values and addresses before forwarding.</span>
      <details>
        <summary>More</summary>
        <p>
          IntentProof reviews the request, but the selected signer remains the
          final checkpoint. IntentProof does not custody imToken keys.
        </p>
        <p className="small-text">Full target address: {request.tx?.to ?? "n/a"}</p>
      </details>
    </section>
  );
}
