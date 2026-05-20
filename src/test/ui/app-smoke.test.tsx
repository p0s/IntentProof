// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/tokencore", () => ({
  initTokenCoreWasm: vi.fn().mockResolvedValue(undefined),
  createTokenCoreWallet: vi.fn(),
  signDraftTransaction: vi.fn().mockResolvedValue({
    rawTransaction: "0xsigned",
    txHash: "0xhash",
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

vi.mock("@mlc-ai/web-llm", () => ({
  CreateMLCEngine: vi.fn(async () => ({
    chat: {
      completions: {
        create: vi.fn(async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  headline: "Review the normalized request",
                  plainEnglishSummary:
                    "The local model reviewed the decoded IntentProof packet.",
                  userIntentMatch: "unclear",
                  mainRisks: ["Check the target and amount in imToken."],
                  questionsToAskBeforeSigning: ["Do you recognize this DApp?"],
                  whyPolicyDecisionMakesSense:
                    "IntentProof keeps deterministic policy as the authority.",
                  scamPatternHints: ["Unexpected approvals deserve extra review."],
                  confidence: "medium",
                }),
              },
            },
          ],
        })),
      },
    },
  })),
}));

import {
  buildFakeLiveRequests,
  FakeInboundClient,
  FakeSignerClient,
} from "../../lib/live/fakeLiveClients";
import { normalizeLiveRequest } from "../../lib/live/requestNormalizer";
import { buildUniversalRouterV3ExactInCalldata } from "../lib/uniswap-universal-router-fixtures";
import App from "../../ui/App";

