import { useCallback, useEffect, useRef, useState } from "react";

import { buildFallbackAiSummary, generateAiSummary } from "../lib/ai";
import { buildAnalysisResult } from "../lib/analysis";
import {
  getChainConfig,
  getExplorerTxUrl,
  getMainnetChainConfigs,
} from "../lib/chains";
import {
  NATIVE_TRANSFER_VERIFICATION,
  decodeParsedInput,
  parseRawTransactionInput,
  resolveContractVerification,
} from "../lib/decode";
import { formatDateTime, formatNativeAmount } from "../lib/format";
import { getRuntimeEnv } from "../lib/env";
import {
  canSignIntentProof,
  compileIntentProofPlan,
  createIntentProofReceipt,
  defaultFirewallSettings,
  evaluateIntentProofDecision,
  firewallPresets,
  formatIntentProofReceiptText,
  formatFullAddress,
  formatRouteEndpoint,
  formatShortSigner,
  intentScenarios,
  parseWalletIntentWithAiFallback,
  summarizePlan,
  trustedRecipients,
  type AgentFirewallSettings,
  type IntentProofMode,
  type IntentProofDecision,
  type IntentProofPlan,
  type IntentScenarioId,
} from "../lib/intentproof";
import { InboundWalletConnectWallet } from "../lib/live/inboundWallet";
import { buildWalletCapabilitiesResponse } from "../lib/live/capabilities";
import {
  enrichLiveRequestEvidence,
  pendingLiveRequestEvidence,
} from "../lib/live/liveEvidence";
import { ImTokenWalletConnectSigner } from "../lib/live/imtokenSigner";
import { evaluateLiveRequestPolicy } from "../lib/live/livePolicyBridge";
import { removeLiveRequest, selectNextLiveRequest, upsertLiveRequest } from "../lib/live/liveRequestQueue";
import {
  readWalletConnectUriFromLocation,
  removeWalletConnectUriFromLocation,
  validateWalletConnectUri,
} from "../lib/live/qr";
import { resetLiveWalletConnectSessions } from "../lib/live/sessionReset";
import type {
  LiveConnectorState,
  LiveInboundClient,
  LiveReceipt,
  LiveRequest,
  LiveSignerClient,
} from "../lib/live/types";
import { evaluatePolicies } from "../lib/policy";
import { simulateTransaction } from "../lib/simulate";
import {
  broadcastSignedTransaction,
  signDraftTransaction,
} from "../lib/tokencore";
import type { AnalysisResult, DemoChainKey } from "../lib/types";
import type { Address } from "viem";
import "./App.css";
import { DappConnectionCard } from "./components/DappConnectionCard";
import { LiveRequestCard } from "./components/LiveRequestCard";
import { RequestInbox } from "./components/RequestInbox";
import { useWalletManager } from "./hooks/useWalletManager";
import { ActivityScreen } from "./screens/ActivityScreen";
import { PreviewRequestsScreen } from "./screens/PreviewRequestsScreen";
import { ProtectWalletScreen } from "./screens/ProtectWalletScreen";
import { TestnetSigningScreen } from "./screens/TestnetSigningScreen";
import { DemoDappScreen } from "./screens/DemoDappScreen";

type PipelineState =
  | "idle"
  | "active"
  | "pass"
  | "info"
  | "warn"
  | "danger"
  | "block"
  | "unavailable";

interface ScenarioRunResult {
  label: string;
  severity: IntentProofDecision["severity"];
  signState: IntentProofDecision["signState"];
  summary: string;
}

interface AnalyzeIntentOptions {
  intent?: string;
  scenarioId?: IntentScenarioId;
  mode?: IntentProofMode;
  firewall?: AgentFirewallSettings;
  sourceAddress?: Address;
  statusPrefix?: string;
  syncSelection?: boolean;
}

type ThemeMode = "auto" | "light" | "dark";
type ProductTab = "protect" | "preview" | "testnet" | "activity";
type DappUriSource = "manual" | "route";
type NetworkScope = "sepolia" | "baseSepolia" | "ethereum" | "base";

const networkOptions: Array<{
  value: NetworkScope;
  label: string;
  environment: "testnet" | "mainnet";
}> = [
  { value: "ethereum", label: "Ethereum", environment: "mainnet" },
  { value: "base", label: "Base", environment: "mainnet" },
  { value: "sepolia", label: "Sepolia", environment: "testnet" },
  { value: "baseSepolia", label: "Base Sepolia", environment: "testnet" },
];

function isLocalWalletCoordinationRequest(request: LiveRequest) {
  return (
    request.method === "wallet_switchEthereumChain" ||
    request.method === "wallet_getCapabilities" ||
    request.method === "eth_accounts" ||
    request.method === "eth_chainId"
  );
}

function resolveLocalWalletCoordinationRequest(
  request: LiveRequest,
  account?: LiveConnectorState["account"],
) {
  if (request.method === "wallet_switchEthereumChain") return null;
  if (request.method === "wallet_getCapabilities") {
    return buildWalletCapabilitiesResponse(request);
  }
  if (request.method === "eth_chainId") return request.chain.hexChainId;
  if (request.method === "eth_accounts") {
    return account?.address ? [account.address] : [];
  }
  return undefined;
}

interface AppProps {
  liveClients?: {
    signer?: LiveSignerClient;
    inbound?: LiveInboundClient;
    projectId?: string;
    initialRequests?: LiveRequest[];
  };
}

function stringifyWithBigInt(value: unknown, space = 2) {
  return JSON.stringify(
    value,
    (_key, currentValue) =>
      typeof currentValue === "bigint" ? currentValue.toString() : currentValue,
    space,
  );
}

function severityClass(severity?: string) {
  return severity ? `severity-${severity.toLowerCase()}` : "severity-idle";
}

function readConnectRouteUri() {
  if (typeof window === "undefined") return undefined;
  return readWalletConnectUriFromLocation(window.location.href);
}

function clearConnectRouteUri() {
  if (typeof window === "undefined") return;
  const cleanedUrl = removeWalletConnectUriFromLocation(window.location.href);
  window.history.replaceState(window.history.state, document.title, cleanedUrl);
}

function getAutoTheme(): Exclude<ThemeMode, "auto"> {
  if (typeof window === "undefined") return "light";
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const hour = new Date().getHours();
  return prefersDark || hour < 7 || hour >= 18 ? "dark" : "light";
}

function themeButtonCopy(themeMode: ThemeMode, resolvedTheme: Exclude<ThemeMode, "auto">) {
  if (themeMode === "auto") return `Auto theme (${resolvedTheme})`;
  return `${themeMode === "dark" ? "Dark" : "Light"} theme`;
}

function themeGlyph(themeMode: ThemeMode, resolvedTheme: Exclude<ThemeMode, "auto">) {
  if (themeMode === "auto") return resolvedTheme === "dark" ? "◐" : "◑";
  return themeMode === "dark" ? "☾" : "☀";
}

function nextThemeMode(
  current: ThemeMode,
  resolvedTheme: Exclude<ThemeMode, "auto">,
): ThemeMode {
  if (current === "auto") return resolvedTheme === "dark" ? "light" : "dark";
  return current === "dark" ? "light" : "dark";
}

function decisionUserCopy(decision?: IntentProofDecision) {
  if (!decision) {
    return "Verify the proposed transaction before any signing action is available.";
  }
  if (decision.severity === "pass" || decision.severity === "info") {
    return "Intent matches transaction. Local signer setup is required before signing.";
  }
  if (decision.severity === "warn") {
    return "This may be safe, but one check needs your attention before signing.";
  }
  return "Signing blocked because the transaction does not match your intent.";
}

function requestSourceCopy(plan?: IntentProofPlan, scenarioId?: IntentScenarioId) {
  const id = plan?.scenarioId ?? scenarioId;
  if (id === "unlimited-approval" || id === "swap-policy") {
    return "Deterministic AI swap request with route metadata. No live aggregator is required.";
  }
  if (id === "bridge-mismatch") {
    return "Deterministic dapp route proposal that attempts to move the request to Base Sepolia.";
  }
  if (id === "weth-wrap") {
    return "User wallet intent compiled into the official WETH template.";
  }
  return "User wallet intent compiled into a safe Sepolia ERC-20 transfer template.";
}

function modeLabel(mode: IntentProofMode) {
  return mode === "demo" ? "Example request" : "Token Core Lab";
}

function supportViewTitle(tab: ProductTab) {
  if (tab === "preview") return "Examples";
  if (tab === "testnet") return "Token Core Lab";
  if (tab === "activity") return "Activity";
  return "Protect Wallet";
}

function getSigningReadinessCopy(params: {
  decision?: IntentProofDecision;
  warningAcknowledged: boolean;
  hasLocalSigner: boolean;
  hasSigningPassword: boolean;
}) {
  if (!params.decision) return "Run verification before signing.";
  if (
    params.decision.severity === "block" ||
    params.decision.severity === "danger" ||
    params.decision.signState === "disabled"
  ) {
    return "Signing blocked by IntentProof policy.";
  }
  if (params.decision.signState === "ackRequired" && !params.warningAcknowledged) {
    return "Review and acknowledge warning before signing.";
  }
  if (!params.hasLocalSigner) {
    return "Verification passed. Create a fresh testnet wallet to sign.";
  }
  if (!params.hasSigningPassword) {
    return "Verification passed. Enter the local testnet wallet password.";
  }
  return "Ready to sign with Token Core.";
}

function buildEnglishEvidenceSummary(analysis?: AnalysisResult) {
  if (!analysis) return "Run verification to see the decoded transaction evidence.";
  return analysis.englishSummary;
}

function getPresetDescription(preset: keyof typeof firewallPresets) {
  if (preset === "Beginner Safe") {
    return "Strict default for small trusted-recipient transactions.";
  }
  if (preset === "Agent Limited") {
    return "Allows both testnets while keeping bridges and max approvals blocked.";
  }
  return "Higher caps with explicit first-interaction review.";
}

function buildPolicySummaryChips(firewall: AgentFirewallSettings) {
  const chains =
    firewall.allowedChains.length === 1 && firewall.allowedChains.includes("sepolia")
      ? "Default: Sepolia only"
      : "Default: Sepolia + Base Sepolia";
  return [
    chains,
    firewall.forbidBridge ? "No bridges" : "Bridge review",
    firewall.forbidUnlimitedApprovals
      ? "No unlimited approvals"
      : "Approval review",
    firewall.trustedRecipientsOnly ? "Trusted recipients" : "Recipient review",
    firewall.requireVerifiedContract ? "Verified contracts" : "Verification optional",
    `Spend cap $${firewall.maxSpendUsd}`,
    `Gas cap $${firewall.gasCapUsd}`,
    `Slippage cap ${firewall.maxSlippageBps / 100}%`,
  ];
}

