import { useMemo, useState } from "react";

import type {
  BatchAiReview,
  BrowserAiModelOption,
  BrowserAiReviewState,
} from "../../lib/live/browserAiReview";
import {
  assessLiveRequest,
  formatExecutionStatus,
  presentWalletRequest,
} from "../../lib/live/requestAssessment";
import { summarizeLiveRequest } from "../../lib/live/semanticSummary";
import type { LivePolicyDecision, LiveReceipt, LiveRequest } from "../../lib/live/types";

interface RequestInboxProps {
  requests: LiveRequest[];
  activity: LiveReceipt[];
  selectedRequestId?: string;
  getDecision: (request: LiveRequest) => LivePolicyDecision;
  onSelect: (requestId: string) => void;
  batchAiState: BatchAiReviewState;
  onRunBatchAiReview: () => void;
  browserAiModels: BrowserAiModelOption[];
  browserAiModelId: string;
  browserAiState: BrowserAiReviewState;
  onBrowserAiModelChange: (modelId: string) => void;
  onRunBrowserAiReview: () => void;
  localAiCacheState: LocalAiCacheState;
  onClearLocalAiCache: () => void;
}

export interface BatchAiReviewState {
  status: "idle" | "loading" | "ready" | "error";
  progress?: string;
  review?: BatchAiReview;
  error?: string;
}

export interface LocalAiCacheState {
  status: "idle" | "clearing" | "ready" | "error";
  message?: string;
}

