import { buildLiveAccount, getLiveChainByKey } from "./chainConfig";
import type { LiveClientPairResult, LiveRequest, LiveSignerClient } from "./types";
import type { DemoChainKey } from "../types";

type ImTokenWebProviderLike = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
};

type ResettableImTokenWebProviderLike = ImTokenWebProviderLike & {
  popupCommunicator?: { disconnect?: () => void };
  iframeCommunicator?: { disconnect?: () => void };
};

interface ImTokenConnectSignerOptions {
  requestTimeoutMs?: number;
}

const DEFAULT_IMTOKEN_REQUEST_TIMEOUT_MS = 30_000;
const IMTOKEN_WEB_TIMEOUT_ERROR = "IntentProofImTokenWebTimeout";

const FORWARDABLE_METHODS = new Set([
  "eth_sendTransaction",
  "personal_sign",
  "eth_signTypedData_v4",
  "wallet_switchEthereumChain",
]);

function asAccounts(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is `0x${string}` =>
          typeof item === "string" && /^0x[a-fA-F0-9]{40}$/.test(item),
      )
    : [];
}

function parseChainId(value: unknown) {
  if (typeof value !== "string") return undefined;
  if (/^0x[0-9a-fA-F]+$/.test(value)) return Number.parseInt(value, 16);
  if (/^\d+$/.test(value)) return Number.parseInt(value, 10);
  return undefined;
}

export class ImTokenConnectSigner implements LiveSignerClient {
  private provider?: ImTokenWebProviderLike;
  private readonly requestTimeoutMs: number;

  constructor(options: ImTokenConnectSignerOptions = {}) {
    this.requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_IMTOKEN_REQUEST_TIMEOUT_MS;
  }

  private async initProvider() {
    if (this.provider) return this.provider;
    const { ImTokenWebProvider } = await import("@consenlabs/imtoken-connect");
    this.provider = new ImTokenWebProvider() as unknown as ImTokenWebProviderLike;
    return this.provider;
  }

  private resetProvider() {
    const provider = this.provider as ResettableImTokenWebProviderLike | undefined;
    provider?.popupCommunicator?.disconnect?.();
    provider?.iframeCommunicator?.disconnect?.();
    this.provider = undefined;
  }

  private connectedState(address?: `0x${string}`, chainId?: number): LiveClientPairResult {
    return {
      ok: Boolean(address),
      state: {
        status: address ? "connected" : "idle",
        label: address ? "imToken Web connected" : "Ready to connect imToken Web",
        detail: address
          ? `IntentProof can forward reviewed requests to imToken Web for final signing${
              chainId ? ` on chain ${chainId}` : ""
            }.`
          : "Use imToken Web as the final signer. IntentProof does not create imToken accounts.",
        account: address ? buildLiveAccount(address) : undefined,
      },
    };
  }

  private async requestProvider(
    args: { method: string; params?: unknown[] | object },
    timeoutContext: string,
  ) {
    const provider = await this.initProvider();
    try {
      return await withTimeout(
        provider.request(args),
        this.requestTimeoutMs,
        `${timeoutContext} timed out. Finish Sign in or Create account in the imToken Web popup, then retry. If the popup stays on Processing more requests, use WalletConnect wallet while imToken Web is unavailable.`,
      );
    } catch (error) {
      if (
        !(error instanceof Error && error.name === IMTOKEN_WEB_TIMEOUT_ERROR)
      ) {
        this.resetProvider();
      }
      throw error;
    }
  }

  async restoreSession(): Promise<LiveClientPairResult> {
    try {
      const accounts = asAccounts(
        await this.requestProvider(
          { method: "eth_accounts" },
          "Checking imToken Web session",
        ),
      );
      const chainId = parseChainId(
        await this.requestProvider(
          { method: "eth_chainId" },
          "Checking imToken Web network",
        ),
      );
      return this.connectedState(accounts[0], chainId);
    } catch {
      return this.connectedState();
    }
  }

  async connectImToken(): Promise<LiveClientPairResult> {
    this.resetProvider();
    const accounts = asAccounts(
      await this.requestProvider(
        { method: "eth_requestAccounts" },
        "Connecting imToken Web",
      ),
    );
    const chainId = parseChainId(
      await this.requestProvider(
        { method: "eth_chainId" },
        "Reading imToken Web network",
      ),
    );
    return this.connectedState(accounts[0], chainId);
  }

  async forward(request: LiveRequest): Promise<unknown> {
    if (!FORWARDABLE_METHODS.has(request.method)) {
      throw new Error(`${request.method} is not forwarded to imToken Web.`);
    }
    if (request.method !== "wallet_switchEthereumChain") {
      await this.requestProvider(
        {
          method: "wallet_switchEthereumChain",
          params: [{ chainId: request.chain.hexChainId }],
        },
        "Switching imToken Web network",
      );
    }
    return this.requestProvider(
      {
        method: request.method,
        params: request.request.params as unknown[] | object | undefined,
      },
      "Forwarding request to imToken Web",
    );
  }

  async switchChain(chainKey: DemoChainKey): Promise<LiveClientPairResult> {
    const chain = getLiveChainByKey(chainKey);
    if (!chain) throw new Error("IntentProof does not support that chain.");
    await this.requestProvider(
      {
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chain.hexChainId }],
      },
      "Switching imToken Web network",
    );
    const accounts = asAccounts(
      await this.requestProvider(
        { method: "eth_accounts" },
        "Reading imToken Web account",
      ),
    );
    return this.connectedState(accounts[0], chain.chainId);
  }

  async disconnect() {
    this.resetProvider();
  }
}

async function withTimeout<T>(
  promiseLike: Promise<T> | T,
  timeoutMs: number,
  message: string,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const promise = Promise.resolve(promiseLike);
  const guardedPromise = promise.catch((error) => {
    if (timedOut) return new Promise<T>(() => undefined);
    throw error;
  });
  try {
    return await Promise.race([
      guardedPromise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          const error = new Error(message);
          error.name = IMTOKEN_WEB_TIMEOUT_ERROR;
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
