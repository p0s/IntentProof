import type { ReactNode } from "react";

interface WalletConnectSetupNoticeProps {
  children: ReactNode;
}

export function WalletConnectSetupNotice({
  children,
}: WalletConnectSetupNoticeProps) {
  return (
    <div className="live-status setup-required" role="note">
      <strong>WalletConnect setup required</strong>
      <span>{children}</span>
    </div>
  );
}