export function RequestInbox({
  requests,
  activity,
  selectedRequestId,
  getDecision,
  onSelect,
  batchAiState,
  onRunBatchAiReview,
  browserAiModels,
  browserAiModelId,
  browserAiState,
  onBrowserAiModelChange,
  onRunBrowserAiReview,
  localAiCacheState,
  onClearLocalAiCache,
}: RequestInboxProps) {
  const [activeFilter, setActiveFilter] = useState<
    "action" | "routine" | "done" | "all"
  >("action");
  const routineActivity = useMemo(
    () => activity.filter((receipt) => receipt.resolvedLocally),
    [activity],
  );
  const doneActivity = useMemo(
    () => activity.filter((receipt) => !receipt.resolvedLocally),
    [activity],
  );
  const shownRequests = activeFilter === "routine" || activeFilter === "done" ? [] : requests;
  const shownActivity =
    activeFilter === "routine"
      ? routineActivity
      : activeFilter === "done"
        ? doneActivity
        : activeFilter === "all"
          ? activity
          : [];
  const aiReviewByRequestId = new Map(
    batchAiState.review?.requests.map((review) => [review.requestId, review]) ?? [],
  );
  const filteredItemCount = shownRequests.length + shownActivity.length;

  return (
    <section className="surface request-inbox">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Wallet approval queue</span>
          <h2>Request Inbox</h2>
        </div>
        <span className="muted">{requests.length} action required</span>
      </div>
      <div className="request-inbox-tabs" aria-label="Request inbox filters">
        {[
          ["action", `Action required ${requests.length}`],
          ["routine", `Routine answered ${routineActivity.length}`],
          ["done", `Done ${doneActivity.length}`],
          ["all", `All ${requests.length + activity.length}`],
        ].map(([filter, label]) => (
          <button
            key={filter}
            type="button"
            className={activeFilter === filter ? "active" : ""}
            onClick={() => setActiveFilter(filter as typeof activeFilter)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="ai-review-card" aria-label="Local AI review">
        <div className="ai-review-topline">
          <div>
            <span className="eyebrow">Local AI</span>
            <strong>{batchAiState.review?.overallHeadline ?? "Advisory review"}</strong>
            {batchAiState.review?.overallSummary ? (
              <p>{batchAiState.review.overallSummary}</p>
            ) : null}
          </div>
          <label className="ai-model-field">
            <span>Model</span>
            <select
              value={browserAiModelId}
              onChange={(event) => onBrowserAiModelChange(event.target.value)}
              disabled={
                browserAiState.status === "loading" ||
                browserAiState.status === "reviewing"
              }
            >
              {browserAiModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label} · {model.approximateSize}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="ai-review-actions">
          <button
            type="button"
            className="button-secondary"
            onClick={onRunBatchAiReview}
            disabled={
              requests.length === 0 ||
              batchAiState.status === "loading" ||
              localAiCacheState.status === "clearing"
            }
          >
            {batchAiState.status === "loading" ? "Reviewing..." : "Review inbox"}
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={onRunBrowserAiReview}
            disabled={
              !selectedRequestId ||
              browserAiState.status === "loading" ||
              browserAiState.status === "reviewing"
            }
          >
            {browserAiState.status === "loading"
              ? "Loading..."
              : browserAiState.status === "reviewing"
                ? "Reviewing..."
                : "Review selected"}
          </button>
          <button
            type="button"
            className="button-tertiary"
            onClick={onClearLocalAiCache}
            disabled={localAiCacheState.status === "clearing"}
          >
            {localAiCacheState.status === "clearing" ? "Deleting..." : "Delete models"}
          </button>
          {batchAiState.progress ? <span>{batchAiState.progress}</span> : null}
        </div>
        {browserAiState.progress ? (
          <p className="browser-ai-progress">{browserAiState.progress}</p>
        ) : null}
        {browserAiState.error ? (
          <p className="browser-ai-error">{browserAiState.error}</p>
        ) : null}
        {browserAiState.review ? (
          <div className="browser-ai-result">
            <div>
              <span>AI headline</span>
              <strong>{browserAiState.review.headline}</strong>
            </div>
            <p>{browserAiState.review.plainEnglishSummary}</p>
            <dl>
              <div>
                <dt>Intent match</dt>
                <dd>{browserAiState.review.userIntentMatch.replaceAll("_", " ")}</dd>
              </div>
              <div>
                <dt>AI confidence</dt>
                <dd>{browserAiState.review.confidence}</dd>
              </div>
            </dl>
            <div className="browser-ai-columns">
              <div>
                <strong>Main risks</strong>
                <ul>
                  {browserAiState.review.mainRisks.length ? (
                    browserAiState.review.mainRisks.map((risk) => (
                      <li key={risk}>{risk}</li>
                    ))
                  ) : (
                    <li>No additional risks noted by the local model.</li>
                  )}
                </ul>
              </div>
              <div>
                <strong>Ask before signing</strong>
                <ul>
                  {browserAiState.review.questionsToAskBeforeSigning.length ? (
                    browserAiState.review.questionsToAskBeforeSigning.map((question) => (
                      <li key={question}>{question}</li>
                    ))
                  ) : (
                    <li>No extra questions suggested.</li>
                  )}
                </ul>
              </div>
            </div>
            <details>
              <summary>Policy reasoning and scam-pattern hints</summary>
              <p>{browserAiState.review.whyPolicyDecisionMakesSense}</p>
              <ul>
                {browserAiState.review.scamPatternHints.length ? (
                  browserAiState.review.scamPatternHints.map((hint) => (
                    <li key={hint}>{hint}</li>
                  ))
                ) : (
                  <li>No specific pattern hints found.</li>
                )}
              </ul>
            </details>
          </div>
        ) : null}
      </div>
      {localAiCacheState.message ? (
        <p
          className={
            localAiCacheState.status === "error"
              ? "browser-ai-error"
              : "browser-ai-cache-status"
          }
        >
          {localAiCacheState.message}
        </p>
      ) : null}
      {batchAiState.error ? (
        <p className="browser-ai-error">{batchAiState.error}</p>
      ) : null}
      {batchAiState.review ? (
        <div className="batch-ai-summary">
          {batchAiState.review.requests.length ? (
            <ul className="batch-ai-request-list">
              {batchAiState.review.requests.map((requestReview) => (
                <li
                  key={requestReview.requestId}
                  className={`batch-ai-request-item attention-${requestReview.attentionLevel}`}
                >
                  <span>{requestReview.attentionLevel}</span>
                  <strong>{requestReview.headline}</strong>
                  <p>{requestReview.judgement}</p>
                  <small>{requestReview.summary}</small>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className="request-list">
        {filteredItemCount === 0 ? (
          <div className="empty-inbox">
            <strong>
              {activeFilter === "action"
                ? "No action required."
                : "Nothing to show here yet."}
            </strong>
            <span>
              {activeFilter === "action"
                ? "When a connected DApp asks to sign, approve, switch networks, or send a transaction, it appears here."
                : "Handled requests are written to local Activity without storing secrets."}
            </span>
          </div>
        ) : null}
        {shownRequests.map((request) => {
          const decision = getDecision(request);
          const assessment = assessLiveRequest({ request, decision });
          const presentation = presentWalletRequest({ request, decision });
          const summary = summarizeLiveRequest(request);
          const aiReview = aiReviewByRequestId.get(request.id);
          return (
            <button
              key={request.id}
              type="button"
              aria-label={`${assessment.sourceLabel} ${presentation.rowTitle} ${presentation.statusLabel} ${request.chain.label}`}
              className={
                request.id === selectedRequestId
                  ? "request-row active"
                  : "request-row"
              }
              onClick={() => onSelect(request.id)}
            >
              <span className="request-dapp-avatar" aria-hidden="true">
                {assessment.sourceLabel.slice(0, 2).toUpperCase()}
              </span>
              <span className="request-row-main">
                <span className="request-row-source">{assessment.sourceLabel}</span>
                <strong>{presentation.rowTitle}</strong>
                <small className="request-row-impact">{presentation.impactLine}</small>
                {aiReview ? (
                  <small className={`request-row-ai attention-${aiReview.attentionLevel}`}>
                    AI: {aiReview.judgement}
                  </small>
                ) : null}
              </span>
              <span className="request-row-meta">
                <em className={`request-row-status tone-${presentation.statusTone}`}>
                  {presentation.statusLabel}
                </em>
                <em className="chain-badge">
                  {request.chain.environment === "mainnet"
                    ? "Mainnet"
                    : request.chain.label}
                </em>
              </span>
              <small className="request-evidence-line">
                {assessment.evidenceConfidence === "high" ? "Recognized" : "Source not profiled"} ·{" "}
                {formatExecutionStatus(assessment.executionStatus)} ·{" "}
                {summary.chips.slice(0, 2).join(" · ")}
              </small>
            </button>
          );
        })}
        {shownActivity.map((receipt) => (
          <div key={receipt.id} className="request-row activity-row">
            <span className="request-dapp-avatar" aria-hidden="true">
              {receipt.origin.slice(0, 2).toUpperCase()}
            </span>
            <span className="request-row-main">
              <span className="request-row-source">{receipt.origin}</span>
              <strong>{receipt.method}</strong>
              <small className="request-row-impact">
                {receipt.resolvedLocally
                  ? "Answered locally so the DApp could continue."
                  : receipt.rejected
                    ? "Rejected by user or policy."
                    : "Forwarded to the selected signer."}
              </small>
            </span>
            <span className="request-row-meta">
              <em className={`request-row-status ${receipt.rejected ? "tone-danger" : "tone-neutral"}`}>
                {receipt.resolvedLocally
                  ? "Routine answered"
                  : receipt.rejected
                    ? "Rejected"
                    : "Done"}
              </em>
              <em className="chain-badge">{receipt.chainLabel}</em>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