function pipelineStateFromDecision(
  decision?: IntentProofDecision,
): PipelineState {
  if (!decision) return "idle";
  return decision.severity;
}

function buildPipeline(params: {
  plan?: IntentProofPlan;
  analysis?: AnalysisResult;
  decision?: IntentProofDecision;
  running: boolean;
}) {
  const base: Array<{
    label: string;
    detail: string;
    state: PipelineState;
  }> = [
    {
      label: "Parse intent",
      detail: params.plan
        ? `${params.plan.parsedIntent.action} intent, ${params.plan.parsedIntent.assetSymbol ?? "asset"} scope`
        : "Waiting for user intent",
      state: params.plan ? "pass" : params.running ? "active" : "idle",
    },
    {
      label: "Compile candidate transaction",
      detail: params.plan ? summarizePlan(params.plan) : "No candidate yet",
      state: params.plan ? "pass" : params.running ? "active" : "idle",
    },
    {
      label: "Decode calldata with Token Core",
      detail: params.analysis
        ? params.analysis.action.title
        : "Decode method, contract, amount, and addresses",
      state: params.analysis ? "pass" : params.running ? "active" : "idle",
    },
    {
      label: "Check contract verification",
      detail: params.analysis
        ? params.analysis.verification.message
        : "Local presets, Explorer, or Sourcify",
      state: params.analysis
        ? params.analysis.verification.verified
          ? "pass"
          : "warn"
        : "idle",
    },
    {
      label: "Simulate / preview asset changes",
      detail: params.analysis
        ? params.analysis.simulation.summary
        : "Tenderly/RPC with heuristic fallback",
      state: params.analysis
        ? params.analysis.simulation.success
          ? "pass"
          : "info"
        : "unavailable",
    },
    {
      label: "Apply default risk policy",
      detail: params.analysis
        ? params.analysis.policyViolations.length > 0
          ? `${params.analysis.policyViolations.length} default policy issue(s)`
          : "Default policy passed"
        : "Awaiting decode",
      state: params.analysis
        ? params.analysis.policyViolations.some((item) => item.level === "high")
          ? "block"
          : params.analysis.policyViolations.length > 0
            ? "warn"
            : "pass"
        : "idle",
    },
    {
      label: "Apply intent and agent policy",
      detail: params.decision?.summary ?? "Awaiting policy merge",
      state: pipelineStateFromDecision(params.decision),
    },
    {
      label: "Final IntentProof decision",
      detail: params.decision
        ? `${params.decision.label}: ${params.decision.signState}`
        : "Signing locked",
      state: pipelineStateFromDecision(params.decision),
    },
  ];

  return base;
}

