# WalletGuide notes

WalletGuide-style listing is the long-term way for IntentProof to appear as a
wallet option in arbitrary WalletConnect/Reown DApp modals.

## Current hackathon path

The repository supports the product flow immediately through QR scan,
QR screenshot upload/paste, manual WalletConnect URI paste, and secondary
partner/custom DApp routing.

The companion `/demo-dapp` route is a small integration example and is not part
of the primary product flow.

## What WalletGuide would add

- IntentProof appears in more DApp wallet modals without per-DApp custom config.
- DApps can hand off WalletConnect pairing to IntentProof as a web wallet.
- Users avoid manual copy/paste and scan fewer QR codes.

## Boundaries

- WalletGuide approval is not required for the hackathon demo.
- Until listing approval, DApps must add IntentProof as a custom wallet entry or
  users must scan/upload/paste the WalletConnect URI.
- Direct DApp-to-imToken sessions bypass IntentProof.
- IntentProof is not a native imToken extension and does not intercept imToken
  Browser traffic.
