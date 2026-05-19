import { useMemo, useRef, useState } from "react";

type DemoRequestId =
  | "pay-usdc"
  | "approval"
  | "wrap"
  | "swap"
  | "bridge"
  | "typed-data";

type SignClientLike = {
  connect: (params: unknown) => Promise<{
    uri?: string;
    approval: () => Promise<{ topic: string }>;
  }>;
  request: (params: {
    topic: string;
    chainId: string;
    request: { method: string; params?: unknown };
  }) => Promise<unknown>;
};

interface DemoDappScreenProps {
  projectId: string;
  projectIdPresent: boolean;
}

const demoRequests: Record<
  DemoRequestId,
  {
    label: string;
    method: string;
    chainId: string;
    params: unknown;
  }
> = {
  "pay-usdc": {
    label: "Pay 5 test USDC",
    method: "eth_sendTransaction",
    chainId: "eip155:11155111",
    params: [
      {
        from: "0x7777777777777777777777777777777777777777",
        to: "0x1111111111111111111111111111111111111111",
        value: "0x0",
        data: "0xa9059cbb000000000000000000000000111111111111111111111111111111111111111100000000000000000000000000000000000000000000000000000000004c4b40",
        chainId: "0xaa36a7",
      },
    ],
  },
  approval: {
    label: "Request unlimited approval",
    method: "eth_sendTransaction",
    chainId: "eip155:11155111",
    params: [
      {
        from: "0x7777777777777777777777777777777777777777",
        to: "0x1111111111111111111111111111111111111111",
        value: "0x0",
        data: "0x095ea7b30000000000000000000000009999999999999999999999999999999999999999ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        chainId: "0xaa36a7",
      },
    ],
  },
  wrap: {
    label: "Wrap 0.01 ETH",
    method: "eth_sendTransaction",
    chainId: "eip155:11155111",
    params: [
      {
        from: "0x7777777777777777777777777777777777777777",
        to: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14",
        value: "0x2386f26fc10000",
        data: "0xd0e30db0",
        chainId: "0xaa36a7",
      },
    ],
  },
  swap: {
    label: "Propose swap route",
    method: "eth_sendTransaction",
    chainId: "eip155:1",
    params: [
      {
        from: "0x7777777777777777777777777777777777777777",
        to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        value: "0x0",
        data: "0x095ea7b30000000000000000000000009999999999999999999999999999999999999999ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        chainId: "0x1",
      },
    ],
  },
  bridge: {
    label: "Propose bridge route",
    method: "wallet_switchEthereumChain",
    chainId: "eip155:8453",
    params: [{ chainId: "0x2105" }],
  },
  "typed-data": {
    label: "Sign typed data",
    method: "eth_signTypedData_v4",
    chainId: "eip155:11155111",
    params: [
      "0x7777777777777777777777777777777777777777",
      JSON.stringify({
        domain: { name: "IntentProof Demo Merchant" },
        message: { action: "confirm protected checkout" },
      }),
    ],
  },
};

function createFallbackPairingUri() {
  return `wc:intentproof-demo-merchant@2?relay-protocol=irn&symKey=${"a".repeat(64)}`;
}

