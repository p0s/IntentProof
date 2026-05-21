# DEMO_SCRIPT.md - IntentProof Tx Guard

Target length: 60-90 seconds. Keep the exported video under 20 MB.

## Recording Safety

- Use Protect Wallet preview requests or a fresh local testnet wallet only.
- Do not show real assets.
- Do not show seed phrases, private keys, passwords, `.env`, local logs, local
  paths, or personal data.
- If using Token Core Lab, show only a generated testnet wallet.

## Script

### 0-10s - Product Promise

Show Protect Wallet.

Narration:

```text
IntentProof Tx Guard protects wallet signing. A DApp routes requests through IntentProof, Token Core evidence explains the actual request, and the user chooses imToken Web, Local Token Core Vault, or another wallet as signer.
```

### 10-22s - Connect Flow

Show the signer selector, top-right signer control, Connect a DApp, QR/URI intake, and Request Inbox.

Narration:

```text
The flow is simple: choose a signer, connect a DApp, then review incoming request evidence before forwarding to imToken Web or signing with the Local Token Core Vault.
```

### 22-32s - Demo DApp Launch

Open `/demo-dapp`, click `Connect protected wallet`, and show `Open in IntentProof`.

Narration:

```text
Partner DApps can add IntentProof as a custom wallet option. The DApp opens IntentProof with a WalletConnect URI, so users do not manually paste anything.
```

### 32-43s - Routine Request

Select the safe Sepolia transfer request.

Narration:

```text
This request is a readable ERC-20 transfer on Sepolia. IntentProof shows the decoded action, addresses, value, evidence confidence, risk, and execution status before continuing with the selected signer.
```

### 43-55s - Mainnet Approval Review

Select the mainnet unlimited approval request.

Narration:

```text
Mainnet requests show a compact warning. This request asks for unlimited USDC approval, so IntentProof keeps evidence confidence separate from high-impact risk and requires explicit review before any relay or local vault signing.
```

### 55-64s - Transaction Understanding

Show a Uniswap or Lido request in the inbox.

Narration:

```text
IntentProof combines ABI metadata, protocol decoders, simulation, policy, and optional local AI. ABI decode explains the method, while protocol decoders explain router commands such as Uniswap swaps and Lido staking.
```

### 64-72s - Signature Review

Select the typed-data request.

Narration:

```text
Human-readable signatures require user review. IntentProof shows the payload and waits for acknowledgement before sending it to imToken.
```

### 72-82s - Examples

Open Examples and run example checks.

Narration:

```text
Examples show five deterministic outcomes without API keys: safe transfer, unlimited approval, WETH wrap, swap policy, and bridge or chain mismatch.
```

### 82-90s - Token Core Lab

Show the Local Token Core Vault card, then open Token Core Lab and show collapsed local Token Core controls.

Narration:

```text
The Local Token Core Vault is a real Token Core signer with encrypted local storage and session unlock. Token Core Lab remains the preserved testnet proof path for fresh Sepolia or Base Sepolia wallets and explicit broadcast.
```

### 86-90s - Activity And Boundaries

Open Activity.

Narration:

```text
IntentProof saves non-secret local activity. It is not a native imToken extension, and direct DApp-to-imToken sessions bypass it.
```

## Compression Tip

```bash
ffmpeg -i input.mp4 -vf "scale=1280:-2" -r 30 -c:v libx264 -crf 30 -preset slow -c:a aac -b:a 96k intentproof-demo.mp4
```
