import type { BatchAiReview } from "../../lib/live/browserAiReview";
import {
  assessLiveRequest,
  formatEvidenceConfidence,
  formatExecutionStatus,
  formatRiskLevel,
} from "../../lib/live/requestAssessment";
import { summarizeLiveRequest } from "../../lib/live/semanticSummary";
import type { LivePolicyDecision, LiveRequest } from "../../lib/live/types";

interface RequestInboxProps {
  requests: LiveRequest[];
  selectedRequestId?: string;
  getDecision: (request: LiveRequest) => LivePolicyDecision;
  onSelect: (requestId: string) => void;
  batchAiState: BatchAiReviewState;
  onRunBatchAiReview: () => void;
}

export interface BatchAiReviewState {
  status: "idle" | "loading" | "ready" | "error";
  progress?: string;
  review?: BatchAiReview;
  error?: string;
}

export function RequestInbox({
  requests,
  selectedRequestId,
  getDecision,
  onSelect,
  batchAiState,
  onRunBatchAiReview,
}: RequestInboxProps) {
  return (
    <section className="surface request-inbox">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Live requests</span>
          <h2>Request Inbox</h2>
        </div>
        <span className="muted">{requests.length} request(s)</span>
      </div>
      <div className="batch-ai-toolbar" aria-label="Batch local AI review">
        <button
          type="button"
          className="button-secondary"
          onClick={onRunBatchAiReview}
          disabled={requests.length === 0 || batchAiState.status === "loading"}
        >
          {batchAiState.status === "loading"
            ? "Reviewing open requests..."
            : "Review all open requests with local AI"}
        </button>
        {batchAiState.progress ? <span>{batchAiState.progress}</span> : null}
      </div>
      {batchAiState.error ? (
        <p className="browser-ai-error">{batchAiState.error}</p>
      ) : null}
      {batchAiState.review ? (
        <div className="batch-ai-summary">
          <strong>{batchAiState.review.overallHeadline}</strong>
          <span>{batchAiState.review.overallSummary}</span>
        </div>
      ) : null}
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
          const assessment = assessLiveRequest({ request, decision });
          const summary = summarizeLiveRequest(request);
          return (
            <button
              key={request.id}
              type="button"
              aria-label={`${assessment.sourceLabel} ${summary.title} Evidence ${assessment.evidenceConfidence} Risk ${assessment.riskLevel} Execution ${assessment.executionStatus}`}
              className={
                request.id === selectedRequestId
                  ? "request-row active"
                  : "request-row"
              }
              onClick={() => onSelect(request.id)}
            >
              <span>{assessment.sourceLabel}</span>
              <strong>{summary.title}</strong>
              <small className="request-reason">{summary.whatItWants}</small>
              <span className="request-row-meta">
                <em className={`assessment-pill evidence-${assessment.evidenceConfidence}`}>
                  Evidence {formatEvidenceConfidence(assessment.evidenceConfidence)}
                </em>
                <em className={`assessment-pill risk-${assessment.riskLevel}`}>
                  Risk {formatRiskLevel(assessment.riskLevel)}
                </em>
                <em className={`assessment-pill execution-${assessment.executionStatus}`}>
                  Execution {formatExecutionStatus(assessment.executionStatus)}
                </em>
                <small>{request.chain.label}</small>
              </span>
              <small className="request-evidence-line">
                {assessment.evidenceReasons[0]} · {assessment.userActionLabel}
              </small>
            </button>
          );
        })}
      </div>
    </section>
  );
}