export function DemoDappScreen({
  projectId,
  projectIdPresent,
}: DemoDappScreenProps) {
  const clientRef = useRef<SignClientLike | undefined>(undefined);
  const [pairingUri, setPairingUri] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [sessionTopic, setSessionTopic] = useState("");
  const [status, setStatus] = useState(
    projectIdPresent
      ? "Ready to create a WalletConnect pairing."
      : "Live WalletConnect needs VITE_WALLETCONNECT_PROJECT_ID. This screen still shows the custom wallet route.",
  );
  const [modalOpen, setModalOpen] = useState(false);

  const intentProofUrl = useMemo(() => {
    if (!pairingUri) return "/wc";
    return `/wc?uri=${encodeURIComponent(pairingUri)}`;
  }, [pairingUri]);

  async function setPairingPresentation(uri: string) {
    setPairingUri(uri);
    const QRCode = await import("qrcode");
    setQrDataUrl(await QRCode.toDataURL(uri, { margin: 1, width: 220 }));
    setModalOpen(true);
  }

  async function handleConnectProtectedWallet() {
    setStatus("Creating WalletConnect pairing for IntentProof.");
    if (!projectIdPresent) {
      await setPairingPresentation(createFallbackPairingUri());
      return;
    }
    try {
      const [{ SignClient }, { Core }] = await Promise.all([
        import("@walletconnect/sign-client"),
        import("@walletconnect/core"),
      ]);
      const client = (clientRef.current ??
        (await SignClient.init({
          core: new Core({ projectId }),
          metadata: {
            name: "IntentProof Demo Merchant",
            description:
              "Demo merchant that routes WalletConnect requests through IntentProof.",
            url: window.location.origin,
            icons: [`${window.location.origin}/intentproof-mark.svg`],
          },
        }))) as SignClientLike;
      clientRef.current = client;
      const { uri, approval } = await client.connect({
        optionalNamespaces: {
          eip155: {
            methods: [
              "eth_sendTransaction",
              "personal_sign",
              "eth_signTypedData_v4",
              "wallet_switchEthereumChain",
              "eth_accounts",
              "eth_chainId",
            ],
            chains: ["eip155:11155111", "eip155:84532", "eip155:1", "eip155:8453"],
            events: ["accountsChanged", "chainChanged"],
          },
        },
      });
      if (!uri) {
        setStatus("WalletConnect pairing already exists. Use the request buttons.");
        return;
      }
      await setPairingPresentation(uri);
      void approval()
        .then((session) => {
          setSessionTopic(session.topic);
          setStatus("IntentProof connected. Send a demo request.");
        })
        .catch((error: unknown) => {
          setStatus(error instanceof Error ? error.message : "WalletConnect approval failed.");
        });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not start WalletConnect.");
    }
  }

  async function handleSendRequest(requestId: DemoRequestId) {
    const client = clientRef.current;
    const request = demoRequests[requestId];
    if (!client || !sessionTopic) {
      setStatus("Connect protected wallet first. IntentProof must approve the session.");
      return;
    }
    setStatus(`Sending ${request.label} through IntentProof.`);
    try {
      const result = await client.request({
        topic: sessionTopic,
        chainId: request.chainId,
        request: {
          method: request.method,
          params: request.params,
        },
      });
      setStatus(
        typeof result === "string"
          ? `IntentProof returned ${result.slice(0, 18)}...`
          : "IntentProof returned a response.",
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "IntentProof rejected the request.");
    }
  }

  return (
    <main className="intentproof-shell demo-dapp-shell" data-theme="light">
      <section className="demo-dapp-hero">
        <span className="brand-mark" aria-hidden="true">
          IP
        </span>
        <p className="eyebrow">Companion demo DApp</p>
        <h1>IntentProof Demo Merchant</h1>
        <p>
          A small test DApp that opens IntentProof from a custom wallet entry.
          It is not a real third-party DApp.
        </p>
        <div className="dapp-connection-actions">
          <button type="button" className="primary-action" onClick={() => void handleConnectProtectedWallet()}>
            Connect protected wallet
          </button>
          <a className="button-secondary" href="/">
            Back to IntentProof
          </a>
        </div>
      </section>

      <section className="surface demo-dapp-panel">
        <h2>Demo requests</h2>
        <p>
          These deterministic requests exercise the same PASS/WARN/BLOCK
          pipeline used by Protect Wallet.
        </p>
        <div className="demo-request-grid">
          {(Object.keys(demoRequests) as DemoRequestId[]).map((requestId) => (
            <button
              key={requestId}
              type="button"
              onClick={() => void handleSendRequest(requestId)}
            >
              {demoRequests[requestId].label}
            </button>
          ))}
        </div>
        <div className="live-status">
          <strong>Connection status</strong>
          <span>{status}</span>
        </div>
      </section>

      {modalOpen ? (
        <section className="demo-wallet-modal" aria-label="Demo DApp wallet modal">
          <div className="surface demo-wallet-sheet">
            <h2>Choose wallet</h2>
            <p>
              Custom wallet entry for the hackathon demo. WalletGuide listing
              would make this appear in arbitrary DApp modals later.
            </p>
            {qrDataUrl ? <img src={qrDataUrl} alt="WalletConnect QR" /> : null}
            <a className="primary-action" href={intentProofUrl} target="_blank" rel="noreferrer">
              Open in IntentProof
            </a>
            <button
              type="button"
              className="button-secondary"
              onClick={() => void navigator.clipboard?.writeText(pairingUri)}
            >
              Copy WalletConnect URI
            </button>
            <button type="button" className="button-secondary" onClick={() => setModalOpen(false)}>
              Close
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
