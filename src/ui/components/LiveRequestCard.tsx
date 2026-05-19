import type { LivePolicyDecision, LiveRequest } from "../../lib/live/types";
import { describeLiveRequestMethod } from "../../lib/live/requestDisplay";
import { MainnetGuard } from "./MainnetGuard";

interface LiveRequestCardProps {
  request?: LiveRequest;
  decision?: LivePolicyDecision;
  warningAcknowledged: boolean;
  onWarningAcknowledged: (acknowledged: boolean) => void;
  onForward: () => void;
  onReject: () => void;
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

function isWalletCoordinationRequest(request: LiveRequest) {
  return (
    request.method === "wallet_switchEthereumChain" ||
    request.method === "wallet_getCapabilities" ||
    request.method === "eth_requestAccounts" ||
    request.method === "eth_accounts" ||
    request.method === "eth_chainId"
  );
}

function reviewLabel(decision: LivePolicyDecision) {
  if (decision.severity === "block") return "Cannot relay";
  if (decision.severity === "warn") return "Needs review";
  if (decision.severity === "info") return "Informational";
  return "Routine";
}

function simulationLabel(request: LiveRequest) {
  const simulation = request.evidence?.simulation;
  if (!simulation) return "not checked yet";
  if (simulation.status === "not-applicable") return "not applicable";
  if (simulation.status === "success") {
    return `${simulation.provider} success${simulation.gasEstimate ? ` · ${simulation.gasEstimate} gas` : ""}`;
  }
  if (simulation.status === "revert") return `${simulation.provider} revert`;
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
}: LiveRequestCardProps) {
  if (!request || !decision) {
    return (
      <section className="surface live-request-card">
        <span className="eyebrow">Step 3</span>
        <h2>Review incoming request</h2>
        <p className="muted">Connect a DApp or choose a request from the inbox.</p>
      </section>
    );
  }

  const payload = reviewPayload(request);
  const chainLabel = request.unsupportedChainId
    ? `Unsupported (${request.unsupportedChainId})`
    : request.chain.label;
  const coordinationRequest = isWalletCoordinationRequest(request);

  return (
    <section className="surface live-request-card">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Step 3</span>
          <h2>Request Evidence</h2>
        </div>
        <span className={`decision-pill severity-${decision.severity}`}>
          {reviewLabel(decision)}
        </span>
      </div>
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
          <span>Review score</span>
          <strong>{decision.score.value}/100</strong>
        </div>
        <div>
          <span>Score confidence</span>
          <strong>{decision.score.confidence}</strong>
        </div>
        <div>
          <span>Simulation</span>
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
      <section className={`review-score-panel confidence-${decision.score.confidence}`}>
        <div>
          <span className="eyebrow">Score evidence</span>
          <strong>{decision.score.summary}</strong>
        </div>
        <ul>
          {decision.score.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </section>
      {payload.preview ? (
        <details className="live-request-details">
          <summary>{payload.label}</summary>
          <pre>{payload.preview}</pre>
        </details>
      ) : null}
      <MainnetGuard request={request} />
      <p className="decision-summary">{decision.summary}</p>
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
      {decision.requiresAcknowledgement ? (
        <label className="ack-line">
          <input
            type="checkbox"
            checked={warningAcknowledged}
            onChange={(event) => onWarningAcknowledged(event.target.checked)}
          />
          I reviewed these details and want imToken to make the final signing decision.
        </label>
      ) : null}
      <div className="button-row">
        <button type="button" className="primary-action" onClick={onForward} disabled={!decision.canForward}>
          {decision.severity === "block"
            ? "Cannot relay with IntentProof"
            : coordinationRequest
              ? "Answer DApp request"
              : "Send to imToken for review"}
        </button>
        <button type="button" className="button-secondary" onClick={onReject}>
          Reject request
        </button>
      </div>
    </section>
  );
}
