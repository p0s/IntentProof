// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/tokencore", () => ({
  initTokenCoreWasm: vi.fn().mockResolvedValue(undefined),
  createTokenCoreWallet: vi.fn(),
  signDraftTransaction: vi.fn().mockResolvedValue({
    rawTransaction: "0xsigned",
    txHash: "0xhash",
  }),
  signTokenCoreMessage: vi.fn().mockResolvedValue({
    signature: "0xsignature",
    signatureType: "PersonalSign",
  }),
  broadcastSignedTransaction: vi.fn(),
}));

vi.mock("../../lib/ai", () => ({
  generateAiSummary: vi.fn(),
  buildFallbackAiSummary: vi.fn().mockReturnValue("AI summary unavailable"),
}));

vi.mock("../../lib/simulate", () => ({
  simulateTransaction: vi.fn().mockResolvedValue({
    success: true,
    source: "heuristic",
    summary: "mock simulation",
    tokenChanges: [],
  }),
}));

vi.mock("../../lib/uniswap", () => ({
  quoteEthToTokenSwap: vi.fn(),
}));

vi.mock("@zxing/browser", () => ({
  BrowserQRCodeReader: class {
    decodeFromImageUrl() {
      return Promise.resolve({
        getText: () => "wc:pasted-demo@2?relay-protocol=irn&symKey=abc",
      });
    }

    decodeFromVideoDevice() {
      return Promise.resolve({ stop: vi.fn() });
    }
  },
}));

import { FakeInboundClient, FakeSignerClient } from "../../lib/live/fakeLiveClients";
import { normalizeLiveRequest } from "../../lib/live/requestNormalizer";
import type { LiveRequest } from "../../lib/live/types";
import App from "../../ui/App";

const account = "0x7777777777777777777777777777777777777777";
const usdc = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const maxUint256 =
  "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

function addressWord(address: string) {
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function uintWord(value: bigint) {
  return value.toString(16).padStart(64, "0");
}

function approveData(spender: string, amount: bigint | "max") {
  return `0x095ea7b3${addressWord(spender)}${amount === "max" ? maxUint256 : uintWord(amount)}`;
}

function topDappHarnessRequests(): LiveRequest[] {
  return [
    normalizeLiveRequest({
      id: "tokenlon-accounts",
      origin: "tokenlon.im",
      method: "eth_accounts",
      chainId: "eip155:1",
    }),
    normalizeLiveRequest({
      id: "one-inch-sign",
      origin: "1inch.com",
      method: "personal_sign",
      params: ["0x5369676e20696e746f2031696e6368", account],
      chainId: "eip155:1",
    }),
    normalizeLiveRequest({
      id: "curve-max-approval",
      origin: "curve.fi",
      method: "eth_sendTransaction",
      params: [
        {
          from: account,
          to: usdc,
          value: "0x0",
          data: approveData("0x9999999999999999999999999999999999999999", "max"),
          chainId: "0x1",
        },
      ],
    }),
    normalizeLiveRequest({
      id: "lido-stake-submit",
      origin: "lido.fi",
      method: "eth_sendTransaction",
      params: [
        {
          from: account,
          to: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
          value: "0x2386f26fc10000",
          data: "0xa1903eab0000000000000000000000000000000000000000000000000000000000000000",
          chainId: "0x1",
        },
      ],
    }),
    normalizeLiveRequest({
      id: "ens-typed-data",
      origin: "app.ens.domains",
      method: "eth_signTypedData_v4",
      params: [
        account,
        JSON.stringify({
          domain: { name: "ENS", chainId: 1 },
          message: { name: "intentproof.eth" },
          primaryType: "Register",
          types: { Register: [{ name: "name", type: "string" }] },
        }),
      ],
      chainId: "eip155:1",
    }),
    normalizeLiveRequest({
      id: "sushi-limited-approval",
      origin: "sushi.com",
      method: "eth_sendTransaction",
      params: [
        {
          from: account,
          to: usdc,
          value: "0x0",
          data: approveData("0x1111111111111111111111111111111111111111", 5_000_000n),
          chainId: "0x1",
        },
      ],
    }),
    normalizeLiveRequest({
      id: "compound-capabilities",
      origin: "compound.finance",
      method: "wallet_getCapabilities",
      params: [account, ["0x1", "0x2105"]],
      chainId: "eip155:1",
    }),
    normalizeLiveRequest({
      id: "aave-switch",
      origin: "app.aave.com",
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x1" }],
    }),
  ];
}

describe("top dapp WalletConnect E2E harness", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("loads named top-dapp requests into the real Request Inbox", () => {
    render(
      <App
        liveClients={{
          projectId: "test-project",
          initialRequests: topDappHarnessRequests(),
        }}
      />,
    );

    expect(screen.getByText("6 request(s)")).toBeInTheDocument();
    for (const sourceLabel of [
      "1inch",
      "Curve",
      "Lido",
      "ENS",
      "Sushi",
      "Aave",
    ]) {
      expect(screen.getAllByText(sourceLabel).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText("tokenlon.im")).not.toBeInTheDocument();
    expect(screen.queryByText("compound.finance")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Evidence /).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Risk /).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Mainnet request uses real assets or account authority.").length).toBeGreaterThan(0);
  });

  it("proves cannot-relay, review, routine, and coordination behavior without third-party URI handoff", async () => {
    const user = userEvent.setup();
    const signer = new FakeSignerClient();
    const inbound = new FakeInboundClient();
    render(
      <App
        liveClients={{
          signer,
          inbound,
          projectId: "test-project",
          initialRequests: topDappHarnessRequests(),
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: /Curve.*USDC approval.*Risk high-impact/i,
      }),
    );
    expect(screen.getAllByText("Risk High Impact").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Forward to imToken Web" })).toBeDisabled();
    await user.click(
      screen.getByLabelText("I reviewed these details and want the selected signer to continue."),
    );
    expect(screen.getByRole("button", { name: "Forward to imToken Web" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Reject request" }));
    expect(signer.forwarded).toBe(0);

    await user.click(
      screen.getByRole("button", {
        name: /1inch.*Message signature.*Risk needs-review/i,
      }),
    );
    expect(screen.getAllByText("Risk Needs Review").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Forward to imToken Web" })).toBeDisabled();
    await user.click(
      screen.getByLabelText("I reviewed these details and want the selected signer to continue."),
    );
    await user.click(screen.getByRole("button", { name: "Forward to imToken Web" }));
    expect(signer.forwarded).toBe(1);
    expect(signer.lastRequestId).toBe("one-inch-sign");

    expect(screen.queryByText("compound.finance")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: /Sushi.*USDC approval.*Risk needs-review/i,
      }),
    );
    await user.click(
      screen.getByLabelText("I reviewed these details and want the selected signer to continue."),
    );
    await user.click(screen.getByRole("button", { name: "Forward to imToken Web" }));
    await waitFor(() => expect(signer.forwarded).toBe(2));
    expect(signer.lastRequestId).toBe("sushi-limited-approval");
    expect(inbound.approvedResults).toEqual([
      "0xfake-imtoken-result",
      "0xfake-imtoken-result",
    ]);
  });
});
