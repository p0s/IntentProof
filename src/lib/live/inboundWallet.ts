import { LIVE_CHAIN_CONFIGS, getLiveChainByKey } from "./chainConfig";
import { getWalletConnectMetadata } from "./metadata";
import { normalizeLiveRequest } from "./requestNormalizer";
import { getIntentProofWalletConnectCore } from "./walletConnectCore";
import type { BuildApprovedNamespacesParams } from "@walletconnect/utils";
import type { DemoChainKey } from "../types";
import type {
  LiveClientPairResult,
  LiveConnectorState,
  LiveInboundClient,
  LiveRequest,
  LiveSessionAccount,
} from "./types";

type WalletKitLike = {
  on: (event: string, listener: (payload: unknown) => void) => void;
  pair: (params: { uri: string }) => Promise<void>;
  approveSession: (params: { id: number; namespaces: unknown }) => Promise<unknown>;
  rejectSession: (params: { id: number; reason: unknown }) => Promise<unknown>;
  updateSession?: (params: { topic: string; namespaces: unknown }) => Promise<unknown>;
  getActiveSessions?: () => Record<string, unknown>;
  getPendingSessionRequests?: () => unknown[] | Record<string, unknown> | Promise<unknown[] | Record<string, unknown>>;
  emitSessionEvent?: (params: {
    topic: string;
    event: { name: string; data: unknown };
    chainId: string;
  }) => Promise<void>;
  respondSessionRequest: (params: {
    topic?: string;
    response: unknown;
  }) => Promise<void>;
};

type WalletKitContext = {
  walletkit: WalletKitLike;
  getSdkError: (key: "USER_REJECTED_METHODS") => unknown;
  buildApprovedNamespaces: (params: BuildApprovedNamespacesParams) => unknown;
};

type WalletKitSessionRequest = {
  id: number | string;
  topic?: string;
  chainId?: string;
  params?: {
    id?: number | string;
    topic?: string;
    request?: { method: string; params?: unknown };
    chainId?: string;
  };
  request?: { method: string; params?: unknown };
};

const DEFAULT_EIP155_METHODS = [
  "eth_sendTransaction",
  "personal_sign",
  "eth_signTypedData",
  "eth_signTypedData_v4",
  "wallet_switchEthereumChain",
  "wallet_addEthereumChain",
  "wallet_watchAsset",
  "wallet_getCapabilities",
  "wallet_sendCalls",
  "wallet_getCallsStatus",
  "wallet_showCallsStatus",
  "eth_requestAccounts",
  "eth_accounts",
  "eth_chainId",
  "eth_sign",
  "eth_signTransaction",
  "eth_sendRawTransaction",
];

const DEFAULT_EIP155_EVENTS = ["accountsChanged", "chainChanged"];

export function buildEip155SessionNamespace(account: LiveSessionAccount) {
  const accounts = account.chains.map((key) => `${key}:${account.address}`);
  return {
    chains: account.chains,
    methods: DEFAULT_EIP155_METHODS,
    events: DEFAULT_EIP155_EVENTS,
    accounts,
  };
}

export function parseWalletKitSessionRequest(
  event: unknown,
): WalletKitSessionRequest | undefined {
  if (!event || typeof event !== "object") return undefined;
  const typed = event as WalletKitSessionRequest;
  const id = typed.id ?? typed.params?.id;
  const request = typed.request ?? typed.params?.request;
  if (
    (typeof id !== "number" && typeof id !== "string") ||
    !request?.method
  ) {
    return undefined;
  }
  return {
    id,
    topic: typed.topic ?? typed.params?.topic,
    chainId: typed.chainId ?? typed.params?.chainId,
    params: {
      chainId: typed.chainId ?? typed.params?.chainId,
      request,
    },
    request,
  };
}

export class InboundWalletConnectWallet implements LiveInboundClient {
  private walletkit?: WalletKitLike;
  private readonly projectId: string;
  private readonly onRequest: (request: LiveRequest) => void;
  private readonly onState?: (state: LiveConnectorState) => void;
  private readonly seenRequestIds = new Set<string>();
  private pendingPoll?: number;
  private listenersBound = false;
  private walletkitContext?: Promise<WalletKitContext>;

  constructor(
    projectId: string,
    onRequest: (request: LiveRequest) => void,
    onState?: (state: LiveConnectorState) => void,
  ) {
    this.projectId = projectId;
    this.onRequest = onRequest;
    this.onState = onState;
  }

