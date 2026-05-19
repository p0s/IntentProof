# Reown / WalletConnect setup

Codex should not handle dashboard credentials. Use these manual steps if the
dashboard is not already authenticated.

## Project

1. Open the Reown / WalletConnect dashboard.
2. Create or locate a project named `IntentProof Tx Guard`.
3. Choose `Wallet` if the dashboard asks for a project type.
4. If the dashboard requires a separate DApp project, create
   `IntentProof Demo DApp` as an app project. Otherwise one Project ID is enough.
5. Copy the Project ID.
6. Put it only in local or deployment environment variables:

```env
VITE_WALLETCONNECT_PROJECT_ID=
```

This value is public client configuration, not a server secret. Do not commit a
real value to source files.

## Origins

Allow only the origins needed for development and deployment:

```text
https://intentproof.xyz
https://www.intentproof.xyz
https://intentproof-tx-guard.vercel.app
http://localhost:5173
```

Add specific Vercel preview origins only when testing those previews. Avoid
wildcard or unrelated domains.

## Wallet profile metadata

Use:

```text
Name: IntentProof Tx Guard
Website: https://www.intentproof.xyz
Description: A WalletConnect transaction firewall that verifies AI/DApp requests before imToken signs.
Platform: Web
Chains: Ethereum, Base, Sepolia, Base Sepolia
```

## Local and hosted behavior

- Preview Requests work with no Project ID.
- Testnet Signing works with no Project ID.
- Protect Wallet live pairing shows setup-required with no Project ID.
- Mainnet review/forwarding shows a warning and is forwarded to imToken only.
- Local browser mainnet signing is not implemented and must not be added.
