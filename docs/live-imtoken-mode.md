# Protect Wallet Live Mode

Protect Wallet is a routed WalletConnect mode for imToken users:

```text
DApp WalletConnect URI or QR
-> IntentProof pairs the DApp after the selected signer is available
-> IntentProof receives and explains the request
-> evidence confidence, risk, execution, and action state
-> reviewable request is forwarded to imToken Web, signed by Local Token Core Vault, or forwarded to a fallback wallet
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
user connects imToken Web or prepares a Local Token Core Vault, then taps `Scan QR with camera` and
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

Unsupported or unsafe methods are not relayed by default:

- `eth_sign`
- `eth_signTransaction`
- `eth_sendRawTransaction`
- unknown methods

## Chain Support

- Ethereum Mainnet: `eip155:1`
- Base Mainnet: `eip155:8453`
- Sepolia: `eip155:11155111`
- Base Sepolia: `eip155:84532`

Ethereum mainnet is the default live review network. Mainnet requests show a
visible warning. imToken Web and WalletConnect fallback keep custody in the
external signer. Local Token Core Vault mainnet signing is disabled by default
and requires explicit session opt-in, vault unlock, acknowledgement, and a
non-blocked request.

## Security Rules

- imToken Web remains the primary external signer.
- Local Token Core Vault is a first-class Token Core signer and stores only
  encrypted keystore data in this browser.
- Token Core remains the testnet lab and transaction-evidence layer.
- Requests IntentProof cannot mediate are never forwarded.
- Unusual or incomplete evidence requires explicit acknowledgement.
- Evidence confidence is separate from risk: a recognized DApp or decoded
  contract can still require review.
- Routine account, chain, and capability requests are answered locally and
  moved to Activity.
- Mainnet unlimited approvals are highlighted as high-impact permissions.
- Undecodable mainnet transaction calldata is shown as incomplete evidence.
- Full target addresses are shown before forwarding.
- No mnemonics, private keys, keystores, or production passwords are requested.
- `VITE_WALLETCONNECT_PROJECT_ID` is public and optional.

## Hosted Behavior

If `VITE_WALLETCONNECT_PROJECT_ID` is absent, Protect Wallet shows
setup-required for live pairing. Preview Requests and Testnet Signing continue
to work without environment variables.
