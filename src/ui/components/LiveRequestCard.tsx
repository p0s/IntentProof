import {
  assessLiveRequest,
  presentWalletRequest,
} from "../../lib/live/requestAssessment";
import { summarizeLiveRequest } from "../../lib/live/semanticSummary";
import type { LivePolicyDecision, LiveRequest } from "../../lib/live/types";
import { describeLiveRequestMethod } from "../../lib/live/requestDisplay";
import { isReadOnlyLiveRpcMethod } from "../../lib/live/rpcProxy";
import { understandLiveRequest } from "../../lib/txUnderstanding/understandLiveRequest";
import { MainnetGuard } from "./MainnetGuard";

interface LiveRequestCardProps {
  request?: LiveRequest;
  decision?: LivePolicyDecision;
  warningAcknowledged: boolean;
  onWarningAcknowledged: (acknowledged: boolean) => void;
  onForward: () => void;
  onReject: () => void;
  forwardTargetLabel: string;
}

function shortenPreview(value: string, maxLength = 900) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n... truncated ${value.length - maxLength} characters`;
}

function stringifyPreview(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value === "string") return shortenPreview(value);
  try {
    return shortenPreview(JSON.stringify(value, null, 2));
  } catch {
    return "Unable to render request payload.";
  }
}

function calldataSelector(data?: string) {
  if (!data || data === "0x") return "n/a";
  return data.length >= 10 ? data.slice(0, 10) : data;
}

function calldataByteLength(data?: string) {
  if (!data || data === "0x") return "0 bytes";
  return `${Math.max(0, Math.floor((data.length - 2) / 2))} bytes`;
}

function hexValueLabel(value?: string) {
  if (!value) return "0 wei";
  try {
    return `${BigInt(value).toString()} wei`;
  } catch {
    return value;
  }
}

function reviewPayload(request: LiveRequest) {
  if (request.typedData !== undefined) {
    return {
      label: "Typed data payload",
      preview: stringifyPreview(request.typedData),
    };
  }
  if (request.message !== undefined) {
    return {
      label: "Message payload",
      preview: stringifyPreview(request.message),
    };
  }
  return {
    label: "Raw request params",
    preview: stringifyPreview(request.request.params),
  };
}

function localVaultSigningEvidence(request: LiveRequest, forwardTargetLabel: string) {
  if (forwardTargetLabel !== "Local Token Core Vault") return undefined;
  if (request.method === "personal_sign") {
    return "Local vault signs this as Token Core sign_message PersonalSign. Hex messages must be UTF-8 readable; unreadable bytes fail closed.";
  }
  if (request.method === "eth_signTypedData_v4") {
    return "Local vault hashes this EIP-712 typed-data packet with viem, then signs the digest with Token Core sign_message EcSign.";
  }
  if (request.method === "eth_sendTransaction") {
    return "Local vault signs this transaction with Token Core sign_tx, using EIP-1559 fees or legacy gasPrice from the reviewed request.";
  }
  return undefined;
}

function isWalletCoordinationRequest(request: LiveRequest) {
  return (
    request.method === "wallet_switchEthereumChain" ||
    request.method === "wallet_getCapabilities" ||
    request.method === "eth_requestAccounts" ||
    request.method === "eth_accounts" ||
    request.method === "eth_chainId" ||
    isReadOnlyLiveRpcMethod(request.method)
  );
}

function simulationLabel(request: LiveRequest) {
  const simulation = request.evidence?.simulation;
  if (!simulation) return "not checked yet";
  if (simulation.status === "not-applicable") return "not applicable";
  if (simulation.status === "success") {
    return `${simulation.provider} simulated: no execution revert${simulation.gasEstimate ? ` · ${simulation.gasEstimate} gas` : ""}`;
  }
  if (simulation.status === "revert") return `${simulation.provider} simulated: would revert`;
  if (simulation.status === "pending") return "checking...";
  return "unavailable";
}

function decodeEvidenceLabel(request: LiveRequest) {
  const decode = request.evidence?.decode;
  if (!decode) return "not checked yet";
  if (decode.status === "not-applicable") return "not applicable";
  if (decode.status === "decoded") {
    return `${decode.source}${decode.functionName ? ` · ${decode.functionName}` : ""}`;
  }
  if (decode.status === "selector") return "selector only";
  if (decode.status === "unknown") return "unknown";
  return "unavailable";
}

export function LiveRequestCard({
  request,
  decision,
  warningAcknowledged,
  onWarningAcknowledged,
  onForward,
  onReject,
  forwardTargetLabel,
}: LiveRequestCardProps) {
  if (!request || !decision) {
    return (
      <section className="surface live-request-card">
        <h2>Review incoming request</h2>
        <p className="muted">Connect a DApp or choose a request from the inbox.</p>
      </section>
    );
  }

  const payload = reviewPayload(request);
  const vaultSigningEvidence = localVaultSigningEvidence(
    request,
    forwardTargetLabel,
  );
  const chainLabel = request.unsupportedChainId
    ? `Unsupported (${request.unsupportedChainId})`
    : request.chain.label;
  const coordinationRequest = isWalletCoordinationRequest(request);
  const assessment = assessLiveRequest({ request, decision });
  const presentation = presentWalletRequest({ request, decision });
  const semanticSummary = summarizeLiveRequest(request);
  const understanding = understandLiveRequest(request);
  const forwardButtonLabel = coordinationRequest
    ? "Answer locally"
    : forwardTargetLabel === "Local Token Core Vault"
      ? "Sign with Local Token Core Vault"
      : forwardTargetLabel === "imToken Web"
        ? "Forward to imToken Web"
        : forwardTargetLabel === "imToken"
      ? "Forward to imToken"
      : "Forward to connected wallet";

  return (
    <section className="surface live-request-card">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{assessment.sourceLabel}</span>
          <h2>{semanticSummary.title}</h2>
        </div>
        <div className="compact-label-row">
          <span className={`request-row-status tone-${presentation.statusTone}`}>
            {presentation.statusLabel}
          </span>
          <span className="chain-badge">{chainLabel}</span>
          {request.chain.environment === "mainnet" ? (
            <span className="mainnet-compact-badge">Mainnet · real assets</span>
          ) : null}
        </div>
      </div>
      <section className="request-detail-hero">
        <span className="eyebrow">What this request wants</span>
        <strong>{semanticSummary.whatItWants}</strong>
        {semanticSummary.whyDappNeedsIt ? <p>{semanticSummary.whyDappNeedsIt}</p> : null}
        <div className="policy-chip-row">
          {semanticSummary.chips.map((chip) => (
            <span key={chip}>{chip}</span>
          ))}
        </div>
      </section>
      <MainnetGuard request={request} />
      <section className="impact-grid" aria-label="What can change">
        <div>
          <span>What can change</span>
          <strong>{presentation.impactLine}</strong>
        </div>
        {understanding.valueSummary ? (
          <div>
            <span>Native value</span>
            <strong>{understanding.valueSummary}</strong>
          </div>
        ) : null}
        {understanding.assetAuthorityKind === "none" ? (
          <div>
            <span>Token permission</span>
            <strong>No approval detected</strong>
          </div>
        ) : null}
        {understanding.actionKind === "swap" &&
        understanding.assetAuthorityKind !== "permit2" &&
        understanding.assetAuthorityKind !== "unlimited-token-approval" ? (
          <div>
            <span>Permit2 / approval</span>
            <strong>No Permit2 permission detected</strong>
          </div>
        ) : null}
        {understanding.assetAuthorityKind === "permit2" ? (
          <div>
            <span>Permit2</span>
            <strong>{understanding.spender ? `Spender ${understanding.spender}` : "Permit2 authority detected"}</strong>
          </div>
        ) : null}
        {understanding.assetAuthorityKind === "unlimited-token-approval" ||
        understanding.assetAuthorityKind === "limited-token-approval" ? (
          <div>
            <span>Token permission</span>
            <strong>
              {understanding.assetAuthorityKind === "unlimited-token-approval"
                ? "Unlimited approval"
                : "Limited approval"}
            </strong>
          </div>
        ) : null}
        {semanticSummary.primaryAmount ? (
          <div>
            <span>Amount</span>
            <strong>{semanticSummary.primaryAmount}</strong>
          </div>
        ) : null}
        {semanticSummary.tokenIn || semanticSummary.tokenOut ? (
          <div>
            <span>Route</span>
            <strong>
              {[semanticSummary.tokenIn, semanticSummary.tokenOut].filter(Boolean).join(" → ")}
            </strong>
          </div>
        ) : null}
        {semanticSummary.recipient ? (
          <div>
            <span>Recipient / contract</span>
            <strong>{semanticSummary.recipient}</strong>
          </div>
        ) : null}
        {semanticSummary.spender ? (
          <div>
            <span>Spender</span>
            <strong>{semanticSummary.spender}</strong>
          </div>
        ) : null}
        {request.method.includes("sign") && payload.preview ? (
          <div>
            <span>Signature payload</span>
            <strong>{payload.preview.split("\n")[0]}</strong>
          </div>
        ) : null}
      </section>
      <section className={`intentproof-result tone-${presentation.statusTone}`}>
        <div>
          <span className="eyebrow">IntentProof result</span>
          <strong>{presentation.statusLabel}</strong>
          <p>{decision.summary}</p>
          {understanding.decodeQuality === "partial-protocol-decode" ? (
            <p>
              {understanding.actionKind === "swap"
                ? "Recognized protocol flow with partial route decoding. Verify the missing route details in the connected wallet."
                : "Recognized request with partial decode evidence."}
            </p>
          ) : null}
        </div>
        <ul>
          {(decision.issues.length
            ? decision.issues.slice(0, 3).map((issue) => `${issue.title}: ${issue.description}`)
            : semanticSummary.userShouldCheck.slice(0, 2)
          ).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      {decision.requiresAcknowledgement ? (
        <label className="ack-line">
          <input
            type="checkbox"
            checked={warningAcknowledged}
            onChange={(event) => onWarningAcknowledged(event.target.checked)}
          />
          I reviewed these details and want the selected signer to continue.
        </label>
      ) : null}
      <div className="button-row request-action-bar">
        <button type="button" className="primary-action" onClick={onForward} disabled={!decision.canForward}>
          {decision.severity === "block"
            ? "Cannot relay with IntentProof"
            : forwardButtonLabel}
        </button>
        <button type="button" className="button-secondary" onClick={onReject}>
          Reject request
        </button>
      </div>
      <details className="advanced-evidence">
        <summary>Advanced evidence</summary>
        <div className="facts-grid">
          <div>
            <span>Origin</span>
            <strong>{request.origin}</strong>
          </div>
          <div>
            <span>Request</span>
            <strong>{describeLiveRequestMethod(request)}</strong>
          </div>
          <div>
            <span>Chain</span>
            <strong>{chainLabel}</strong>
          </div>
          <div>
            <span>Signer address</span>
            <strong>{request.tx?.from ?? "n/a"}</strong>
          </div>
          <div>
            <span>Full target address</span>
            <strong>{request.tx?.to ?? "n/a"}</strong>
          </div>
          <div>
            <span>Native value</span>
            <strong>{hexValueLabel(request.tx?.value)}</strong>
          </div>
          <div>
            <span>Calldata selector</span>
            <strong>{calldataSelector(request.tx?.data)}</strong>
          </div>
          <div>
            <span>Calldata length</span>
            <strong>{calldataByteLength(request.tx?.data)}</strong>
          </div>
          <div>
            <span>Evidence score</span>
            <strong>{assessment.evidenceScore}/100</strong>
          </div>
          <div>
            <span>User action</span>
            <strong>{assessment.userActionLabel}</strong>
          </div>
          <div>
            <span>Execution simulation</span>
            <strong>{simulationLabel(request)}</strong>
          </div>
          <div>
            <span>Decode evidence</span>
            <strong>{decodeEvidenceLabel(request)}</strong>
          </div>
          <div>
            <span>Asset changes</span>
            <strong>{request.evidence?.simulation.assetChanges.length ?? 0}</strong>
          </div>
        </div>
        <p className="simulation-boundary-note">
          Simulation shows whether the request is likely to execute and what it may
          change. It is not a malicious-transaction detector and does not prove a
          request is safe.
        </p>
        <section className={`review-score-panel confidence-${assessment.evidenceConfidence}`}>
          <div>
            <span className="eyebrow">Evidence and risk</span>
            <strong>{semanticSummary.subtitle}</strong>
          </div>
          <h3>Evidence confidence</h3>
          <ul>
            {assessment.evidenceReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <h3>Risk level</h3>
          <ul>
            {assessment.riskReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <h3>User should check</h3>
          <ul>
            {semanticSummary.userShouldCheck.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </section>
        <div className="issue-list">
          {decision.issues.length === 0 ? (
            <div className="issue-row severity-pass">
              <strong>No unusual signals found</strong>
              <span>
                {coordinationRequest
                  ? "This wallet coordination request can be answered locally so the DApp can continue."
                  : "Review the request details, then use imToken as the final signing checkpoint."}
              </span>
            </div>
          ) : (
            decision.issues.map((issue) => (
              <div
                key={`${issue.title}-${issue.description}`}
                className={`issue-row severity-${issue.severity}`}
              >
                <strong>{issue.title}</strong>
                <span>{issue.description}</span>
              </div>
            ))
          )}
        </div>
        {payload.preview ? (
          <details className="live-request-details">
            <summary>{payload.label}</summary>
            <pre>{payload.preview}</pre>
          </details>
        ) : null}
        {vaultSigningEvidence ? (
          <section className="semantic-summary-panel">
            <span className="eyebrow">Local Token Core Vault signing evidence</span>
            <strong>{vaultSigningEvidence}</strong>
          </section>
        ) : null}
      </details>
    </section>
  );
}