describe("App smoke test", () => {
  const walletStorageKey = "tokencore-cli.tokencore-wallets";

  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  function seedLocalSigner() {
    window.localStorage.setItem(
      walletStorageKey,
      JSON.stringify([
        {
          id: "wallet-1",
          name: "testnet-signer",
          address: "0x7777777777777777777777777777777777777777",
          keystoreJson: "{}",
          publicKey: "0xpub",
          derivationPath: "m/44'/60'/0'/0/0",
          chainId: 11155111,
          createdAt: "2026-05-17T00:00:00.000Z",
        },
      ]),
    );
  }

  async function openSupportTool(name: string) {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name }));
    return user;
  }

  it("defaults to Protect Wallet as the product-first screen", () => {
    render(<App />);

    expect(
      screen.queryByRole("navigation", { name: "IntentProof product tabs" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Protect Wallet")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Protect your imToken before signing.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect imToken" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /Network/i })).toHaveValue("ethereum");
    expect(screen.getByRole("button", { name: /Auto theme/i })).toBeInTheDocument();
    expect(screen.queryByText(/Testnet by default/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Connect signer")).not.toBeInTheDocument();
    expect(screen.queryByText("Forward or reject")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Connect a DApp" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Request Inbox" })).toBeInTheDocument();
    expect(screen.getByText("No live DApp requests yet.")).toBeInTheDocument();
    expect(screen.queryByText("Copy integration link")).not.toBeInTheDocument();
    expect(screen.queryByText(/Partner DApps can open IntentProof/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Optional integration example/i)).toBeInTheDocument();
    expect(screen.queryByText("demo.vendor.example")).not.toBeInTheDocument();
    expect(screen.queryByText("swap.example")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Examples" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Token Core Lab" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Activity" })).not.toBeInTheDocument();
    expect(screen.getByTitle(/Ready\.|WalletConnect setup required/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close connections" })).not.toBeInTheDocument();
    expect(screen.queryByText("Preview Requests")).not.toBeInTheDocument();
    expect(screen.queryByText("Testnet Signing")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Paste URI/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /QR image/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Camera$/i })).not.toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "WalletConnect URI or QR screenshot" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Upload QR screenshot")).toBeInTheDocument();
    expect(
      screen.getByText(/Scan a DApp QR or paste its WalletConnect URI/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Add a WalletConnect connection to begin.")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Paste a WalletConnect URI, upload a QR screenshot/i),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Scan QR/i })).toBeInTheDocument();
    expect(screen.queryByText("DApp integration note")).not.toBeInTheDocument();
    expect(screen.queryByText("Copy integration link")).not.toBeInTheDocument();
    expect(screen.getByText(/Optional integration example/i)).toBeInTheDocument();
    expect(screen.queryByText("Verification Suite")).not.toBeInTheDocument();
    expect(screen.queryByText(/5\/5 scenarios/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Example request examples")).not.toBeInTheDocument();
    expect(screen.queryByText(/Wallet skill prototype/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Judge Demo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/fixture-safe demo/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Testnet only.")).not.toBeInTheDocument();
  });

  it("changes theme on the first theme-toggle click", async () => {
    const user = userEvent.setup();
    render(<App />);

    const shell = screen.getByRole("main");
    const initialTheme = shell.getAttribute("data-theme");
    await user.click(screen.getByRole("button", { name: /Toggle theme mode/i }));

    expect(shell.getAttribute("data-theme")).not.toBe(initialTheme);
  });

  it("shows setup-required live WalletConnect without breaking secondary support tools", async () => {
    render(<App liveClients={{ projectId: "" }} />);

    expect(screen.getAllByText("WalletConnect setup required").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Connect imToken" }),
    ).toBeEnabled();

    await openSupportTool("Open Examples");
    expect(screen.getByText("Five deterministic request outcomes")).toBeInTheDocument();
    expect(screen.getAllByText("Safe ERC-20 transfer").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unlimited approval").length).toBeGreaterThan(0);
    expect(screen.getAllByText("WETH wrap").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Swap route policy").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Bridge / chain mismatch").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Run example checks" }),
    ).toBeInTheDocument();

    await openSupportTool("Open Token Core Lab");
    expect(
      screen.getByText("Token Core signing with local testnet wallets"),
    ).toBeInTheDocument();
    expect(screen.getByText("Local wallet controls are hidden by default.")).toBeInTheDocument();
  });

  it("updates the imToken card after a successful connection", async () => {
    const user = userEvent.setup();
    render(<App liveClients={{ signer: new FakeSignerClient(), projectId: "test-project" }} />);

    await user.click(screen.getByRole("button", { name: "Connect imToken" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /0x7777/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: "Connect imToken" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /0x7777/i })).toBeEnabled();
  });

  it("lets users disconnect the connected imToken account", async () => {
    const user = userEvent.setup();
    render(
      <App
        liveClients={{
          signer: new FakeSignerClient(),
          inbound: new FakeInboundClient(),
          projectId: "test-project",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Connect imToken" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /0x7777/i })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: /0x7777/i }));
    await user.click(screen.getByRole("menuitem", { name: "Disconnect imToken" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Connect imToken" })).toBeInTheDocument(),
    );
    expect(
      screen.getByText("imToken disconnected. Connect again before forwarding DApp requests."),
    ).toBeInTheDocument();
  });

  it("requests imToken network switch from the top network selector", async () => {
    const user = userEvent.setup();
    const signer = new FakeSignerClient();
    const inbound = new FakeInboundClient();
    render(<App liveClients={{ signer, inbound, projectId: "test-project" }} />);

    await user.click(screen.getByRole("button", { name: "Connect imToken" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /0x7777/i })).toBeInTheDocument(),
    );
    await user.selectOptions(screen.getByLabelText("Network"), "base");

    await waitFor(() => expect(signer.switchedChains).toContain("base"));
    expect(inbound.activeChainUpdates).toContain("base");
    expect(
      screen.getByText("Base Mainnet selected in imToken. Connected DApps were notified."),
    ).toBeInTheDocument();
  });

  it("captures a routed WalletConnect URI and pairs after imToken connects", async () => {
    const user = userEvent.setup();
    window.history.pushState(
      {},
      "",
      "/connect?uri=wc%3Arouted-demo%402%3Frelay-protocol%3Dirn%26symKey%3Dabc",
    );
    render(
      <App
        liveClients={{
          signer: new FakeSignerClient(),
          inbound: new FakeInboundClient(),
          projectId: "test-project",
        }}
      />,
    );

    expect(window.location.pathname).toBe("/connect");
    expect(window.location.search).toBe("");
    expect(screen.getByText("DApp route detected")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Connect imToken to continue" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "WalletConnect URI or QR screenshot" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Connect imToken" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /0x7777/i })).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByTitle(/DApp connected/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole("region", { name: "Connected DApps" })).toBeInTheDocument();
    expect(screen.getByText("IntentProof Demo Merchant")).toBeInTheDocument();
    expect(screen.getByText(/merchant\.intentproof\.example/i)).toBeInTheDocument();
  });

  it("restores an imToken session before pairing a routed DApp URI", async () => {
    window.history.pushState(
      {},
      "",
      "/wc?uri=wc%3Arestored-demo%402%3Frelay-protocol%3Dirn%26symKey%3Dabc",
    );
    render(
      <App
        liveClients={{
          signer: new FakeSignerClient({ restoreOnLoad: true }),
          inbound: new FakeInboundClient(),
          projectId: "test-project",
        }}
      />,
    );

    expect(window.location.pathname).toBe("/wc");
    expect(window.location.search).toBe("");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /0x7777/i })).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByTitle(/DApp connected/i)).toBeInTheDocument(),
    );
    expect(screen.getByText("IntentProof Demo Merchant")).toBeInTheDocument();
  });

  it("shows multiple connected DApps when more than one session is active", async () => {
    const user = userEvent.setup();
    render(
      <App
        liveClients={{
          signer: new FakeSignerClient(),
          inbound: new FakeInboundClient({
            sessions: [
              {
                id: "uniswap-session",
                name: "Uniswap",
                url: "https://app.uniswap.org",
                chains: ["eip155:1"],
              },
              {
                id: "ens-session",
                name: "ENS App",
                url: "https://app.ens.domains",
                chains: ["eip155:1", "eip155:8453"],
              },
            ],
          }),
          projectId: "test-project",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Connect imToken" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /0x7777/i })).toBeInTheDocument(),
    );
    await user.type(
      screen.getByRole("textbox", { name: "WalletConnect URI or QR screenshot" }),
      "wc:multi-dapp-demo@2?relay-protocol=irn&symKey=abc",
    );
    await user.click(screen.getByRole("button", { name: "Connect DApp through IntentProof" }));

    await waitFor(() =>
      expect(screen.getByTitle(/2 DApps connected/i)).toBeInTheDocument(),
    );
    const panel = screen.getByRole("region", { name: "Connected DApps" });
    expect(within(panel).getByText("Uniswap")).toBeInTheDocument();
    expect(within(panel).getByText("ENS App")).toBeInTheDocument();
    expect(within(panel).getByText(/app\.uniswap\.org/i)).toBeInTheDocument();
    expect(within(panel).getByText(/app\.ens\.domains/i)).toBeInTheDocument();
  });

  it("captures WalletConnect URI from /wc and root query routes", () => {
    window.history.pushState(
      {},
      "",
      "/wc?uri=wc%3Awc-demo%402%3Frelay-protocol%3Dirn%26symKey%3Dabc",
    );
    const { unmount } = render(<App liveClients={{ projectId: "test-project" }} />);

    expect(window.location.pathname).toBe("/wc");
    expect(window.location.search).toBe("");
    expect(screen.getByText("DApp route detected")).toBeInTheDocument();
    unmount();

    window.history.pushState(
      {},
      "",
      "/?uri=wc%3Aroot-demo%402%3Frelay-protocol%3Dirn%26symKey%3Dabc",
    );
    render(<App liveClients={{ projectId: "test-project" }} />);
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("");
    expect(screen.getByText("DApp route detected")).toBeInTheDocument();
  });

  it("keeps manual URI paste visible and validates input", async () => {
    const user = userEvent.setup();
    render(<App liveClients={{ projectId: "test-project" }} />);

    await user.type(
      screen.getByRole("textbox", { name: "WalletConnect URI or QR screenshot" }),
      "https://bad",
    );

    expect(screen.getByText("WalletConnect URIs must start with wc:.")).toBeInTheDocument();
  });

  it("clears manual WalletConnect URI after DApp pairing starts", async () => {
    const user = userEvent.setup();
    render(
      <App
        liveClients={{
          signer: new FakeSignerClient(),
          inbound: new FakeInboundClient(),
          projectId: "test-project",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Connect imToken" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /0x7777/i })).toBeInTheDocument(),
    );
    const input = screen.getByRole("textbox", { name: "WalletConnect URI or QR screenshot" });
    await user.type(input, "wc:manual-demo@2?relay-protocol=irn&symKey=abc");
    await user.click(screen.getByRole("button", { name: "Connect DApp through IntentProof" }));

    await waitFor(() =>
      expect(screen.getByTitle(/DApp connected/i)).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("textbox", { name: "WalletConnect URI or QR screenshot" }),
    ).toHaveValue("");
  });

  it("accepts a pasted WalletConnect QR screenshot", async () => {
    render(<App liveClients={{ projectId: "test-project" }} />);

    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", {
      value: {
        items: [
          {
            kind: "file",
            type: "image/png",
            getAsFile: () => new File(["qr"], "walletconnect-qr.png", { type: "image/png" }),
          },
        ],
      },
    });
    window.dispatchEvent(paste);

    await waitFor(() =>
      expect(
        screen.getByText("WalletConnect URI detected from pasted screenshot."),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Connect imToken to continue" }),
    ).toBeInTheDocument();
  });

  it("keeps wallet-file import/export UI absent", async () => {
    render(<App />);
    await openSupportTool("Open Token Core Lab");

    expect(screen.queryByText(/Import existing wallet file/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/wallet-file/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Wallet JSON/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export" })).not.toBeInTheDocument();
  });

  it("shows a mainnet warning while high-impact approvals require review", async () => {
    const user = userEvent.setup();
    render(
      <App
        liveClients={{
          signer: new FakeSignerClient(),
          projectId: "test-project",
          initialRequests: buildFakeLiveRequests(),
        }}
      />,
    );

    await user.click(screen.getByText("swap.example"));
    expect(screen.getByLabelText("Mainnet warning")).toBeInTheDocument();
    expect(screen.queryByLabelText("Allow mainnet requests for this session")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forward to connected wallet" })).toBeDisabled();
    expect(screen.getAllByText("Risk High Impact").length).toBeGreaterThan(0);
    await user.click(
      screen.getByLabelText("I reviewed these details and want imToken to make the final signing decision."),
    );
    expect(screen.getByRole("button", { name: "Forward to connected wallet" })).toBeEnabled();
  });

  it("keeps populated live review surfaces evidence-first", async () => {
    const user = userEvent.setup();
    render(
      <App
        liveClients={{
          signer: new FakeSignerClient(),
          inbound: new FakeInboundClient(),
          projectId: "test-project",
          initialRequests: buildFakeLiveRequests(),
        }}
      />,
    );

    expect(screen.queryByText(/^PASS$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^WARN$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^BLOCK$/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Evidence /).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Risk /).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Review all open requests with local AI" })).toBeInTheDocument();
    expect(screen.getByLabelText("Local AI review")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run local AI check" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveTextContent("SmolLM2");

    await user.click(screen.getByText("sign.example"));
    await user.click(
      screen.getByLabelText("I reviewed these details and want imToken to make the final signing decision."),
    );
    await user.click(screen.getByRole("button", { name: "Forward to connected wallet" }));
    await openSupportTool("Open Activity");

    const liveReceiptSummary = screen.getByLabelText("Live receipt summary");
    expect(within(liveReceiptSummary).queryByText(/^PASS$/)).not.toBeInTheDocument();
    expect(within(liveReceiptSummary).queryByText(/^WARN$/)).not.toBeInTheDocument();
    expect(within(liveReceiptSummary).queryByText(/^BLOCK$/)).not.toBeInTheDocument();
    expect(liveReceiptSummary).toHaveTextContent(
      "Review · forwarded · Ethereum Sepolia",
    );
  });

  it("runs optional in-browser AI review without changing forwarding state", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window.navigator, "gpu", {
      value: {},
      configurable: true,
    });
    render(
      <App
        liveClients={{
          signer: new FakeSignerClient(),
          projectId: "test-project",
          initialRequests: buildFakeLiveRequests(),
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "Forward to connected wallet" })).toBeEnabled();
    await user.selectOptions(screen.getByRole("combobox", { name: "Model" }), "Qwen2.5-0.5B-Instruct-q4f16_1-MLC");
    await user.click(screen.getByRole("button", { name: "Run local AI check" }));

    expect(await screen.findByText("Review the normalized request")).toBeInTheDocument();
    expect(screen.getByText("The local model reviewed the decoded IntentProof packet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forward to connected wallet" })).toBeEnabled();
  });

  it("runs batch local AI review from the Request Inbox", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window.navigator, "gpu", {
      value: {},
      configurable: true,
    });
    render(
      <App
        liveClients={{
          signer: new FakeSignerClient(),
          projectId: "test-project",
          initialRequests: buildFakeLiveRequests(),
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Review all open requests with local AI" }));

    expect(
      await screen.findByText(
        /Open requests have readable review packets|request.*extra attention/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Local AI reviewed 3 normalized IntentProof packets/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forward to connected wallet" })).toBeEnabled();
  });

  it("labels and warning-gates decoded Uniswap Universal Router writes", () => {
    render(
      <App
        liveClients={{
          signer: new FakeSignerClient(),
          projectId: "test-project",
          initialRequests: [
            normalizeLiveRequest({
              id: "uniswap-swap",
              origin: "Uniswap",
              method: "eth_sendTransaction",
              params: [
                {
                  from: "0x7777777777777777777777777777777777777777",
                  to: "0x4c82d1fbfe28c977cbb58d8c7ff8fcf9f70a2cca",
                  value: "0x0",
                  data: buildUniversalRouterV3ExactInCalldata(),
                  chainId: "0x1",
                },
              ],
            }),
          ],
        }}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: /Uniswap.*Swap transaction.*Evidence high.*Risk needs-review/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Swap transaction (eth_sendTransaction)")).toBeInTheDocument();
    expect(screen.getByText("Decoded Universal Router route")).toBeInTheDocument();
    expect(screen.getAllByText("Evidence High").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Risk Needs Review").length).toBeGreaterThan(0);
    expect(screen.getByText("Evidence score")).toBeInTheDocument();
    expect(screen.getByText("What this request wants")).toBeInTheDocument();
    expect(
      screen.getAllByText("Universal Router command stream decoded into route evidence.").length,
    ).toBeGreaterThan(0);
  });

  it("rejects requests IntentProof cannot relay and never forwards them", async () => {
    const user = userEvent.setup();
    const signer = new FakeSignerClient();
    render(
      <App
        liveClients={{
          signer,
          projectId: "test-project",
          initialRequests: [
            normalizeLiveRequest({
              id: "unsafe-raw",
              origin: "legacy-wallet.example",
              method: "eth_sendRawTransaction",
              params: ["0xdeadbeef"],
              chainId: "eip155:1",
            }),
          ],
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: /legacy-wallet\.example.*eth_sendRawTransaction.*Risk blocked/i,
      }),
    );
    expect(screen.getAllByText("Risk Blocked").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Cannot relay with IntentProof" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Reject request" }));

    expect(signer.forwarded).toBe(0);
    expect(screen.getByText("Request rejected and not forwarded.")).toBeInTheDocument();
  });

  it("does not forward review-gated live requests until acknowledgement", async () => {
    const user = userEvent.setup();
    const signer = new FakeSignerClient();
    render(
      <App
        liveClients={{
          signer,
          projectId: "test-project",
          initialRequests: buildFakeLiveRequests(),
        }}
      />,
    );

    await user.click(screen.getByText("sign.example"));
    expect(screen.getAllByText("Risk Needs Review").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Forward to connected wallet" })).toBeDisabled();

    await user.click(
      screen.getByLabelText("I reviewed these details and want imToken to make the final signing decision."),
    );
    await user.click(screen.getByRole("button", { name: "Forward to connected wallet" }));

    expect(signer.forwarded).toBe(1);
    expect(signer.lastRequestId).toBe("fake-live-typed-data");
  });

  it("forwards routine live requests exactly once with the fake live client", async () => {
    const user = userEvent.setup();
    const signer = new FakeSignerClient();
    render(
      <App
        liveClients={{
          signer,
          projectId: "test-project",
          initialRequests: buildFakeLiveRequests(),
        }}
      />,
    );

    expect(screen.getAllByText("Risk Standard").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Forward to connected wallet" }));

    expect(signer.forwarded).toBe(1);
    expect(signer.lastRequestId).toBe("fake-live-safe-transfer");
    expect(screen.getByText("Request forwarded to imToken exactly once.")).toBeInTheDocument();
  });

  it("approves wallet coordination requests locally so DApps can continue", async () => {
    const user = userEvent.setup();
    const signer = new FakeSignerClient();
    render(
      <App
        liveClients={{
          signer,
          inbound: new FakeInboundClient(),
          projectId: "test-project",
          initialRequests: [
            normalizeLiveRequest({
              id: "fake-live-chain-switch",
              origin: "app.uniswap.org",
              method: "wallet_switchEthereumChain",
              params: [{ chainId: "0x1" }],
            }),
          ],
        }}
      />,
    );

    expect(screen.getAllByText("Switch to Ethereum Mainnet").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Network switch request (wallet_switchEthereumChain)"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Connect imToken" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /0x7777/i })).toBeInTheDocument(),
    );
    await user.click(
      screen.getByLabelText("I reviewed these details and want imToken to make the final signing decision."),
    );
    await user.click(screen.getByRole("button", { name: "Answer locally" }));

    expect(signer.forwarded).toBe(0);
    expect(signer.switchedChains).toContain("ethereum");
    expect(
      screen.getByText(
        "Wallet coordination request approved. The DApp can continue to the transaction request.",
      ),
    ).toBeInTheDocument();
    await openSupportTool("Open Activity");
    const liveReceiptSummary = screen.getByLabelText("Live receipt summary");
    expect(within(liveReceiptSummary).getByText("app.uniswap.org")).toBeInTheDocument();
    expect(liveReceiptSummary).toHaveTextContent("Review · resolved · Ethereum Mainnet");
  });

  it("answers wallet capability probes locally so DApps can send transaction requests", async () => {
    const signer = new FakeSignerClient();
    const inbound = new FakeInboundClient();
    render(
      <App
        liveClients={{
          signer,
          inbound,
          projectId: "test-project",
          initialRequests: [
            normalizeLiveRequest({
              id: "fake-live-capabilities",
              origin: "app.uniswap.org",
              method: "wallet_getCapabilities",
              params: [
                "0x7777777777777777777777777777777777777777",
                ["0x1", "0x2105"],
              ],
              chainId: "eip155:1",
            }),
          ],
        }}
      />,
    );

    expect(screen.queryByText("Wallet capability check")).not.toBeInTheDocument();
    expect(screen.getByText("No live DApp requests yet.")).toBeInTheDocument();
    expect(signer.forwarded).toBe(0);
    expect(inbound.approvedResults).toEqual([]);
    await openSupportTool("Open Activity");
    expect(screen.getByLabelText("Live receipt summary")).toHaveTextContent(
      "Routine · resolved · Ethereum Mainnet",
    );
  });

  it("enables Token Core signing only in Token Core Lab with a local signer and password", async () => {
    const user = userEvent.setup();
    seedLocalSigner();
    render(<App />);

    await openSupportTool("Open Token Core Lab");
    await waitFor(() =>
      expect(
        screen.getAllByText("Verification passed. Enter the local testnet wallet password.").length,
      ).toBeGreaterThan(0),
    );
    expect(screen.getByRole("button", { name: "Sticky Token Core sign" })).toBeDisabled();

    const signingToggles = screen.getAllByRole("button", {
      name: /Token Core Lab with Token Core.*Show controls/i,
    });
    await user.click(signingToggles[signingToggles.length - 1]!);
    await user.type(screen.getByLabelText("Local wallet password"), "test-pass");

    expect(screen.getByRole("button", { name: "Sticky Token Core sign" })).toBeEnabled();
  });

  it("shows local activity", async () => {
    render(<App />);
    await openSupportTool("Open Examples");
    await openSupportTool("Open Activity");

    expect(screen.getByRole("heading", { name: "Local non-secret activity" })).toBeInTheDocument();
    expect(screen.getByText("Show raw Token Core receipt")).toBeInTheDocument();
  });
});