  private pushSessionRequest(event: unknown) {
    const typed = parseWalletKitSessionRequest(event);
    if (!typed) return;
    const requestKey = `${typed.topic ?? "unknown"}:${String(typed.id)}`;
    if (this.seenRequestIds.has(requestKey)) return;
    this.seenRequestIds.add(requestKey);
    const method = typed.request?.method ?? "unknown";
    const chainId = typed.chainId ?? typed.params?.chainId;
    const chainConfig =
      typeof chainId === "string" && chainId in LIVE_CHAIN_CONFIGS
        ? LIVE_CHAIN_CONFIGS[chainId as keyof typeof LIVE_CHAIN_CONFIGS]
        : undefined;
    this.onRequest(
      normalizeLiveRequest({
        id: `wc-${typed.id}`,
        topic: typed.topic,
        origin: this.getOriginForTopic(typed.topic),
        method,
        requestId: typed.id,
        params: typed.request?.params,
        chainId: chainConfig?.chainId ?? chainId,
      }),
    );
  }

  private getOriginForTopic(topic?: string) {
    if (!topic || !this.walletkit?.getActiveSessions) return "WalletConnect DApp";
    try {
      const session = this.walletkit.getActiveSessions()[topic] as
        | {
            peer?: {
              metadata?: {
                name?: unknown;
                url?: unknown;
              };
            };
          }
        | undefined;
      const name = session?.peer?.metadata?.name;
      const url = session?.peer?.metadata?.url;
      if (typeof name === "string" && name.trim()) return name;
      if (typeof url === "string" && url.trim()) return url;
    } catch {
      // Fall back to a generic label; request handling should continue.
    }
    return "WalletConnect DApp";
  }

  private startPendingRequestRecovery(walletkit: WalletKitLike) {
    if (typeof window === "undefined") return;
    if (!walletkit.getPendingSessionRequests) return;
    if (this.pendingPoll) window.clearInterval(this.pendingPoll);
    this.pendingPoll = window.setInterval(() => {
      void Promise.resolve(walletkit.getPendingSessionRequests?.()).then((pending) => {
        const requests = Array.isArray(pending) ? pending : Object.values(pending ?? {});
        for (const request of requests) {
          this.pushSessionRequest(request);
        }
      }).catch(() => {
        // Polling is only a recovery path. Live session_request events remain
        // authoritative when the SDK does not expose pending requests.
      });
    }, 1000);
  }

  private pushPendingRequests(walletkit: WalletKitLike) {
    if (!walletkit.getPendingSessionRequests) return;
    void Promise.resolve(walletkit.getPendingSessionRequests()).then((pending) => {
      const requests = Array.isArray(pending) ? pending : Object.values(pending ?? {});
      for (const request of requests) {
        this.pushSessionRequest(request);
      }
    }).catch(() => undefined);
  }

  private setupRequired(): LiveClientPairResult {
    return {
      ok: false,
      state: {
        status: "setup-required",
        label: "WalletConnect setup required",
        detail: "Set VITE_WALLETCONNECT_PROJECT_ID to accept DApp sessions.",
      },
    };
  }

  private async initWalletKit() {
    this.walletkitContext ??= this.createWalletKit();
    return this.walletkitContext;
  }

  private async createWalletKit(): Promise<WalletKitContext> {
    const [core, { WalletKit }, { getSdkError, buildApprovedNamespaces }] = await Promise.all([
      getIntentProofWalletConnectCore(this.projectId),
      import("@reown/walletkit"),
      import("@walletconnect/utils"),
    ]);
    const walletkit = (await WalletKit.init({
      core,
      metadata: getWalletConnectMetadata(),
    })) as WalletKitLike;

    return { walletkit, getSdkError, buildApprovedNamespaces };
  }

  private bindWalletKitListeners(
    walletkit: WalletKitLike,
    account: LiveSessionAccount,
    getSdkError: (key: "USER_REJECTED_METHODS") => unknown,
    buildApprovedNamespaces: (params: BuildApprovedNamespacesParams) => unknown,
  ) {
    if (this.listenersBound) return;
    this.listenersBound = true;
    walletkit.on("session_proposal", async (proposal: unknown) => {
      const typed = proposal as {
        id: number;
        params?: { requiredNamespaces?: Record<string, unknown> };
      };
      const eip155 = buildEip155SessionNamespace(account);
      const fallbackNamespaces = {
        eip155,
      };
      let namespaces: unknown = fallbackNamespaces;
      try {
        namespaces = buildApprovedNamespaces({
          proposal: {
            id: typed.id,
            ...(typed.params ?? {}),
          } as BuildApprovedNamespacesParams["proposal"],
          supportedNamespaces: {
            eip155,
          },
        });
      } catch {
        namespaces = fallbackNamespaces;
      }
      try {
        await walletkit.approveSession({ id: typed.id, namespaces });
        this.onState?.({
          status: "connected",
          label: "DApp connected",
          detail: "IntentProof is receiving DApp requests through WalletConnect.",
          account,
        });
      } catch {
        this.onState?.({
          status: "error",
          label: "DApp approval failed",
          detail:
            "IntentProof could not approve the WalletConnect session proposal. Try a fresh DApp QR or route.",
          account,
        });
        await walletkit.rejectSession({
          id: typed.id,
          reason: getSdkError("USER_REJECTED_METHODS"),
        });
      }
    });

    walletkit.on("session_request", (event: unknown) => {
      this.pushSessionRequest(event);
      this.onState?.({
        status: "connected",
        label: "DApp request received",
        detail: "IntentProof received a WalletConnect request from the DApp.",
        account,
      });
    });
  }

