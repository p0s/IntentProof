import {
  assessLiveRequest,
} from "../../lib/live/requestAssessment";
import { summarizeLiveRequest } from "../../lib/live/semanticSummary";
import type { LivePolicyDecision, LiveRequest } from "../../lib/live/types";
import { buildWalletRequestViewModel } from "../../lib/live/walletRequestViewModel";
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

function assetDeltaLabel(request: LiveRequest, understanding: ReturnType<typeof understandLiveRequest>) {
  if (request.evidence?.simulation.assetChanges.length) {
    return `${request.evidence.simulation.assetChanges.length} parsed change(s)`;
  }
  if (understanding.deterministicImpact?.nativeValueOut) {
    return understanding.simulationAssetDelta?.summary ?? "Asset-change preview unavailable";
  }
  return understanding.simulationAssetDelta?.summary ?? "No parsed asset changes";
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
  const semanticSummary = summarizeLiveRequest(request);
  const understanding = understandLiveRequest(request);
  const viewModel = buildWalletRequestViewModel({
    request,
    decision,
    forwardTargetLabel,
  });

  return (
    <section className="surface live-request-card">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{viewModel.dappLabel}</span>
          <h2>{viewModel.rowTitle}</h2>
        </div>
        <div className="compact-label-row">
          <span className={`request-row-status tone-${viewModel.statusTone}`}>
            {viewModel.statusLabel}
          </span>
          <span className="chain-badge">{viewModel.chainBadge}</span>
          {request.chain.environment === "mainnet" ? (
            <span className="mainnet-compact-badge">Mainnet · real assets</span>
          ) : null}
        </div>
      </div>
      <section className="request-detail-hero">
        <span className="eyebrow">What this request wants</span>
        <strong>{viewModel.whatItWants}</strong>
        <p>{viewModel.impactLine}</p>
        <div className="policy-chip-row">
          {semanticSummary.chips.slice(0, 4).map((chip) => (
            <span key={chip}>{chip}</span>
          ))}
        </div>
      </section>
      <MainnetGuard request={request} />
      <section className="impact-grid" aria-label="What can change">
        {viewModel.whatCanChange.map((item) => (
          <div key={item}>
            <span>What can change</span>
            <strong>{item}</strong>
          </div>
        ))}
        {viewModel.whatCanChange.length === 0 ? (
          <div>
            <span>What can change</span>
            <strong>Review the final wallet prompt before continuing.</strong>
          </div>
        ) : null}
        {request.method.includes("sign") && payload.preview ? (
          <div>
            <span>Signature payload</span>
            <strong>{payload.preview.split("\n")[0]}</strong>
          </div>
        ) : null}
      </section>
      <section className={`intentproof-result tone-${viewModel.statusTone}`}>
        <div>
          <span className="eyebrow">IntentProof result</span>
          <strong>{viewModel.resultTitle}</strong>
          <p>{viewModel.resultBody}</p>
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
            : viewModel.primaryActionLabel}
        </button>
        <button type="button" className="button-secondary" onClick={onReject}>
          {viewModel.secondaryActionLabel}
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
            <strong>
              {understanding.deterministicImpact?.nativeValueOutExact
                ? `${understanding.deterministicImpact.nativeValueOutExact} · ${hexValueLabel(request.tx?.value)}`
                : hexValueLabel(request.tx?.value)}
            </strong>
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
            <strong>{assetDeltaLabel(request, understanding)}</strong>
          </div>
          {viewModel.advancedFacts.map((fact) => (
            <div key={`${fact.label}-${fact.value}`}>
              <span>{fact.label}</span>
              <strong>{fact.value}</strong>
            </div>
          ))}
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
