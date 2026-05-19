# Protect Wallet Live Mode

Protect Wallet is a routed WalletConnect mode for imToken users:

```text
DApp WalletConnect URI or QR
-> IntentProof pairs the DApp after imToken connects
-> IntentProof receives and verifies the request
-> PASS/WARN/BLOCK decision
-> safe request is forwarded to imToken for final signing
-> result or rejection is returned to the DApp session
```

IntentProof does not claim native imToken integration and cannot intercept DApps
opened directly inside imToken Browser. The DApp session must be routed through
IntentProof.

## DApp Connection

The primary user flow is the Connect a DApp card: paste a WalletConnect URI,
paste/upload a QR screenshot, or scan the WalletConnect QR shown by a DApp.
Partner/custom wallet routing is still supported as a secondary integration
path, but it is not promoted in the main product UI.

## Smartphone QR Flow

IntentProof can be opened directly on a smartphone browser. In that setup, the
user connects imToken as the final signer, then taps `Scan QR with camera` and
scans a WalletConnect QR displayed by a DApp on a desktop or another device.

If the DApp is running on the same phone, use partner/custom wallet routing,
paste/upload a QR screenshot, or paste the WalletConnect URI. A phone camera
cannot scan a QR that is only visible on the same screen.

## Supported Methods

- `eth_sendTransaction`
- `personal_sign`
- `eth_signTypedData_v4`
- `wallet_switchEthereumChain`
- `eth_accounts`
- `eth_chainId`

Unsupported or unsafe methods are blocked by default:

- `eth_sign`
- `eth_signTransaction`
- `eth_sendRawTransaction`
- unknown methods

## Chain Support

- Ethereum Mainnet: `eip155:1`
- Base Mainnet: `eip155:8453`
- Sepolia: `eip155:11155111`
- Base Sepolia: `eip155:84532`

Testnet remains default. Mainnet requests show a visible warning and are forwarded to
imToken only; IntentProof does not locally sign or broadcast mainnet
transactions.

## Security Rules

- imToken remains the final signer.
- Token Core remains the testnet signing and transaction-evidence layer.
- BLOCK requests are never forwarded.
- WARN requests require explicit acknowledgement.
- Mainnet unlimited approvals are blocked.
- Undecodable mainnet transaction calldata is blocked.
- Full target addresses are shown before forwarding.
- No mnemonics, private keys, keystores, or production passwords are requested.
- `VITE_WALLETCONNECT_PROJECT_ID` is public and optional.

## Hosted Behavior

If `VITE_WALLETCONNECT_PROJECT_ID` is absent, Protect Wallet shows
setup-required for live pairing. Preview Requests and Testnet Signing continue
to work without environment variables.