  private activeSessionCount(walletkit: WalletKitLike) {
    if (!walletkit.getActiveSessions) return 0;
    try {
      return Object.keys(walletkit.getActiveSessions()).length;
    } catch {
      return 0;
    }
  }

  private async syncActiveSessionNamespaces(
    walletkit: WalletKitLike,
    account: LiveSessionAccount,
  ) {
    if (!walletkit.updateSession || !walletkit.getActiveSessions) return;
    const activeSessions = walletkit.getActiveSessions();
    await Promise.all(
      Object.entries(activeSessions).map(([topic, session]) => {
        const existingNamespaces =
          session && typeof session === "object" && "namespaces" in session
            ? (session as { namespaces?: Record<string, unknown> }).namespaces
            : undefined;
        return walletkit.updateSession!({
          topic,
          namespaces: {
            ...(existingNamespaces ?? {}),
            eip155: buildEip155SessionNamespace(account),
          },
        });
      }),
    );
  }

  async restoreSession(account: LiveSessionAccount): Promise<LiveClientPairResult> {
    if (!this.projectId) return this.setupRequired();

    const { walletkit, getSdkError, buildApprovedNamespaces } = await this.initWalletKit();
    this.walletkit = walletkit;
    this.bindWalletKitListeners(walletkit, account, getSdkError, buildApprovedNamespaces);
    await this.syncActiveSessionNamespaces(walletkit, account);
    this.pushPendingRequests(walletkit);
    this.startPendingRequestRecovery(walletkit);

    const activeSessions = this.activeSessionCount(walletkit);
    if (!activeSessions) {
      return {
        ok: false,
        state: {
          status: "idle",
          label: "Ready for DApp route",
          detail: "Paste a WalletConnect URI, upload a QR screenshot, or scan a DApp QR.",
          account,
        },
      };
    }
    return {
      ok: true,
      state: {
        status: "connected",
        label: "DApp connected",
        detail: "IntentProof restored the DApp WalletConnect session and is listening for requests.",
        account,
      },
    };
  }

  async connectDapp(
    uri: string,
    account: LiveSessionAccount,
  ): Promise<LiveClientPairResult> {
    if (!this.projectId) return this.setupRequired();
    const { walletkit, getSdkError, buildApprovedNamespaces } = await this.initWalletKit();
    this.walletkit = walletkit;
    this.bindWalletKitListeners(walletkit, account, getSdkError, buildApprovedNamespaces);

    await walletkit.pair({ uri });
    this.pushPendingRequests(walletkit);
    this.startPendingRequestRecovery(walletkit);
    return {
      ok: true,
      state: {
        status: "pairing",
        label: "DApp pairing started",
        detail: "Approve the DApp session after IntentProof presents it.",
        account,
      },
    };
  }

  async updateActiveChain(account: LiveSessionAccount, chainKey: DemoChainKey) {
    if (!this.walletkit?.emitSessionEvent) return;
    const chain = getLiveChainByKey(chainKey);
    if (!chain) return;
    const sessions = this.walletkit.getActiveSessions?.() ?? {};
    await Promise.all(
      Object.keys(sessions).map((topic) =>
        this.walletkit!.emitSessionEvent!({
          topic,
          event: { name: "chainChanged", data: chain.hexChainId },
          chainId: chain.caip2,
        }),
      ),
    );
    this.onState?.({
      status: "connected",
      label: "DApp connected",
      detail: `${chain.label} selected. Connected DApps were notified through WalletConnect.`,
      account,
    });
  }

  async approveRequest(request: LiveRequest, result: unknown) {
    await this.walletkit?.respondSessionRequest({
      topic: request.topic,
      response: { id: request.request.id, jsonrpc: "2.0", result },
    });
  }

  async rejectRequest(request: LiveRequest, reason: string) {
    await this.walletkit?.respondSessionRequest({
      topic: request.topic,
      response: {
        id: request.request.id,
        jsonrpc: "2.0",
        error: { code: 4001, message: reason },
      },
    });
  }
}
