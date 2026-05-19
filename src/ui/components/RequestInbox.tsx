import type { LivePolicyDecision, LiveRequest } from "../../lib/live/types";
import { describeLiveRequestAction } from "../../lib/live/requestDisplay";

interface RequestInboxProps {
  requests: LiveRequest[];
  selectedRequestId?: string;
  getDecision: (request: LiveRequest) => LivePolicyDecision;
  onSelect: (requestId: string) => void;
}

function evidenceLine(request: LiveRequest) {
  const simulation = request.evidence?.simulation.status ?? "not checked";
  const decode = request.evidence?.decode.status ?? "not checked";
  return `Simulation: ${simulation} · Decode: ${decode}`;
}

function reviewLabel(decision: LivePolicyDecision) {
  if (decision.severity === "block") return "Cannot relay";
  if (decision.severity === "warn") return "Review";
  if (decision.severity === "info") return "Info";
  return "Routine";
}

export function RequestInbox({
  requests,
  selectedRequestId,
  getDecision,
  onSelect,
}: RequestInboxProps) {
  return (
    <section className="surface request-inbox">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Step 2</span>
          <h2>Request Inbox</h2>
        </div>
        <span className="muted">{requests.length} request(s)</span>
      </div>
      <div className="request-list">
        {requests.length === 0 ? (
          <div className="empty-inbox">
            <strong>No live DApp requests yet.</strong>
            <span>
              Once a connected DApp asks to sign or send a transaction, the
              real request will appear here. The network selector sets your
              default review posture; IntentProof reads each request chain from
              WalletConnect.
            </span>
          </div>
        ) : null}
        {requests.map((request) => {
          const decision = getDecision(request);
          const action = describeLiveRequestAction(request);
          return (
            <button
              key={request.id}
              type="button"
              aria-label={`${request.origin} ${action} ${reviewLabel(decision)} ${request.chain.label} evidence score ${decision.score.value} ${decision.score.confidence} confidence`}
              className={
                request.id === selectedRequestId
                  ? "request-row active"
                  : "request-row"
              }
              onClick={() => onSelect(request.id)}
            >
              <span>{request.origin}</span>
              <strong>{action}</strong>
              <span className="request-row-meta">
                <em className={`decision-pill severity-${decision.severity}`}>
                  {reviewLabel(decision)}
                </em>
                <small>{request.chain.label}</small>
              </span>
              <span className="request-score-line">
                <b>{decision.score.value}</b>
                <span>{decision.score.confidence} confidence</span>
              </span>
              <small className="request-reason">
                {decision.score.reasons[0] ?? decision.score.summary}
              </small>
              <small className="request-evidence-line">{evidenceLine(request)}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}
