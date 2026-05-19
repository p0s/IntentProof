import {
  LIVE_CHAIN_CONFIGS,
  buildLiveAccount,
  getLiveChainByKey,
  getLiveChainOrder,
  liveRpcMap,
} from "./chainConfig";
import { getWalletConnectMetadata } from "./metadata";
import { getIntentProofWalletConnectCore } from "./walletConnectCore";
import type { LiveClientPairResult, LiveRequest, LiveSignerClient } from "./types";
import type { DemoChainKey } from "../types";

type EthereumProviderLike = {
  accounts: string[];
  chainId: number;
  connect: () => Promise<void>;
  disconnect?: () => Promise<void>;
  on: (event: string, listener: (payload: unknown) => void) => void;
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
  signer?: {
    session?: { topic?: string };
    client?: {
      request: (args: {
        topic: string;
        chainId: string;
        request: { method: string; params?: unknown };
      }) => Promise<unknown>;
    };
  };
};

const DIRECT_REQUEST_UNAVAILABLE = Symbol("direct-request-unavailable");

export class ImTokenWalletConnectSigner implements LiveSignerClient {
  private provider?: EthereumProviderLike;
  private displayUri?: string;
  private readonly projectId: string;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  private async initProvider(showQrModal: boolean) {
    const [core, { EthereumProvider }] = await Promise.all([
      getIntentProofWalletConnectCore(this.projectId),
      import("@walletconnect/ethereum-provider"),
    ]);
    const provider = (await EthereumProvider.init({
      core,
      projectId: this.projectId,
      optionalChains: getLiveChainOrder().map(
        (key) => LIVE_CHAIN_CONFIGS[key].chainId,
      ) as [number, ...number[]],
      showQrModal,
      methods: [
        "eth_sendTransaction",
        "personal_sign",
        "eth_signTypedData_v4",
        "wallet_switchEthereumChain",
        "eth_accounts",
        "eth_chainId",
      ],
      events: ["accountsChanged", "chainChanged", "disconnect"],
      rpcMap: liveRpcMap(),
      metadata: getWalletConnectMetadata(),
    })) as EthereumProviderLike;

    provider.on("display_uri", (uri) => {
      this.displayUri = typeof uri === "string" ? uri : undefined;
    });
    this.provider = provider;
    return provider;
  }

  private connectedState(address?: string): LiveClientPairResult {
    return {
      ok: Boolean(address),
      state: {
        status: address ? "connected" : "pairing",
        label: address ? "imToken connected" : "Pairing imToken",
        detail: address
          ? "IntentProof can forward reviewed requests to imToken for final signing."
          : "Approve the WalletConnect request in imToken.",
        pairingUri: this.displayUri,
        account: address ? buildLiveAccount(address as `0x${string}`) : undefined,
      },
    };
  }

  private idleState(detail: string): LiveClientPairResult {
    return {
      ok: false,
      state: {
        status: "idle",
        label: "Ready to connect imToken",
        detail,
      },
    };
  }

  async restoreSession(): Promise<LiveClientPairResult> {
    if (!this.projectId) {
      return {
        ok: false,
        state: {
          status: "setup-required",
          label: "WalletConnect setup required",
          detail: "Set VITE_WALLETCONNECT_PROJECT_ID to enable live imToken pairing.",
        },
      };
    }

    const provider = await this.initProvider(false);
    let accounts = provider.accounts;
    if (!accounts.length) {
      try {
        const result = await provider.request({ method: "eth_accounts" });
        accounts = Array.isArray(result) ? result.filter(isString) : [];
      } catch {
        accounts = [];
      }
    }
    const address = accounts[0];
    if (!address) {
      return this.idleState("Connect imToken through WalletConnect for final signing.");
    }
    return this.connectedState(address);
  }

  async connectImToken(): Promise<LiveClientPairResult> {
    if (!this.projectId) {
      return {
        ok: false,
        state: {
          status: "setup-required",
          label: "WalletConnect setup required",
          detail: "Set VITE_WALLETCONNECT_PROJECT_ID to enable live imToken pairing.",
        },
      };
    }

    const provider = await this.initProvider(true);
    await provider.connect();
    return this.connectedState(provider.accounts[0]);
  }

  async forward(request: LiveRequest): Promise<unknown> {
    if (!this.provider) throw new Error("Connect imToken before forwarding.");
    const directResult = await this.forwardThroughSession(request);
    if (directResult !== DIRECT_REQUEST_UNAVAILABLE) return directResult;

    if (
      request.chain.chainId &&
      this.provider.chainId !== request.chain.chainId
    ) {
      await this.provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: request.chain.hexChainId }],
      });
    }
    return this.provider.request({
      method: request.method,
      params: request.request.params,
    });
  }

  private async forwardThroughSession(request: LiveRequest) {
    const topic = this.provider?.signer?.session?.topic;
    const client = this.provider?.signer?.client;
    if (!topic || !client) return DIRECT_REQUEST_UNAVAILABLE;
    return client.request({
      topic,
      chainId: request.chain.caip2,
      request: {
        method: request.method,
        params: request.request.params,
      },
    });
  }

  async switchChain(chainKey: DemoChainKey): Promise<LiveClientPairResult> {
    if (!this.provider) throw new Error("Connect imToken before switching networks.");
    const chain = getLiveChainByKey(chainKey);
    if (!chain) throw new Error("IntentProof does not support that WalletConnect chain.");
    await this.provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chain.hexChainId }],
    });
    return this.connectedState(this.provider.accounts[0]);
  }

  async disconnect() {
    await this.provider?.disconnect?.();
  }
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