function App({ liveClients }: AppProps = {}) {
  const walletConnectProjectId =
    liveClients?.projectId ?? getRuntimeEnv("VITE_WALLETCONNECT_PROJECT_ID") ?? "";
  const walletConnectConfigured = walletConnectProjectId.trim().length > 0;
  const [initialDappRoute] = useState(() => {
    const uri = readConnectRouteUri()?.trim() ?? "";
    const hasUri = uri.length > 0;
    const validation = validateWalletConnectUri(uri);
    const valid = hasUri && validation.ok;
    return {
      hasUri,
      uri: valid && validation.uri ? validation.uri : "",
      valid,
    };
  });
  const [initialPath] = useState(() =>
    typeof window === "undefined" ? "/" : window.location.pathname,
  );
  const [activeProductTab, setActiveProductTab] =
    useState<ProductTab>("protect");
  const [appMode, setAppMode] = useState<IntentProofMode>("demo");
  const [themeMode, setThemeMode] = useState<ThemeMode>("auto");
  const [autoTheme, setAutoTheme] =
    useState<Exclude<ThemeMode, "auto">>(() => getAutoTheme());
  const [selectedNetworkScope, setSelectedNetworkScope] =
    useState<NetworkScope>("ethereum");
  const [selectedChainKey, setSelectedChainKey] =
    useState<DemoChainKey>("sepolia");
  const [selectedScenarioId, setSelectedScenarioId] = useState<
    IntentScenarioId | undefined
  >("safe-transfer");
  const [intentText, setIntentText] = useState(intentScenarios[0]!.intent);
  const [firewall, setFirewall] = useState<AgentFirewallSettings>(
    defaultFirewallSettings,
  );
  const [plan, setPlan] = useState<IntentProofPlan>();
  const [analysis, setAnalysis] = useState<AnalysisResult>();
  const [decision, setDecision] = useState<IntentProofDecision>();
  const [analysisStatus, setAnalysisStatus] = useState("Ready for intent.");
  const [aiStatus, setAiStatus] = useState(
    "Local deterministic parser is active. Remote AI is off.",
  );
  const [remoteAiEnabled, setRemoteAiEnabled] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [warningAcknowledged, setWarningAcknowledged] = useState(false);
  const [tokenCoreSignPassword, setTokenCoreSignPassword] = useState("");
  const [tokenCoreSignedRaw, setTokenCoreSignedRaw] = useState("");
  const [tokenCoreSignedHash, setTokenCoreSignedHash] = useState("");
  const [sendStatus, setSendStatus] = useState("No signing receipt yet.");
  const [sentHash, setSentHash] = useState("");
  const [externalWalletModalOpen, setExternalWalletModalOpen] = useState(false);
  const [testnetSigningOpen, setTestnetSigningOpen] = useState(false);
  const [scenarioRunResults, setScenarioRunResults] = useState<
    Partial<Record<IntentScenarioId, ScenarioRunResult>>
  >({});
  const [isRunningDemoChecks, setIsRunningDemoChecks] = useState(false);
  const [dappPairingUri, setDappPairingUri] = useState(
    initialDappRoute.uri,
  );
  const [dappUriSource, setDappUriSource] = useState<DappUriSource>(
    initialDappRoute.hasUri ? "route" : "manual",
  );
  const [imTokenState, setImTokenState] = useState<LiveConnectorState>({
    status: walletConnectConfigured ? "idle" : "setup-required",
    label: walletConnectConfigured
      ? "Ready to connect imToken"
      : "WalletConnect setup required",
    detail: walletConnectConfigured
      ? "Connect imToken through WalletConnect for final signing."
      : "Add VITE_WALLETCONNECT_PROJECT_ID to enable live imToken pairing.",
  });
  const [dappState, setDappState] = useState<LiveConnectorState>({
    status: initialDappRoute.valid
      ? walletConnectConfigured
        ? "idle"
        : "setup-required"
      : initialDappRoute.hasUri
        ? "error"
        : walletConnectConfigured
          ? "idle"
          : "setup-required",
    label: initialDappRoute.valid
      ? walletConnectConfigured
        ? "DApp route ready"
        : "WalletConnect setup required"
      : initialDappRoute.hasUri
        ? "Invalid DApp route"
        : walletConnectConfigured
          ? "Ready for DApp route"
          : "WalletConnect setup required",
    detail: initialDappRoute.valid
      ? walletConnectConfigured
        ? "IntentProof captured the DApp request from the URL. Connect imToken to start pairing."
        : "Add VITE_WALLETCONNECT_PROJECT_ID to use routed DApp pairing."
      : initialDappRoute.hasUri
        ? "The routed URL did not contain a valid WalletConnect URI."
        : walletConnectConfigured
          ? "Add a WalletConnect connection to begin."
          : "Examples and the Token Core Lab still work without WalletConnect.",
  });
  const [liveRequests, setLiveRequests] = useState<LiveRequest[]>(
    () => liveClients?.initialRequests ?? [],
  );
  const [selectedLiveRequestId, setSelectedLiveRequestId] = useState<
    string | undefined
  >(liveClients?.initialRequests?.[0]?.id);
  const [liveWarningAcknowledged, setLiveWarningAcknowledged] = useState(false);
  const [liveActionStatus, setLiveActionStatus] = useState(
    initialDappRoute.valid
      ? walletConnectConfigured
        ? "DApp route received. Connect imToken to continue."
        : "DApp route received, but WalletConnect setup is missing."
      : initialDappRoute.hasUri
        ? "DApp route rejected because the WalletConnect URI was invalid."
        : "Request Inbox is ready.",
  );
  const [liveActivity, setLiveActivity] = useState<LiveReceipt[]>([]);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const liveSignerRef = useRef<LiveSignerClient | undefined>(liveClients?.signer);
  const liveInboundRef = useRef<LiveInboundClient | undefined>(liveClients?.inbound);
  const autoVerifyStarted = useRef(false);
  const routedDappPairingStarted = useRef(false);
  const imTokenRestoreStarted = useRef(false);
  const inboundRestoreStarted = useRef(false);

  const walletManager = useWalletManager(() => selectedChainKey);
  const mainnetReadyChains = getMainnetChainConfigs();
  const {
    tokenCoreWallets,
    activeTokenCoreWalletId,
    activeTokenCoreWallet,
    tokenCoreName,
    setTokenCoreName,
    tokenCorePassword,
    setTokenCorePassword,
    tokenCoreStatus,
    selectTokenCoreWallet,
    handleDeleteTokenCoreWallet,
    handleClearTokenCoreWallets,
    handleCreateTokenCoreWallet,
  } = walletManager;

  const verificationAllowsSigning = canSignIntentProof(
    decision,
    warningAcknowledged,
  );
  const hasLocalSigner = Boolean(activeTokenCoreWallet);
  const hasSigningPassword = tokenCoreSignPassword.trim().length > 0;
  const localSigningReady =
    verificationAllowsSigning && hasLocalSigner && hasSigningPassword;
  const signingReadinessCopy = getSigningReadinessCopy({
    decision,
    warningAcknowledged,
    hasLocalSigner,
    hasSigningPassword,
  });
  const selectedScenario = intentScenarios.find(
    (scenario) => scenario.id === selectedScenarioId,
  );
  const pipeline = buildPipeline({
    plan,
    analysis,
    decision,
    running: isAnalyzing,
  });

  const policyCount = plan?.policyDocument.policies.filter(
    (policy) => policy.enabled !== false,
  ).length;
  const receipt =
    plan && decision
      ? createIntentProofReceipt({
          plan,
          decision,
          analysis,
          signedRaw: tokenCoreSignedRaw,
          predictedTxHash: tokenCoreSignedHash,
          broadcastTxHash: sentHash,
        })
      : undefined;
  const receiptText = receipt
    ? formatIntentProofReceiptText(receipt)
    : "No receipt yet.";
  const currentChainLabel = plan
    ? getChainConfig(plan.preparedTx.chainKey).label
    : getChainConfig(selectedChainKey).label;
  const heroAction =
    analysis?.action.functionName ?? plan?.parsedIntent.action ?? "intent";
  const shortSigner = formatShortSigner(activeTokenCoreWallet?.address);
  const completedDemoChecks = Object.keys(scenarioRunResults).length;
  const visibleDecisionCopy = decisionUserCopy(decision);
  const policySummaryChips = buildPolicySummaryChips(firewall);
  const englishEvidenceSummary = buildEnglishEvidenceSummary(analysis);
  const selectedLiveRequest = selectNextLiveRequest(
    liveRequests,
    selectedLiveRequestId,
  );
  const liveDecision = selectedLiveRequest
    ? evaluateLiveRequestPolicy({
        request: selectedLiveRequest,
        firewall,
        warningAcknowledged: liveWarningAcknowledged,
      })
    : undefined;
  const WorkspaceScreen =
    activeProductTab === "preview" ? PreviewRequestsScreen : TestnetSigningScreen;

  function openExamples() {
    setAppMode("demo");
    setActiveProductTab("preview");
    setWarningAcknowledged(false);
  }

  function openTokenCoreLab() {
    setAppMode("testnet");
    setActiveProductTab("testnet");
    setWarningAcknowledged(false);
  }
  const resolvedTheme = themeMode === "auto" ? autoTheme : themeMode;
  const signerButtonLabel = imTokenState.account
    ? formatShortSigner(imTokenState.account.address)
    : imTokenState.status === "pairing"
      ? "Pairing..."
      : "Connect imToken";

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    if (themeMode !== "auto") return;
    const update = () => setAutoTheme(getAutoTheme());
    update();
    const interval = window.setInterval(update, 60_000);
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    media?.addEventListener?.("change", update);
    return () => {
      window.clearInterval(interval);
      media?.removeEventListener?.("change", update);
    };
  }, [themeMode]);

  useEffect(() => {
    clearConnectRouteUri();
  }, []);

  function updateFirewall<K extends keyof AgentFirewallSettings>(
    key: K,
    value: AgentFirewallSettings[K],
  ) {
    setFirewall((previous) => ({ ...previous, [key]: value }));
    setWarningAcknowledged(false);
  }

  function applyFirewallPreset(preset: keyof typeof firewallPresets) {
    setFirewall(firewallPresets[preset]);
    setWarningAcknowledged(false);
  }

  function handleManualPairingUriChange(uri: string) {
    routedDappPairingStarted.current = false;
    setDappUriSource("manual");
    setDappPairingUri(uri);
  }

  const handleIncomingLiveRequest = useCallback((request: LiveRequest) => {
    const queuedRequest = {
      ...request,
      evidence: request.evidence ?? pendingLiveRequestEvidence(),
    };
    setLiveRequests((previous) => upsertLiveRequest(previous, queuedRequest));
    setSelectedLiveRequestId(request.id);
    setActiveProductTab("protect");
    void enrichLiveRequestEvidence(request)
      .then((enrichedRequest) => {
        setLiveRequests((previous) => upsertLiveRequest(previous, enrichedRequest));
      })
      .catch(() => {
        setLiveRequests((previous) =>
          upsertLiveRequest(previous, {
            ...queuedRequest,
            evidence: {
              ...queuedRequest.evidence,
              updatedAt: new Date().toISOString(),
              simulation: {
                status: "unavailable",
                provider: "none",
                summary: "Simulation evidence could not be collected.",
                assetChanges: [],
              },
            },
          }),
        );
      });
  }, []);

  async function switchConnectedNetwork(scope: NetworkScope, source: "user" | "dapp") {
    const chain = getChainConfig(scope);
    const signer = liveSignerRef.current;
    if (!imTokenState.account || !signer?.switchChain) {
      setLiveActionStatus(
        `Network set to ${chain.label}. Connect imToken to switch the wallet network.`,
      );
      return;
    }
    try {
      setLiveActionStatus(`Requesting ${chain.label} network switch in imToken...`);
      const result = await signer.switchChain(scope);
      setImTokenState(result.state);
      const account = result.state.account ?? imTokenState.account;
      await liveInboundRef.current?.updateActiveChain?.(account, scope);
      setLiveActionStatus(
        source === "dapp"
          ? `${chain.label} switch approved. Connected DApps were notified.`
          : `${chain.label} selected in imToken. Connected DApps were notified.`,
      );
    } catch (error) {
      setLiveActionStatus(
        error instanceof Error
          ? error.message
          : `Switching imToken to ${chain.label} failed.`,
      );
    }
  }

  async function handleNetworkScopeChange(scope: NetworkScope) {
    setSelectedNetworkScope(scope);
    if (scope === "sepolia" || scope === "baseSepolia") setSelectedChainKey(scope);
    setLiveWarningAcknowledged(false);
    await switchConnectedNetwork(scope, "user");
  }

  function toggleAllowedChain(chainKey: DemoChainKey) {
    setFirewall((previous) => {
      const exists = previous.allowedChains.includes(chainKey);
      const next = exists
        ? previous.allowedChains.filter((item) => item !== chainKey)
        : [...previous.allowedChains, chainKey];
      return {
        ...previous,
        allowedChains: next.length > 0 ? next : previous.allowedChains,
      };
    });
    setWarningAcknowledged(false);
  }

  function selectScenario(id: IntentScenarioId) {
    const scenario = intentScenarios.find((item) => item.id === id);
    if (!scenario) return;
    setSelectedScenarioId(id);
    setIntentText(scenario.intent);
    setPlan(undefined);
    setAnalysis(undefined);
    setDecision(undefined);
    setWarningAcknowledged(false);
    setTokenCoreSignedRaw("");
    setTokenCoreSignedHash("");
    setSentHash("");
    setAnalysisStatus(`Loaded example request: ${scenario.label}.`);
  }

  const handleAnalyzeIntent = useCallback(async (options?: AnalyzeIntentOptions) => {
    const nextIntentText = options?.intent ?? intentText;
    const nextScenarioId = options?.scenarioId ?? selectedScenarioId;
    const nextMode = options?.mode ?? appMode;
    const nextFirewall = options?.firewall ?? firewall;
    const nextSourceAddress = options?.sourceAddress ?? activeTokenCoreWallet?.address;

    if (options?.syncSelection) {
      setIntentText(nextIntentText);
      setSelectedScenarioId(nextScenarioId);
    }

    setIsAnalyzing(true);
    setWarningAcknowledged(false);
    setTokenCoreSignedRaw("");
    setTokenCoreSignedHash("");
    setSentHash("");
    setSendStatus("No signing receipt yet.");
    setAnalysisStatus(
      options?.statusPrefix ?? "Compiling intent into a Token Core transaction...",
    );
    setAiStatus(
      remoteAiEnabled
        ? "Remote AI is enabled for this session."
        : "Local deterministic parser is active. Remote AI is off.",
    );

    try {
      const parsedIntentResult = await parseWalletIntentWithAiFallback(
        nextIntentText,
        { remote: remoteAiEnabled },
      );
      setAiStatus(
        parsedIntentResult.source === "local"
          ? remoteAiEnabled
            ? "Remote AI did not change the deterministic parse."
            : "Local deterministic parser is active. Remote AI is off."
          : `Intent parser used ${parsedIntentResult.source}.`,
      );
      const compiledPlan = compileIntentProofPlan({
        intent: nextIntentText,
        scenarioId: nextScenarioId,
        mode: nextMode,
        firewall: nextFirewall,
        sourceAddress: nextSourceAddress,
        parsedIntent: parsedIntentResult.intent,
        parserSource: parsedIntentResult.source,
      });
      setPlan(compiledPlan);
      setSelectedChainKey(compiledPlan.preparedTx.chainKey);

      const parsed = await parseRawTransactionInput(compiledPlan.preparedTx.rawInput);
      const isNativeTransfer = !parsed.data || parsed.data === "0x";
      const verification = isNativeTransfer
        ? NATIVE_TRANSFER_VERIFICATION
        : await resolveContractVerification(compiledPlan.preparedTx.chainKey, parsed.to);
      const action = await decodeParsedInput(
        compiledPlan.preparedTx.chainKey,
        parsed,
        verification,
      );
      const simulation = await simulateTransaction(
        compiledPlan.preparedTx.chainKey,
        parsed,
        action,
      );
      const policyViolations = evaluatePolicies({
        document: compiledPlan.policyDocument,
        chainKey: compiledPlan.preparedTx.chainKey,
        parsed,
        action,
        verification,
        simulation,
      }).violations;
      const nextAnalysis = buildAnalysisResult({
        chainKey: compiledPlan.preparedTx.chainKey,
        chainLabel: getChainConfig(compiledPlan.preparedTx.chainKey).label,
        action,
        verification,
        simulation,
        policyViolations,
      });
      const nextDecision = evaluateIntentProofDecision({
        plan: compiledPlan,
        analysis: nextAnalysis,
      });

      setAnalysis(nextAnalysis);
      setDecision(nextDecision);
      if (compiledPlan.scenarioId) {
        setScenarioRunResults((previous) => ({
          ...previous,
          [compiledPlan.scenarioId!]: {
            label: nextDecision.label,
            severity: nextDecision.severity,
            signState: nextDecision.signState,
            summary: nextDecision.summary,
          },
        }));
      }
      setAnalysisStatus("Token Core decode, simulation, and policy checks completed.");

      try {
        const aiResult = await generateAiSummary(nextAnalysis, {
          remote: remoteAiEnabled,
        });
        if (aiResult) {
          setAnalysis((previous) =>
            previous
              ? {
                  ...previous,
                  aiSummary: aiResult.text,
                  aiProvider: aiResult.provider,
                }
              : previous,
          );
          setAiStatus(`AI explanation generated with ${aiResult.provider}.`);
        } else {
          const fallback = buildFallbackAiSummary(nextAnalysis);
          setAnalysis((previous) =>
            previous ? { ...previous, aiSummary: fallback } : previous,
          );
          setAiStatus(
            remoteAiEnabled
              ? "Remote AI unavailable; local explanation is shown."
              : "Remote AI is off; local explanation is shown.",
          );
        }
      } catch (error) {
        const fallback = buildFallbackAiSummary(nextAnalysis);
        setAnalysis((previous) =>
          previous ? { ...previous, aiSummary: fallback } : previous,
        );
        setAiStatus(
          !remoteAiEnabled
            ? "Remote AI is off; local explanation is shown."
            : error instanceof Error
            ? `AI explanation fell back locally: ${error.message}`
            : "AI explanation fell back locally.",
        );
      }
      return {
        plan: compiledPlan,
        analysis: nextAnalysis,
        decision: nextDecision,
      };
    } catch (error) {
      setAnalysis(undefined);
      setDecision(undefined);
      setAnalysisStatus(
        error instanceof Error ? error.message : "Intent analysis failed.",
      );
      return undefined;
    } finally {
      setIsAnalyzing(false);
    }

  }, [
    activeTokenCoreWallet?.address,
    appMode,
    firewall,
    intentText,
    remoteAiEnabled,
    selectedScenarioId,
  ]);

  useEffect(() => {
    if (autoVerifyStarted.current) return;
    autoVerifyStarted.current = true;
    void handleAnalyzeIntent({
      intent: intentScenarios[0]!.intent,
      scenarioId: intentScenarios[0]!.id,
      mode: "demo",
      statusPrefix: "Opening Examples with the safe transfer already verified...",
      syncSelection: true,
    });
  }, [handleAnalyzeIntent]);

  async function handleRunAllChecks() {
    setIsRunningDemoChecks(true);
    setScenarioRunResults({});
    try {
      for (const scenario of intentScenarios) {
        await handleAnalyzeIntent({
          intent: scenario.intent,
          scenarioId: scenario.id,
          mode: appMode,
          statusPrefix: `Running example request check: ${scenario.label}.`,
          syncSelection: true,
        });
      }
      setAnalysisStatus("Example checks completed for all five requests.");
    } finally {
      setIsRunningDemoChecks(false);
    }
  }

  async function handleNextScenario() {
    const currentIndex = Math.max(
      0,
      intentScenarios.findIndex((scenario) => scenario.id === selectedScenarioId),
    );
    const nextScenario =
      intentScenarios[(currentIndex + 1) % intentScenarios.length] ??
      intentScenarios[0]!;
    await handleAnalyzeIntent({
      intent: nextScenario.intent,
      scenarioId: nextScenario.id,
      mode: appMode,
      statusPrefix: `Verifying next request: ${nextScenario.label}.`,
      syncSelection: true,
    });
  }

  function handleResetDemo() {
    const firstScenario = intentScenarios[0]!;
    setScenarioRunResults({});
    setTokenCoreSignedRaw("");
    setTokenCoreSignedHash("");
    setSentHash("");
    void handleAnalyzeIntent({
      intent: firstScenario.intent,
      scenarioId: firstScenario.id,
      mode: "demo",
      statusPrefix: "Examples reset. Verifying the safe transfer again.",
      syncSelection: true,
    });
  }

  async function handleConnectImToken() {
    if (!walletConnectConfigured) {
      setImTokenState({
        status: "setup-required",
        label: "WalletConnect setup required",
        detail: "Set VITE_WALLETCONNECT_PROJECT_ID to connect imToken.",
      });
      return;
    }
    setImTokenState({
      status: "pairing",
      label: "Pairing imToken",
      detail: "Approve the WalletConnect pairing in imToken.",
    });
    try {
      const signer =
        liveSignerRef.current ??
        new ImTokenWalletConnectSigner(walletConnectProjectId);
      liveSignerRef.current = signer;
      const result = await signer.connectImToken();
      setImTokenState(result.state);
      setLiveActionStatus(result.state.detail);
    } catch (error) {
      setImTokenState({
        status: "error",
        label: "imToken connection failed",
        detail:
          error instanceof Error
            ? error.message
            : "WalletConnect imToken pairing failed.",
      });
    }
  }

  async function handleResetLiveSessions() {
    try {
      await liveSignerRef.current?.disconnect?.();
    } catch {
      // A reset should still clear local WalletConnect state if disconnect fails.
    }
    await resetLiveWalletConnectSessions();
    liveSignerRef.current = undefined;
    liveInboundRef.current = undefined;
    imTokenRestoreStarted.current = false;
    inboundRestoreStarted.current = false;
    routedDappPairingStarted.current = false;
    setImTokenState({
      status: "idle",
      label: "Ready to connect imToken",
      detail: "Connect imToken through WalletConnect for final signing.",
    });
    setDappState({
      status: "idle",
      label: "Ready for DApp route",
      detail: "Reconnect imToken, then add a DApp connection.",
    });
    setDappPairingUri("");
    setDappUriSource("manual");
    setLiveRequests([]);
    setSelectedLiveRequestId(undefined);
    setLiveWarningAcknowledged(false);
    setLiveActionStatus("Live WalletConnect sessions reset. Reconnect imToken, then reconnect the DApp.");
  }

  async function handleDisconnectAccount() {
    setAccountMenuOpen(false);
    await handleResetLiveSessions();
    setLiveActionStatus("imToken disconnected. Connect again before forwarding DApp requests.");
  }

  useEffect(() => {
    if (!walletConnectConfigured || imTokenRestoreStarted.current) return;
    imTokenRestoreStarted.current = true;

    const signer =
      liveSignerRef.current ??
      new ImTokenWalletConnectSigner(walletConnectProjectId);
    liveSignerRef.current = signer;
    if (!signer.restoreSession) return;

    void signer
      .restoreSession()
      .then((result) => {
        if (!result.ok || !result.state.account) return;
        setImTokenState(result.state);
        setLiveActionStatus(result.state.detail);
      })
      .catch(() => {
        // Silent restore keeps first-load UX unchanged when no WalletConnect
        // session exists or the provider cannot restore without user action.
      });
  }, [walletConnectConfigured, walletConnectProjectId]);

  const handleConnectDapp = useCallback(async (pairingUriOverride?: string) => {
    const pairingUri = (pairingUriOverride ?? dappPairingUri).trim();
    if (!walletConnectConfigured) {
      setDappState({
        status: "setup-required",
        label: "WalletConnect setup required",
        detail: "Set VITE_WALLETCONNECT_PROJECT_ID to accept DApp sessions.",
      });
      return;
    }
    if (!imTokenState.account) {
      setDappState({
        status: "error",
        label: "Connect imToken first",
        detail: "IntentProof needs an imToken account before approving a DApp session.",
      });
      return;
    }
    if (!pairingUri) {
      setDappState({
        status: "error",
        label: "DApp route missing",
        detail: "Add a WalletConnect connection first.",
      });
      return;
    }
    const pairingValidation = validateWalletConnectUri(pairingUri);
    if (!pairingValidation.ok || !pairingValidation.uri) {
      setDappState({
        status: "error",
        label: "Invalid DApp route",
        detail:
          pairingValidation.error ??
          "The DApp route must include a valid WalletConnect URI.",
      });
      return;
    }
    setDappPairingUri("");
    setDappUriSource("manual");
    setDappState({
      status: "pairing",
      label: "Pairing DApp",
      detail:
        dappUriSource === "route"
          ? "Using the routed WalletConnect request from the DApp."
          : "Waiting for WalletConnect session proposal.",
      account: imTokenState.account,
    });
    try {
      const inbound =
        liveInboundRef.current ??
        new InboundWalletConnectWallet(walletConnectProjectId, handleIncomingLiveRequest, (state) => {
          setDappState(state);
          setLiveActionStatus(state.detail);
        });
      liveInboundRef.current = inbound;
      const result = await inbound.connectDapp(pairingValidation.uri, imTokenState.account);
      setDappState(result.state);
      setLiveActionStatus(result.state.detail);
    } catch (error) {
      setDappState({
        status: "error",
        label: "DApp connection failed",
        detail:
          error instanceof Error
            ? error.message
            : "WalletConnect DApp pairing failed.",
      });
    }
  }, [
    dappPairingUri,
    dappUriSource,
    imTokenState.account,
    walletConnectConfigured,
    walletConnectProjectId,
    handleIncomingLiveRequest,
  ]);

  useEffect(() => {
    if (
      dappUriSource !== "route" ||
      routedDappPairingStarted.current ||
      !dappPairingUri.trim() ||
      !imTokenState.account ||
      !walletConnectConfigured
    ) {
      return;
    }
    routedDappPairingStarted.current = true;
    void handleConnectDapp(dappPairingUri);
  }, [
    dappPairingUri,
    dappUriSource,
    handleConnectDapp,
    imTokenState.account,
    walletConnectConfigured,
  ]);

  useEffect(() => {
    if (
      !walletConnectConfigured ||
      inboundRestoreStarted.current ||
      dappUriSource === "route" ||
      !imTokenState.account
    ) {
      return;
    }
    inboundRestoreStarted.current = true;

    const inbound =
      liveInboundRef.current ??
      new InboundWalletConnectWallet(walletConnectProjectId, handleIncomingLiveRequest, (state) => {
        setDappState(state);
        setLiveActionStatus(state.detail);
      });
    liveInboundRef.current = inbound;
    if (!inbound.restoreSession) return;

    void inbound
      .restoreSession(imTokenState.account)
      .then((result) => {
        if (!result.ok) return;
        setDappState(result.state);
        setLiveActionStatus(result.state.detail);
      })
      .catch(() => {
        // Silent restore keeps first-load UX unchanged when no DApp session
        // exists. Manual QR/URI pairing remains available.
      });
  }, [
    dappUriSource,
    imTokenState.account,
    walletConnectConfigured,
    walletConnectProjectId,
    handleIncomingLiveRequest,
  ]);

  async function handleForwardLiveRequest() {
    if (!selectedLiveRequest || !liveDecision?.canForward) return;
    if (isLocalWalletCoordinationRequest(selectedLiveRequest)) {
      if (selectedLiveRequest.method === "wallet_switchEthereumChain") {
        await switchConnectedNetwork(selectedLiveRequest.chain.chainKey, "dapp");
      }
      const result = resolveLocalWalletCoordinationRequest(
        selectedLiveRequest,
        imTokenState.account,
      );
      try {
        await liveInboundRef.current?.approveRequest(selectedLiveRequest, result);
        setLiveActivity((previous) => [
          {
            id: `receipt-${selectedLiveRequest.id}-${Date.now()}`,
            requestId: selectedLiveRequest.id,
            timestamp: new Date().toISOString(),
            origin: selectedLiveRequest.origin,
            method: selectedLiveRequest.method,
            chainLabel: selectedLiveRequest.chain.label,
            decision: liveDecision.label,
            forwarded: false,
            rejected: false,
            resolvedLocally: true,
            resultPreview:
              typeof result === "string" ? result : stringifyWithBigInt(result, 0),
          },
          ...previous,
        ]);
        setLiveRequests((previous) => removeLiveRequest(previous, selectedLiveRequest.id));
        setLiveActionStatus(
          "Wallet coordination request approved. The DApp can continue to the transaction request.",
        );
      } catch (error) {
        setLiveActionStatus(
          error instanceof Error
            ? error.message
            : "Approving the WalletConnect request failed.",
        );
      }
      return;
    }
    const signer = liveSignerRef.current;
    if (!signer) {
      setLiveActionStatus("Connect imToken before forwarding a request.");
      return;
    }
    try {
      const result = await signer.forward(selectedLiveRequest);
      await liveInboundRef.current?.approveRequest(selectedLiveRequest, result);
      setLiveActivity((previous) => [
        {
          id: `receipt-${selectedLiveRequest.id}-${Date.now()}`,
          requestId: selectedLiveRequest.id,
          timestamp: new Date().toISOString(),
          origin: selectedLiveRequest.origin,
          method: selectedLiveRequest.method,
          chainLabel: selectedLiveRequest.chain.label,
          decision: liveDecision.label,
          forwarded: true,
          rejected: false,
          resultPreview:
            typeof result === "string" ? result : stringifyWithBigInt(result, 0),
        },
        ...previous,
      ]);
      setLiveRequests((previous) => removeLiveRequest(previous, selectedLiveRequest.id));
      setLiveActionStatus("Request forwarded to imToken exactly once.");
    } catch (error) {
      setLiveActionStatus(
        error instanceof Error ? error.message : "Forwarding to imToken failed.",
      );
    }
  }

  async function handleRejectLiveRequest() {
    if (!selectedLiveRequest || !liveDecision) return;
    let rejectWarning: string | undefined;
    try {
      await liveInboundRef.current?.rejectRequest(selectedLiveRequest, liveDecision.summary);
    } catch (error) {
      rejectWarning =
        error instanceof Error
          ? error.message
          : "WalletConnect reported a rejection transport error.";
    }
    setLiveActivity((previous) => [
      {
        id: `receipt-${selectedLiveRequest.id}-${Date.now()}`,
        requestId: selectedLiveRequest.id,
        timestamp: new Date().toISOString(),
        origin: selectedLiveRequest.origin,
        method: selectedLiveRequest.method,
        chainLabel: selectedLiveRequest.chain.label,
        decision: liveDecision.label,
        forwarded: false,
        rejected: true,
      },
      ...previous,
    ]);
    setLiveRequests((previous) => removeLiveRequest(previous, selectedLiveRequest.id));
    setLiveActionStatus(
      rejectWarning
        ? `Request rejected locally; WalletConnect reported: ${rejectWarning}`
        : "Request rejected and not forwarded.",
    );
  }

  async function handleTokenCoreSign() {
    try {
      if (!plan || !decision) {
        throw new Error("Analyze an intent before signing.");
      }
      if (!localSigningReady) {
        throw new Error(signingReadinessCopy);
      }
      if (!activeTokenCoreWallet) {
        throw new Error("Create a fresh local Token Core testnet wallet first.");
      }
      if (!tokenCoreSignPassword.trim()) {
        throw new Error("Enter the local Token Core wallet password.");
      }

      const result = await signDraftTransaction(
        activeTokenCoreWallet,
        tokenCoreSignPassword,
        plan.preparedTx.chainKey,
        {
          ...plan.preparedTx.request,
          account: activeTokenCoreWallet.address,
        },
      );

      setTokenCoreSignedRaw(result.rawTransaction);
      setTokenCoreSignedHash(result.txHash);
      setSendStatus("Token Core signed locally. Broadcast remains optional.");
    } catch (error) {
      setSendStatus(
        error instanceof Error ? error.message : "Token Core signing failed.",
      );
    }
  }

  async function handleTokenCoreBroadcast() {
    try {
      if (!plan || !tokenCoreSignedRaw) {
        throw new Error("Sign locally before broadcasting.");
      }
      if (!verificationAllowsSigning) {
        throw new Error("IntentProof has not unlocked broadcast for this plan.");
      }

      const result = await broadcastSignedTransaction(
        plan.preparedTx.chainKey,
        tokenCoreSignedRaw as `0x${string}`,
      );
      setSentHash(result.hash);
      setSendStatus(`Broadcast confirmed: ${result.hash}`);
    } catch (error) {
      setSendStatus(
        error instanceof Error ? error.message : "Broadcast failed.",
      );
    }
  }

  async function handleCopyReceipt() {
    try {
      await navigator.clipboard.writeText(receiptText);
      setSendStatus("Receipt copied locally.");
    } catch {
      setSendStatus("Receipt is ready; clipboard access is unavailable.");
    }
  }

  function handleDownloadReceipt() {
    const blob = new Blob([receiptText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "intentproof-receipt.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (initialPath === "/demo-dapp") {
    return (
      <DemoDappScreen
        projectId={walletConnectProjectId}
        projectIdPresent={walletConnectConfigured}
      />
    );
  }

  return (
    <main
      className="intentproof-shell"
      data-decision={decision?.severity ?? "idle"}
      data-theme={resolvedTheme}
      data-tab={activeProductTab}
    >
      <header
        className={
          activeProductTab === "protect"
            ? "app-topbar app-topbar-primary"
            : "app-topbar"
        }
      >
        <span className="brand-lockup" aria-label="IntentProof brand">
          <img
            className="intentproof-mark"
            src="/intentproof-mark.svg"
            alt="IntentProof Tx Guard logo"
          />
          <span>IntentProof</span>
        </span>
        {activeProductTab !== "protect" ? (
          <span className="product-context-pill">
            {supportViewTitle(activeProductTab)}
          </span>
        ) : null}
        <div className="topbar-actions" aria-label="Wallet and network controls">
          <label className="network-control">
            <span>Network</span>
            <select
              value={selectedNetworkScope}
              onChange={(event) =>
                void handleNetworkScopeChange(event.target.value as NetworkScope)
              }
            >
              {networkOptions.map((network) => (
                <option key={network.value} value={network.value}>
                  {network.label}
                  {network.environment === "mainnet" ? " · mainnet" : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="icon-theme-toggle"
            aria-label={`${themeButtonCopy(themeMode, resolvedTheme)}. Toggle theme mode.`}
            title={themeButtonCopy(themeMode, resolvedTheme)}
            onClick={() =>
              setThemeMode((current) => nextThemeMode(current, resolvedTheme))
            }
          >
            <span aria-hidden="true">{themeGlyph(themeMode, resolvedTheme)}</span>
          </button>
          <button
            type="button"
            className="wallet-connect-button"
            title={imTokenState.detail}
            onClick={() => {
              if (imTokenState.account) {
                setAccountMenuOpen((open) => !open);
              } else if (imTokenState.status !== "pairing") {
                void handleConnectImToken();
              }
            }}
            aria-expanded={imTokenState.account ? accountMenuOpen : undefined}
            disabled={imTokenState.status === "pairing"}
          >
            <span aria-hidden="true" className="wallet-dot" />
            {signerButtonLabel}
          </button>
          {imTokenState.account && accountMenuOpen ? (
            <div className="wallet-account-menu" role="menu" aria-label="Connected account">
              <div className="account-menu-address">
                <span>Connected signer</span>
                <code>{imTokenState.account.address}</code>
              </div>
              <button
                type="button"
                role="menuitem"
                className="button-secondary"
                onClick={() => void handleDisconnectAccount()}
              >
                Disconnect imToken
              </button>
            </div>
          ) : null}
        </div>
      </header>
      {activeProductTab !== "protect" ? (
        <section className="support-return surface">
          <button
            type="button"
            className="button-secondary"
            onClick={() => setActiveProductTab("protect")}
          >
            Back to Protect Wallet
          </button>
          <div>
            <span className="eyebrow">Support tool</span>
            <h1>{supportViewTitle(activeProductTab)}</h1>
          </div>
          <div className="support-return-actions" aria-label="Secondary support tools">
            <button
              type="button"
              aria-label="Open Examples"
              className={activeProductTab === "preview" ? "active" : ""}
              onClick={openExamples}
            >
              Examples
            </button>
            <button
              type="button"
              aria-label="Open Token Core Lab"
              className={activeProductTab === "testnet" ? "active" : ""}
              onClick={openTokenCoreLab}
            >
              Token Core Lab
            </button>
            <button
              type="button"
              aria-label="Open Activity"
              className={activeProductTab === "activity" ? "active" : ""}
              onClick={() => setActiveProductTab("activity")}
            >
              Activity
            </button>
          </div>
        </section>
      ) : null}
      {activeProductTab === "protect" ? (
        <ProtectWalletScreen
          connectDapp={
          <DappConnectionCard
            state={dappState}
            pairingUri={dappPairingUri}
            uriSource={dappUriSource}
            projectIdPresent={walletConnectConfigured}
            imTokenConnected={Boolean(imTokenState.account)}
            imTokenConnecting={imTokenState.status === "pairing"}
            onPairingUriChange={handleManualPairingUriChange}
            onConnectImToken={() => void handleConnectImToken()}
            onConnect={() => void handleConnectDapp()}
            onResetLiveSessions={() => void handleResetLiveSessions()}
          />
          }
          requestInbox={
            <RequestInbox
              requests={liveRequests}
              selectedRequestId={selectedLiveRequest?.id}
              onSelect={(requestId) => {
                setSelectedLiveRequestId(requestId);
                setLiveWarningAcknowledged(false);
              }}
              getDecision={(request) =>
                evaluateLiveRequestPolicy({
                  request,
                  firewall,
                  warningAcknowledged:
                    request.id === selectedLiveRequest?.id
                      ? liveWarningAcknowledged
                      : false,
                })
              }
            />
          }
          signingCard={
            <LiveRequestCard
              request={selectedLiveRequest}
              decision={liveDecision}
              warningAcknowledged={liveWarningAcknowledged}
              onWarningAcknowledged={setLiveWarningAcknowledged}
              onForward={() => void handleForwardLiveRequest()}
              onReject={() => void handleRejectLiveRequest()}
            />
          }
          receiptSummary={
            <section className="surface live-receipt-strip">
              <span className="eyebrow">Activity</span>
              <strong>{liveActionStatus}</strong>
              <p>
                imToken final signing results and rejections are stored locally
                as non-secret activity.
              </p>
              <button
                type="button"
                className="button-secondary"
                onClick={() => setActiveProductTab("activity")}
              >
                Open activity
              </button>
            </section>
          }
          supportTools={
            <section className="surface support-tools-panel">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Support tools</span>
                  <h2>Examples and Token Core Lab</h2>
                </div>
                <span className="muted">Secondary surfaces</span>
              </div>
              <p>
                IntentProof is the WalletConnect guard above. These tools remain
                available for judges, local Token Core proof, and receipt review.
              </p>
              <div className="support-tool-grid">
                <button
                  type="button"
                  aria-label="Open Examples"
                  onClick={openExamples}
                >
                  <strong>Examples</strong>
                  <span>Run five deterministic PASS/WARN/BLOCK requests.</span>
                </button>
                <button
                  type="button"
                  aria-label="Open Token Core Lab"
                  onClick={openTokenCoreLab}
                >
                  <strong>Token Core Lab</strong>
                  <span>Create a fresh testnet wallet and sign locally.</span>
                </button>
                <button
                  type="button"
                  aria-label="Open Activity"
                  onClick={() => setActiveProductTab("activity")}
                >
                  <strong>Activity</strong>
                  <span>Review local non-secret activity.</span>
                </button>
              </div>
            </section>
          }
        />
      ) : null}

      {activeProductTab === "preview" || activeProductTab === "testnet" ? (
        <WorkspaceScreen>
      {activeProductTab === "preview" ? (
      <>
      <header className="product-header">
        <div className="brand-block">
          <div className="campaign-row">
            <span className="brand-lockup" aria-label="IntentProof brand">
              <img
                className="intentproof-mark"
                src="/intentproof-mark.svg"
                alt="IntentProof Tx Guard logo"
              />
              <span>IntentProof</span>
            </span>
            <span className="eyebrow">Examples</span>
            <span className="wallet-skill-tag">Example request</span>
          </div>
          <h1>Examples</h1>
          <p>
            Exercise deterministic incoming requests with the same parser,
            policy engine, and Token Core evidence used by Protect Wallet.
          </p>
          <div className="proof-strip" aria-label="IntentProof proof summary">
            <span>
              <strong>01</strong>
              Intent parsed
            </span>
            <span>
              <strong>02</strong>
              Token Core decoded
            </span>
            <span>
              <strong>03</strong>
              Policy gates forwarding
            </span>
          </div>
          <div className="mode-switch" aria-label="Example execution mode switch">
            {(["demo", "testnet"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={appMode === mode ? "active" : ""}
                onClick={() => {
                  setAppMode(mode);
                  setWarningAcknowledged(false);
                  setTokenCoreSignedRaw("");
                  setTokenCoreSignedHash("");
                  setSentHash("");
                }}
              >
                {modeLabel(mode)}
              </button>
            ))}
          </div>
          <div className="header-actions">
            <button
              type="button"
              className="primary-action"
              onClick={() => void handleAnalyzeIntent()}
              disabled={isAnalyzing}
            >
              Verify before signing
            </button>
            <span className={`decision-pill ${severityClass(decision?.severity)}`}>
              {decision?.label ?? "VERIFY REQUIRED"}
            </span>
            <span className="mode-badge">
              {modeLabel(appMode)}
            </span>
            <span className="decision-copy">{visibleDecisionCopy}</span>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="wallet-preview">
            <div className="wallet-preview-topbar">
              <img
                className="wallet-mark"
                src="/intentproof-mark.svg"
                alt=""
              />
              <strong>Token Core proof</strong>
              <small>{currentChainLabel}</small>
            </div>
            <div className="wallet-balance">
              <span>Signing status</span>
              <strong>{decision?.label ?? "Locked"}</strong>
              <small>{shortSigner}</small>
            </div>
            <div className="wallet-proof-card">
              <span>User intent</span>
              <strong>{selectedScenario?.label ?? "Custom intent"}</strong>
            </div>
            <div className="wallet-proof-card">
              <span>Actual action</span>
              <strong>{heroAction}</strong>
            </div>
            <div className={`wallet-decision ${severityClass(decision?.severity)}`}>
              <span>{decision?.signState ?? "analysis required"}</span>
              <strong>{localSigningReady ? "Ready to sign" : "Signer locked"}</strong>
            </div>
          </div>
        </div>
      </header>

      <section className="judge-demo-strip surface" aria-label="Example request examples">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Examples</span>
            <h2>Five deterministic request outcomes</h2>
          </div>
          <span className="muted">
            {completedDemoChecks}/{intentScenarios.length} requests checked
          </span>
        </div>
        <div className="judge-card-grid">
          {intentScenarios.map((scenario, index) => {
            const run = scenarioRunResults[scenario.id];
            return (
              <button
                key={scenario.id}
                type="button"
                className={
                  scenario.id === selectedScenarioId
                    ? "judge-scenario-card active"
                    : "judge-scenario-card"
                }
                onClick={() =>
                  void handleAnalyzeIntent({
                    intent: scenario.intent,
                    scenarioId: scenario.id,
                    mode: appMode,
                    statusPrefix: `Verifying ${scenario.label}.`,
                    syncSelection: true,
                  })
                }
              >
                <span>Example {index + 1}</span>
                <strong>{scenario.label}</strong>
                <em className={`decision-pill ${severityClass(run?.severity)}`}>
                  {run?.label ?? scenario.outcome}
                </em>
              </button>
            );
          })}
        </div>
        <div className="judge-actions">
          <button
            type="button"
            className="primary-action"
            onClick={() => void handleRunAllChecks()}
            disabled={isRunningDemoChecks || isAnalyzing}
          >
            Run example checks
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={() => void handleNextScenario()}
            disabled={isAnalyzing}
          >
            Next request
          </button>
          <button type="button" className="button-secondary" onClick={handleResetDemo}>
            Reset
          </button>
          <p>
            Examples use deterministic transaction plans with the same
            parser, policy compiler, decision engine, and UI gates as Testnet
            Signing.
          </p>
        </div>
      </section>

      <section className="why-strip" aria-label="Why IntentProof matters">
        <div>
          <strong>AI can draft. Token Core verifies.</strong>
          <span>Every signature is gated by decoded calldata and policy, not by chatbot trust.</span>
        </div>
        <div>
          <strong>Users see the mismatch.</strong>
          <span>Wrong chains, bridges, slippage, and unlimited approvals become explicit.</span>
        </div>
        <div>
          <strong>Secrets stay local.</strong>
          <span>Examples need no keys; Token Core Lab uses a fresh local wallet.</span>
        </div>
      </section>
      </>
      ) : null}

      <section className="workspace-grid">
        <div className="workspace-main">
          <section className="surface intent-console">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Intent Console</span>
                <h2>User request</h2>
              </div>
              <span className="muted">
                {selectedScenario?.outcome ?? "CUSTOM"} ·{" "}
                {appMode === "demo" ? "Hosted preview" : "Local testnet"}
              </span>
            </div>

            {activeProductTab === "preview" ? (
              <div className="scenario-row" aria-label="Example request examples">
                {intentScenarios.map((scenario) => (
                  <button
                    key={scenario.id}
                    type="button"
                    className={
                      scenario.id === selectedScenarioId
                        ? "scenario-chip active"
                        : "scenario-chip"
                    }
                    onClick={() => selectScenario(scenario.id)}
                  >
                    <span>{scenario.label}</span>
                    <strong>{scenario.outcome}</strong>
                  </button>
                ))}
              </div>
            ) : null}

            <label className="intent-input">
              Natural-language wallet intent
              <textarea
                value={intentText}
                onChange={(event) => {
                  setIntentText(event.target.value);
                  setSelectedScenarioId(undefined);
                }}
              />
            </label>

            <div className="status-line">
              <span>{analysisStatus}</span>
              <span>{aiStatus}</span>
              <label className="remote-ai-toggle">
                <input
                  type="checkbox"
                  checked={remoteAiEnabled}
                  onChange={(event) => setRemoteAiEnabled(event.target.checked)}
                />
                <span>Remote AI opt-in</span>
                <small>Off by default; sends intent and decoded analysis to configured providers.</small>
              </label>
            </div>
          </section>

          <section className="surface">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Agent Permission Firewall</span>
                <h2>Permission Profile</h2>
              </div>
              <span className="muted">
                {firewall.preset} · {policyCount ?? 0} active policy rules
              </span>
            </div>

            <div className="preset-card-grid" aria-label="Permission profile presets">
              {(Object.keys(firewallPresets) as Array<
                keyof typeof firewallPresets
              >).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={
                    firewall.preset === preset
                      ? "preset-card active"
                      : "preset-card"
                  }
                  onClick={() => applyFirewallPreset(preset)}
                >
                  <strong>{preset}</strong>
                  <span>{getPresetDescription(preset)}</span>
                </button>
              ))}
            </div>

            <div className="policy-chip-row" aria-label="Active policy summary">
              {policySummaryChips.map((chip) => (
                <span key={chip}>{chip}</span>
              ))}
            </div>

            <div className="mainnet-readiness-panel">
              <strong>Testnet default, mainnet warning enabled.</strong>
              <p>
                Ethereum Mainnet and Base Mainnet appear only in Protect Wallet
                WalletConnect forwarding with a visible warning. This product keeps local browser
                signing and broadcast on Sepolia/Base Sepolia only.
              </p>
              <div className="policy-chip-row" aria-label="Mainnet-ready chains">
                {mainnetReadyChains.map((chain) => (
                  <span key={chain.key}>
                    {chain.label} · WalletConnect warning
                  </span>
                ))}
              </div>
            </div>

            <details className="advanced-policy-controls">
              <summary>Advanced policy controls</summary>
              <div className="firewall-grid">
                <label className="control-line">
                  <span>Sepolia allowed</span>
                  <input
                    type="checkbox"
                    checked={firewall.allowedChains.includes("sepolia")}
                    onChange={() => toggleAllowedChain("sepolia")}
                  />
                </label>
                <label className="control-line">
                  <span>Base Sepolia allowed</span>
                  <input
                    type="checkbox"
                    checked={firewall.allowedChains.includes("baseSepolia")}
                    onChange={() => toggleAllowedChain("baseSepolia")}
                  />
                </label>
                <label>
                  Max spend per tx USD
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={firewall.maxSpendUsd}
                    onChange={(event) =>
                      updateFirewall(
                        "maxSpendUsd",
                        Number.parseFloat(event.target.value) || 0,
                      )
                    }
                  />
                </label>
                <label>
                  Daily spend cap USD
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={firewall.dailySpendCapUsd}
                    onChange={(event) =>
                      updateFirewall(
                        "dailySpendCapUsd",
                        Number.parseFloat(event.target.value) || 0,
                      )
                    }
                  />
                </label>
                <label>
                  USDC cap
                  <input
                    value={firewall.usdcSpendCap}
                    onChange={(event) =>
                      updateFirewall("usdcSpendCap", event.target.value)
                    }
                  />
                </label>
                <label>
                  ETH cap
                  <input
                    value={firewall.ethSpendCap}
                    onChange={(event) =>
                      updateFirewall("ethSpendCap", event.target.value)
                    }
                  />
                </label>
                <label>
                  Gas cap USD
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={firewall.gasCapUsd}
                    onChange={(event) =>
                      updateFirewall(
                        "gasCapUsd",
                        Number.parseFloat(event.target.value) || 0,
                      )
                    }
                  />
                </label>
                <label>
                  Slippage cap bps
                  <input
                    type="number"
                    min="0"
                    value={firewall.maxSlippageBps}
                    onChange={(event) =>
                      updateFirewall(
                        "maxSlippageBps",
                        Number.parseInt(event.target.value, 10) || 0,
                      )
                    }
                  />
                </label>
                <label className="control-line">
                  <span>Forbid bridges</span>
                  <input
                    type="checkbox"
                    checked={firewall.forbidBridge}
                    onChange={(event) =>
                      updateFirewall("forbidBridge", event.target.checked)
                    }
                  />
                </label>
                <label className="control-line">
                  <span>Forbid unlimited approvals</span>
                  <input
                    type="checkbox"
                    checked={firewall.forbidUnlimitedApprovals}
                    onChange={(event) =>
                      updateFirewall(
                        "forbidUnlimitedApprovals",
                        event.target.checked,
                      )
                    }
                  />
                </label>
                <label className="control-line">
                  <span>Require verified contracts</span>
                  <input
                    type="checkbox"
                    checked={firewall.requireVerifiedContract}
                    onChange={(event) =>
                      updateFirewall(
                        "requireVerifiedContract",
                        event.target.checked,
                      )
                    }
                  />
                </label>
                <label className="control-line">
                  <span>Confirm first-time contracts</span>
                  <input
                    type="checkbox"
                    checked={firewall.requireFirstInteractionConfirmation}
                    onChange={(event) =>
                      updateFirewall(
                        "requireFirstInteractionConfirmation",
                        event.target.checked,
                      )
                    }
                  />
                </label>
                <label className="control-line">
                  <span>Trusted recipients only</span>
                  <input
                    type="checkbox"
                    checked={firewall.trustedRecipientsOnly}
                    onChange={(event) =>
                      updateFirewall(
                        "trustedRecipientsOnly",
                        event.target.checked,
                      )
                    }
                  />
                </label>
              </div>
            </details>
          </section>

          <section className="surface">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Token Core Analyze Pipeline</span>
                <h2>Evidence timeline</h2>
              </div>
            </div>
            <div className="pipeline-list">
              {pipeline.map((step) => (
                <div key={step.label} className={`pipeline-step ${step.state}`}>
                  <span />
                  <div>
                    <strong>{step.label}</strong>
                    <p>{step.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {activeProductTab === "testnet" ? (
        <aside className="workspace-side">
          <section className="surface">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Token Core Lab</span>
                <h2>Token Core signing with local testnet wallets</h2>
              </div>
              <select
                value={selectedChainKey}
                onChange={(event) =>
                  setSelectedChainKey(event.target.value as DemoChainKey)
                }
                aria-label="Token Core Lab network"
              >
                <option value="sepolia">Sepolia</option>
                <option value="baseSepolia">Base Sepolia</option>
              </select>
            </div>

            <p className="mode-note">
              {appMode === "demo"
                ? "Examples use deterministic testnet analysis by default. Mainnet appears only in Protect Wallet forwarding, never local browser signing."
                : "Token Core Lab uses the same policy path with local Token Core signing and explicit Sepolia/Base Sepolia broadcast only."}
            </p>

            <button
              type="button"
              className="signing-collapse-toggle"
              aria-expanded={testnetSigningOpen}
              onClick={() => setTestnetSigningOpen((open) => !open)}
            >
              <span>Token Core Lab with Token Core</span>
              <strong>{testnetSigningOpen ? "Hide controls" : "Show controls"}</strong>
            </button>

            {testnetSigningOpen ? (
              <>
                <form
                  className="wallet-create-grid"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleCreateTokenCoreWallet();
                  }}
                >
                  <label>
                    Wallet name
                    <input
                      name="wallet-name"
                      autoComplete="username"
                      value={tokenCoreName}
                      onChange={(event) => setTokenCoreName(event.target.value)}
                    />
                  </label>
                  <label>
                    Password
                    <input
                      name="wallet-password"
                      type="password"
                      autoComplete="new-password"
                      value={tokenCorePassword}
                      onChange={(event) => setTokenCorePassword(event.target.value)}
                    />
                  </label>
                  <button type="submit">Create fresh testnet wallet</button>
                </form>

                <div className="external-signer-panel">
                  <div>
                    <span className="eyebrow">Safer real-wallet path</span>
                    <h3>Use external wallet handoff for real accounts</h3>
                    <p>
                      Browser keystore upload and export are not part of this
                      product surface. Real imToken accounts should connect
                      through the Protect Wallet WalletConnect flow, with passkeys
                      reserved for local session approval.
                    </p>
                  </div>
                  <div className="connector-status-grid">
                    <span>
                      Protect Wallet WalletConnect
                      <strong>Live in Protect Wallet when configured</strong>
                    </span>
                    <span>
                      Passkey guard
                      <strong>Future local approval layer</strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => setExternalWalletModalOpen(true)}
                  >
                    External wallet plan
                  </button>
                </div>

                <p className="status-text">{tokenCoreStatus}</p>
                <div className="wallet-list">
                  {tokenCoreWallets.length === 0 ? (
                    <p className="muted">No local Token Core wallet yet.</p>
                  ) : (
                    tokenCoreWallets.map((wallet) => (
                      <div key={wallet.id} className="wallet-row">
                        <button
                          type="button"
                          className={
                            wallet.id === activeTokenCoreWalletId
                              ? "wallet-chip active"
                              : "wallet-chip"
                          }
                          onClick={() => selectTokenCoreWallet(wallet.id)}
                        >
                          <span>{wallet.name}</span>
                          <strong>{wallet.address}</strong>
                        </button>
                        <button
                          type="button"
                          className="text-danger"
                          onClick={() => handleDeleteTokenCoreWallet(wallet.id)}
                        >
                          Delete
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={handleClearTokenCoreWallets}
                >
                  Clear all local testnet wallets
                </button>
                <p className="small-text">
                  Deletes testnet keystores stored in this browser. No server upload.
                </p>
                {activeTokenCoreWallet ? (
                  <div className="receipt-line">
                    <span>Created {formatDateTime(activeTokenCoreWallet.createdAt)}</span>
                    <span>No browser export flow</span>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="collapsed-signing-note">
                <strong>Local wallet controls are hidden by default.</strong>
                <span>
                  Open only when you want a fresh testnet wallet for real Token
                  Core signing. Do not use real seed phrases or private keys.
                </span>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => setExternalWalletModalOpen(true)}
                >
                  External wallet plan
                </button>
              </div>
            )}
          </section>
        </aside>
        ) : null}
      </section>

      {externalWalletModalOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setExternalWalletModalOpen(false)}
        >
          <section
            className="external-wallet-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="external-wallet-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="section-heading">
              <div>
                <span className="eyebrow">External signer</span>
                <h2 id="external-wallet-title">External signer handoff</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Close external wallet plan"
                onClick={() => setExternalWalletModalOpen(false)}
              >
                x
              </button>
            </div>
            <div className="modal-step-list">
              <div>
                <strong>1. imToken / WalletConnect forwarding</strong>
                <p>
                  Protect Wallet uses WalletConnect to connect imToken as the
                  final signer when the public project id is configured. If the
                  project id is missing, the app shows setup-required while
                  Examples and local Token Core Lab keep working.
                </p>
              </div>
              <div>
                <strong>2. Passkey session guard</strong>
                <p>
                  Passkeys should protect local agent-policy approval or session
                  unlock. They must not export wallet secrets or replace Token
                  Core transaction verification.
                </p>
              </div>
              <div>
                <strong>3. Current product boundary</strong>
                <p>
                  Use a freshly generated testnet Token Core wallet for signing.
                  Browser keystore upload and export are intentionally absent.
                </p>
              </div>
            </div>
            <div className="modal-actions">
              <a
                href="https://support.token.im/hc/en-us/articles/16392560958361-imToken-Supports-WalletConnect-v2-0"
                target="_blank"
                rel="noreferrer"
              >
                imToken WalletConnect note
              </a>
              <button
                type="button"
                onClick={() => setExternalWalletModalOpen(false)}
              >
                Got it
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <section className="decision-grid">
        <section className="surface">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Parsed Intent + Candidate</span>
              <h2>What the agent proposed</h2>
            </div>
          </div>
          {plan ? (
            <>
              <div className="request-source-card">
                <span className="eyebrow">DApp / AI request source</span>
                <strong>{selectedScenario?.label ?? "Custom wallet intent"}</strong>
                <p>{requestSourceCopy(plan, selectedScenarioId)}</p>
              </div>
              <div className="facts-grid">
                <div>
                  <span>Intent action</span>
                  <strong>{plan.parsedIntent.action}</strong>
                </div>
                <div>
                  <span>Parser source</span>
                  <strong>{plan.parserSource}</strong>
                </div>
                <div>
                  <span>Route</span>
                  <strong>{formatRouteEndpoint(plan.route)}</strong>
                </div>
                <div>
                  <span>Expected outcome</span>
                  <strong>{plan.expectedOutcome}</strong>
                </div>
                <div>
                  <span>Actual transaction</span>
                  <strong>{plan.actualTransaction}</strong>
                </div>
                <div>
                  <span>Target contract</span>
                  <strong>{formatFullAddress(plan.preparedTx.request.to)}</strong>
                </div>
                <div>
                  <span>Value</span>
                  <strong>
                    {formatNativeAmount(
                      plan.preparedTx.request.value,
                      plan.preparedTx.chainKey,
                    )}
                  </strong>
                </div>
              </div>
            </>
          ) : (
            <p className="muted">Verify before signing to compile the candidate transaction.</p>
          )}
        </section>

        <section className="surface signing-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Verifiable Signing Card</span>
              <h2>Sign only after proof</h2>
            </div>
            <span className={`decision-pill ${severityClass(decision?.severity)}`}>
              {decision?.label ?? "LOCKED"}
            </span>
          </div>

          {decision ? (
            <>
              {plan ? (
                <div className="signing-facts">
                  <div>
                    <span>User intent</span>
                    <strong>{plan.intent}</strong>
                  </div>
                  <div>
                    <span>Parsed vs actual action</span>
                    <strong>
                      {plan.parsedIntent.action} →{" "}
                      {analysis?.action.functionName ?? analysis?.action.title ?? "pending decode"}
                    </strong>
                  </div>
                  <div>
                    <span>Requested vs actual chain</span>
                    <strong>
                      {plan.parsedIntent.chainKey
                        ? getChainConfig(plan.parsedIntent.chainKey).label
                        : "Not specified"}{" "}
                      → {getChainConfig(plan.preparedTx.chainKey).label}
                    </strong>
                  </div>
                  <div>
                    <span>Sender</span>
                    <strong>
                      {formatFullAddress(activeTokenCoreWallet?.address ?? plan.preparedTx.request.account)}
                    </strong>
                  </div>
                  <div>
                    <span>Full recipient / contract</span>
                    <strong>
                      {formatFullAddress(
                        analysis?.action.functionName === "transfer"
                          ? analysis.action.argsSummary[0]?.value
                          : plan.preparedTx.request.to,
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>Token and exact amount</span>
                    <strong>
                      {plan.parsedIntent.amount ?? "n/a"}{" "}
                      {plan.parsedIntent.assetSymbol ?? "asset"}
                    </strong>
                  </div>
                  <div>
                    <span>Approval status</span>
                    <strong>
                      {plan.route.approvalIsUnlimited
                        ? "Unlimited approval requested"
                        : plan.preparedTx.templateKind === "erc20Approve"
                          ? "Approval requested"
                          : "No approval"}
                    </strong>
                  </div>
                  <div>
                    <span>Expected effects</span>
                    <strong>{plan.expectedOutcome}</strong>
                  </div>
                  <div>
                    <span>Gas estimate</span>
                    <strong>
                      ${plan.estimatedGasUsd.toFixed(2)}
                      {analysis?.simulation.gasEstimate
                        ? ` · ${analysis.simulation.gasEstimate} gas`
                        : ""}
                    </strong>
                  </div>
                </div>
              ) : null}
              <p className="decision-summary">{visibleDecisionCopy}</p>
              <p className="signing-readiness">{signingReadinessCopy}</p>
              <p className="muted">{decision.summary}</p>
              <div className="issue-list">
                {decision.issues.length === 0 ? (
                  <div className="issue-row severity-pass">
                    <strong>No blocking issues</strong>
                    <span>IntentProof found no mismatch.</span>
                  </div>
                ) : (
                  decision.issues.map((issue) => (
                    <div
                      key={`${issue.title}-${issue.description}`}
                      className={`issue-row ${severityClass(issue.severity)}`}
                    >
                      <strong>{issue.title}</strong>
                      <span>{issue.description}</span>
                    </div>
                  ))
                )}
              </div>

              {decision.signState === "ackRequired" ? (
                <label className="ack-line">
                  <input
                    type="checkbox"
                    checked={warningAcknowledged}
                    onChange={(event) =>
                      setWarningAcknowledged(event.target.checked)
                    }
                  />
                  I reviewed the warning and still want Token Core to sign.
                </label>
              ) : null}
            </>
          ) : (
            <p className="muted">
              Verification required. IntentProof has not unlocked signing for
              this transaction.
            </p>
          )}

          {activeProductTab === "testnet" ? (
          <div className="signing-control-shell">
            <button
              type="button"
              className="signing-collapse-toggle"
              aria-expanded={testnetSigningOpen}
              onClick={() => setTestnetSigningOpen((open) => !open)}
            >
              <span>Token Core Lab with Token Core</span>
              <strong>{testnetSigningOpen ? "Hide controls" : "Show controls"}</strong>
            </button>

            {testnetSigningOpen ? (
              <form
                className="signing-action-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleTokenCoreSign();
                }}
              >
                <input
                  className="visually-hidden"
                  type="text"
                  name="sign-wallet-username"
                  autoComplete="username"
                  value={activeTokenCoreWallet?.address ?? "local-testnet-wallet"}
                  readOnly
                  tabIndex={-1}
                  aria-hidden="true"
                />
                <label>
                  Local wallet password
                  <input
                    name="sign-wallet-password"
                    type="password"
                    autoComplete="current-password"
                    value={tokenCoreSignPassword}
                    onChange={(event) =>
                      setTokenCoreSignPassword(event.target.value)
                    }
                  />
                </label>
                <div className="button-row">
                  <button type="submit" disabled={!localSigningReady}>
                    Sign with Token Core
                  </button>
                  <button
                    type="button"
                    onClick={handleTokenCoreBroadcast}
                    disabled={!tokenCoreSignedRaw || !verificationAllowsSigning}
                  >
                    Broadcast explicitly
                  </button>
                </div>
              </form>
            ) : (
              <p className="collapsed-signing-note">
                Local wallet password and broadcast controls stay collapsed
                until the user chooses Token Core Lab.
              </p>
            )}
          </div>
          ) : null}

          <div className="receipt-box">
            <strong>Verifiable Signing Receipt</strong>
            <p>{sendStatus}</p>
            {receipt ? (
              <div className="receipt-summary" aria-label="Receipt summary">
                <div>
                  <span>Decision</span>
                  <strong>{receipt.decision}</strong>
                </div>
                <div>
                  <span>Intent</span>
                  <strong>{receipt.intent}</strong>
                </div>
                <div>
                  <span>Actual transaction</span>
                  <strong>{plan?.actualTransaction ?? receipt.action}</strong>
                </div>
                <div>
                  <span>Chain</span>
                  <strong>{receipt.chain}</strong>
                </div>
                <div>
                  <span>Sign state</span>
                  <strong>{signingReadinessCopy}</strong>
                </div>
                <div>
                  <span>Signed</span>
                  <strong>{receipt.signed ? "yes" : "no"}</strong>
                </div>
                <div>
                  <span>Broadcast</span>
                  <strong>{receipt.broadcast ? "yes" : "no"}</strong>
                </div>
              </div>
            ) : (
              <p className="muted">Receipt appears after verification.</p>
            )}
            <details className="receipt-raw-details">
              <summary>Show raw receipt</summary>
              <pre>{receiptText}</pre>
            </details>
            <div className="button-row">
              <button type="button" onClick={handleCopyReceipt} disabled={!receipt}>
                Copy receipt
              </button>
              <button
                type="button"
                onClick={handleDownloadReceipt}
                disabled={!receipt}
              >
                Download receipt
              </button>
            </div>
            {sentHash && plan ? (
              <a
                href={getExplorerTxUrl(plan.preparedTx.chainKey, sentHash)}
                target="_blank"
                rel="noreferrer"
              >
                Open explorer receipt
              </a>
            ) : null}
          </div>
        </section>
      </section>

      <section className="decision-grid">
        <section className="surface">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Token Core Evidence</span>
              <h2>Decoded transaction</h2>
            </div>
          </div>
          {analysis ? (
            <div className="analysis-block">
              <p>{englishEvidenceSummary}</p>
              <details className="language-details">
                <summary>Traditional Chinese risk notes</summary>
                <p>{analysis.zhTwSummary}</p>
                {analysis.aiSummary ? (
                  <p>AI risk note ({analysis.aiProvider ?? "local"}): {analysis.aiSummary}</p>
                ) : null}
              </details>
              <dl>
                <div>
                  <dt>Function</dt>
                  <dd>{analysis.action.functionName ?? analysis.action.title}</dd>
                </div>
                <div>
                  <dt>Contract verification</dt>
                  <dd>{analysis.verification.message}</dd>
                </div>
                <div>
                  <dt>Full target address</dt>
                  <dd>{formatFullAddress(analysis.action.targetAddress)}</dd>
                </div>
              </dl>
              <details className="advanced-decode-details">
                <summary>Advanced decoded arguments</summary>
                <pre>{stringifyWithBigInt(analysis.action.argsSummary)}</pre>
              </details>
            </div>
          ) : (
            <p className="muted">Decode output appears after analysis.</p>
          )}
        </section>

        <section className="surface">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Why users can trust this build</span>
              <h2>Safety boundaries</h2>
            </div>
          </div>
          <ul className="boundary-list">
            <li>Wallet secrets stay local in the browser or CLI wallet store.</li>
            <li>Remote AI is off by default and never receives keystores.</li>
            <li>Broadcast is separate from signing and remains explicit.</li>
            <li>Trusted recipient comparison uses full address equality.</li>
            <li>Protect Wallet forwards live WalletConnect requests only when configured.</li>
            <li>
              Address book: {trustedRecipients[0]!.label}{" "}
              {trustedRecipients[0]!.address}
            </li>
          </ul>
          <div className="tokencore-usage-card">
            <span className="eyebrow">Token Core used here</span>
            <strong>
              Templates, decode/analyze, policy checks, local signing, and
              explicit testnet broadcast.
            </strong>
            <p>
              Examples may use deterministic or degraded network evidence, but it
              still follows the same parser, compiler, policy, and signing-gate
              path as Token Core Lab.
            </p>
          </div>
        </section>
      </section>

        </WorkspaceScreen>
      ) : null}

      {activeProductTab === "activity" ? (
        <ActivityScreen>
          <section className="surface">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Activity</span>
                <h2>Local non-secret activity</h2>
              </div>
              <span className="muted">
                {liveActivity.length + (receipt ? 1 : 0)} receipt(s)
              </span>
            </div>
            {receipt ? (
              <div className="receipt-summary" aria-label="Receipt summary">
                <div>
                  <span>Decision</span>
                  <strong>{receipt.decision}</strong>
                </div>
                <div>
                  <span>Intent</span>
                  <strong>{receipt.intent}</strong>
                </div>
                <div>
                  <span>Actual transaction</span>
                  <strong>{plan?.actualTransaction ?? receipt.action}</strong>
                </div>
                <div>
                  <span>Chain</span>
                  <strong>{receipt.chain}</strong>
                </div>
                <div>
                  <span>Signed</span>
                  <strong>{receipt.signed ? "yes" : "no"}</strong>
                </div>
                <div>
                  <span>Broadcast</span>
                  <strong>{receipt.broadcast ? "yes" : "no"}</strong>
                </div>
              </div>
            ) : null}
            {liveActivity.length > 0 ? (
              <div className="receipt-summary" aria-label="Live receipt summary">
                {liveActivity.map((item) => (
                  <div key={item.id}>
                    <span>{item.origin}</span>
                    <strong>
                      {item.decision} ·{" "}
                      {item.resolvedLocally
                        ? "resolved"
                        : item.forwarded
                          ? "forwarded"
                          : "rejected"} ·{" "}
                      {item.chainLabel}
                    </strong>
                  </div>
                ))}
              </div>
            ) : null}
            {!receipt && liveActivity.length === 0 ? (
              <p className="muted">
                Activity appears after a request is verified, forwarded, rejected,
                signed, or broadcast.
              </p>
            ) : null}
            <details className="receipt-raw-details">
              <summary>Show raw Token Core receipt</summary>
              <pre>{receiptText}</pre>
            </details>
          </section>
        </ActivityScreen>
      ) : null}

      {activeProductTab === "testnet" ? (
      <div className="sticky-action-bar" aria-label="Current signing decision">
        <span className={`decision-pill ${severityClass(decision?.severity)}`}>
          {decision?.label ?? "VERIFY REQUIRED"}
        </span>
        <strong>{signingReadinessCopy}</strong>
        <button
          type="button"
          className="primary-action"
          aria-label="Sticky verify before signing"
          onClick={() => void handleAnalyzeIntent()}
          disabled={isAnalyzing}
        >
          Verify before signing
        </button>
        <button
          type="button"
          aria-label="Sticky Token Core sign"
          onClick={() => {
            if (!localSigningReady) return;
            void handleTokenCoreSign();
          }}
          disabled={!localSigningReady}
        >
          Sign with Token Core
        </button>
        <button type="button" onClick={handleCopyReceipt} disabled={!receipt}>
          Copy receipt
        </button>
      </div>
      ) : null}
    </main>
  );
}

export default App;
