import type { Address } from "viem";

import { buildLiveAccount } from "./chainConfig";
import { normalizeLiveRequest } from "./requestNormalizer";
import type { DemoChainKey } from "../types";
import type {
  LiveClientPairResult,
  LiveInboundClient,
  LiveRequest,
  LiveSessionAccount,
  LiveSignerClient,
} from "./types";

const DEMO_ACCOUNT =
  "0x7777777777777777777777777777777777777777" as Address;

export function buildFakeLiveRequests(): LiveRequest[] {
  return [
    normalizeLiveRequest({
      id: "fake-live-safe-transfer",
      origin: "demo.vendor.example",
      method: "eth_sendTransaction",
      params: [
        {
          from: DEMO_ACCOUNT,
          to: "0x1111111111111111111111111111111111111111",
          value: "0x0",
          data: "0xa9059cbb000000000000000000000000111111111111111111111111111111111111111100000000000000000000000000000000000000000000000000000000004c4b40",
          chainId: "0xaa36a7",
        },
      ],
    }),
    normalizeLiveRequest({
      id: "fake-live-mainnet-approval",
      origin: "swap.example",
      method: "eth_sendTransaction",
      params: [
        {
          from: DEMO_ACCOUNT,
          to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
          value: "0x0",
          data: "0x095ea7b30000000000000000000000009999999999999999999999999999999999999999ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
          chainId: "0x1",
        },
      ],
    }),
    normalizeLiveRequest({
      id: "fake-live-typed-data",
      origin: "sign.example",
      method: "eth_signTypedData_v4",
      params: [
        DEMO_ACCOUNT,
        JSON.stringify({ domain: { name: "IntentProof Demo" }, message: {} }),
      ],
      chainId: "0xaa36a7",
    }),
  ];
}

export class FakeInboundClient implements LiveInboundClient {
  activeChainUpdates: DemoChainKey[] = [];
  approvedResults: unknown[] = [];

  async restoreSession(account: LiveSessionAccount): Promise<LiveClientPairResult> {
    return {
      ok: true,
      state: {
        status: "connected",
        label: "DApp connected",
        detail: "Fake DApp session restored for deterministic tests.",
        account,
      },
    };
  }

  async connectDapp(_uri: string, account: LiveSessionAccount): Promise<LiveClientPairResult> {
    return {
      ok: true,
      state: {
        status: "connected",
        label: "DApp connected",
        detail: "Fake DApp session connected for deterministic tests.",
        account,
      },
    };
  }

  async updateActiveChain(_account: LiveSessionAccount, chainKey: DemoChainKey): Promise<void> {
    this.activeChainUpdates.push(chainKey);
  }

  async approveRequest(_request: LiveRequest, result: unknown): Promise<void> {
    this.approvedResults.push(result);
    return;
  }

  async rejectRequest(): Promise<void> {
    return;
  }
}

export class FakeSignerClient implements LiveSignerClient {
  forwarded = 0;
  lastRequestId?: string;
  switchedChains: DemoChainKey[] = [];
  private readonly options: { restoreOnLoad?: boolean };

  constructor(options: { restoreOnLoad?: boolean } = {}) {
    this.options = options;
  }

  async connectImToken(): Promise<LiveClientPairResult> {
    return {
      ok: true,
      state: {
        status: "connected",
        label: "imToken connected",
        detail: "Fake imToken signer connected for deterministic tests.",
        account: buildLiveAccount(DEMO_ACCOUNT),
      },
    };
  }

  async restoreSession(): Promise<LiveClientPairResult> {
    if (!this.options.restoreOnLoad) {
      return {
        ok: false,
        state: {
          status: "idle",
          label: "Ready to connect imToken",
          detail: "Connect imToken through WalletConnect for final signing.",
        },
      };
    }
    return this.connectImToken();
  }

  async forward(request: LiveRequest): Promise<unknown> {
    this.forwarded += 1;
    this.lastRequestId = request.id;
    if (request.method === "eth_chainId") return request.chain.hexChainId;
    if (request.method === "eth_accounts" || request.method === "eth_requestAccounts") {
      return [DEMO_ACCOUNT];
    }
    return "0xfake-imtoken-result";
  }

  async switchChain(chainKey: DemoChainKey): Promise<LiveClientPairResult> {
    this.switchedChains.push(chainKey);
    return this.connectImToken();
  }
}
