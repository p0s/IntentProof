import type { ReactNode } from "react";

interface ProtectWalletScreenProps {
  statusSummary: ReactNode;
  signerPanel: ReactNode;
  connectDapp: ReactNode;
  requestInbox: ReactNode;
  signingCard: ReactNode;
  receiptSummary: ReactNode;
  supportTools: ReactNode;
}

export function ProtectWalletScreen({
  statusSummary,
  signerPanel,
  connectDapp,
  requestInbox,
  signingCard,
  receiptSummary,
  supportTools,
}: ProtectWalletScreenProps) {
  return (
    <section className="product-screen protect-wallet-screen">
      <div className="protect-status-card surface">
        <div>
          <span className="eyebrow">Wallet approval inbox</span>
          <h1>Protect your imToken before signing.</h1>
          <p>Review DApp requests before the selected signer continues.</p>
        </div>
        {statusSummary}
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
