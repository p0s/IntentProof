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
IntentProof Tx Guard protects imToken before signing. A DApp routes requests through IntentProof, Token Core verifies the actual request, and imToken remains the final signer.
```

### 10-22s - Connect Flow

Show the top-right imToken account control, Connect a DApp, single-choice QR/URI modes, and Request Inbox.

Narration:

```text
The flow is simple: connect imToken from the account control, connect a DApp, review the incoming request, then forward or reject based on PASS, WARN, or BLOCK.
```

### 22-32s - Demo DApp Launch

Open `/demo-dapp`, click `Connect protected wallet`, and show `Open in IntentProof`.

Narration:

```text
Partner DApps can add IntentProof as a custom wallet option. The DApp opens IntentProof with a WalletConnect URI, so users do not manually paste anything.
```

### 32-43s - PASS Forwarding

Select the safe Sepolia transfer request.

Narration:

```text
This request is a readable ERC-20 transfer on Sepolia. It matches policy, so IntentProof can forward the exact request to imToken for final signing.
```

### 43-55s - Mainnet Guard BLOCK

Select the mainnet unlimited approval request.

Narration:

```text
Mainnet forwarding is opt-in and stricter. This request asks for unlimited USDC approval, so IntentProof blocks it and does not forward it.
```

### 55-64s - WARN Acknowledgement

Select the typed-data request.

Narration:

```text
Human-readable signatures require user review. WARN requests cannot be forwarded until the user acknowledges the warning.
```

### 64-76s - Examples

Open Examples and run example checks.

Narration:

```text
Examples show five deterministic outcomes without API keys: safe transfer, unlimited approval, WETH wrap, swap policy, and bridge or chain mismatch.
```

### 76-86s - Token Core Lab

Open Token Core Lab and show collapsed local Token Core controls.

Narration:

```text
Local Token Core signing is testnet-only. Users create a fresh Sepolia or Base Sepolia wallet, enter its local password, and broadcast only if they explicitly choose to.
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
