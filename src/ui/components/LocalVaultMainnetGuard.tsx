import type { LiveRequest } from "../../lib/live/types";
import { isMainnetChainKey } from "../../lib/chains";

interface LocalVaultMainnetGuardProps {
  request?: LiveRequest;
  address?: `0x${string}`;
  enabled: boolean;
  acknowledged: boolean;
}

export function LocalVaultMainnetGuard({
  request,
  address,
  enabled,
  acknowledged,
}: LocalVaultMainnetGuardProps) {
  if (!request || !isMainnetChainKey(request.chain.chainKey)) return null;
  return (
    <section className="local-vault-mainnet-guard" aria-label="Local vault mainnet guard">
      <strong>Mainnet local vault signing</strong>
      <p>
        This request is on {request.chain.label}. The Local Token Core Vault can
        sign real mainnet transactions only after session opt-in and
        acknowledgement.
      </p>
      <dl>
        <div>
          <dt>Vault address</dt>
          <dd>{address ?? "Vault locked or unavailable"}</dd>
        </div>
        <div>
          <dt>Mainnet opt-in</dt>
          <dd>{enabled && acknowledged ? "Enabled for this session" : "Disabled"}</dd>
        </div>
      </dl>
    </section>
  );
}
