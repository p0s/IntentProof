import type { ReactNode } from "react";

interface ProtectWalletScreenProps {
  signerPanel: ReactNode;
  connectDapp: ReactNode;
  requestInbox: ReactNode;
  signingCard: ReactNode;
  receiptSummary: ReactNode;
  supportTools: ReactNode;
}

export function ProtectWalletScreen({
  signerPanel,
  connectDapp,
  requestInbox,
  signingCard,
  receiptSummary,
  supportTools,
}: ProtectWalletScreenProps) {
  return (
    <section className="product-screen protect-wallet-screen">
      <div className="protect-hero surface">
        <h1>Protect your imToken before signing.</h1>
        <p>
          Route DApp requests through IntentProof. We verify the actual
          transaction before imToken signs.
        </p>
      </div>
      <div className="live-grid live-grid-single">
        {signerPanel}
        {connectDapp}
      </div>
      <div className="live-review-grid">
        {requestInbox}
        {signingCard}
      </div>
      {receiptSummary}
      {supportTools}
    </section>
  );
}
