import { buildLiveAccount, getLiveChainByKey } from "./chainConfig";
import type { LiveClientPairResult, LiveRequest, LiveSignerClient } from "./types";
import type { DemoChainKey } from "../types";

type ImTokenWebProviderLike = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
};

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

  private async initProvider() {
    if (this.provider) return this.provider;
    const { ImTokenWebProvider } = await import("@consenlabs/imtoken-connect");
    this.provider = new ImTokenWebProvider() as ImTokenWebProviderLike;
    return this.provider;
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

  async restoreSession(): Promise<LiveClientPairResult> {
    try {
      const provider = await this.initProvider();
      const accounts = asAccounts(await provider.request({ method: "eth_accounts" }));
      const chainId = parseChainId(await provider.request({ method: "eth_chainId" }));
      return this.connectedState(accounts[0], chainId);
    } catch {
      return this.connectedState();
    }
  }

  async connectImToken(): Promise<LiveClientPairResult> {
    const provider = await this.initProvider();
    const accounts = asAccounts(
      await provider.request({ method: "eth_requestAccounts" }),
    );
    const chainId = parseChainId(await provider.request({ method: "eth_chainId" }));
    return this.connectedState(accounts[0], chainId);
  }

  async forward(request: LiveRequest): Promise<unknown> {
    if (!FORWARDABLE_METHODS.has(request.method)) {
      throw new Error(`${request.method} is not forwarded to imToken Web.`);
    }
    const provider = await this.initProvider();
    if (request.method !== "wallet_switchEthereumChain") {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: request.chain.hexChainId }],
      });
    }
    return provider.request({
      method: request.method,
      params: request.request.params as unknown[] | object | undefined,
    });
  }

  async switchChain(chainKey: DemoChainKey): Promise<LiveClientPairResult> {
    const chain = getLiveChainByKey(chainKey);
    if (!chain) throw new Error("IntentProof does not support that chain.");
    const provider = await this.initProvider();
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chain.hexChainId }],
    });
    const accounts = asAccounts(await provider.request({ method: "eth_accounts" }));
    return this.connectedState(accounts[0], chain.chainId);
  }

  async disconnect() {
    this.provider = undefined;
  }
}
