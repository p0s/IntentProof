# SUBMISSION_FORM_DRAFT.md

Use this as the starting point for the imToken submission form.

## Section 1 — Project Submission

### Contact email

Fill manually.

### imToken address

Fill manually with an Ethereum address only. Do not paste a seed phrase, private key, password, or generated wallet file.

### Discord ID / nickname

Fill manually.

### Project title

```text
IntentProof Tx Guard
```

20 characters; under the 30-character limit.

### Project description

```text
IntentProof Tx Guard routes DApp requests through a Token Core-powered review layer before imToken Web, a Local Token Core Vault, or another wallet signs. It explains calldata, approvals, routes, and simulation evidence.
```

### Project category

Primary:

```text
AI wallet
```

If multi-select is allowed, also select:

```text
Security and self-custody
On-chain use cases
Wallet experience
```

### Completion status

```text
Testnet-ready
```

### Project format

Primary:

```text
Web wallet
```

If multi-select is allowed, also select:

```text
Skill
Website
```

### Demo link

```text
https://www.intentproof.xyz
```

Hosted app defaults to Protect Wallet. Examples and Token Core Lab work without
secrets or generated wallets.

Companion demo DApp:

```text
https://www.intentproof.xyz/demo-dapp
```

### Demo video upload

Upload a 60-90 second video under 20 MB. Use `DEMO_SCRIPT.md`.

### Token Core usage notes

```text
Built from the official Token Core CLI demo branch at token-core/tcx-examples/cli. IntentProof uses @consenlabs/tcx-wasm for the Local Token Core Vault, encrypted keystore wallet creation, account derivation, local signing, Token Core Lab testnet signing, transaction templates, analyze/decode, policy pre-checks, and Sepolia/Base Sepolia support. imToken Connect is used for the imToken Web signer path. A lightweight Token UI-inspired layer and Security Skill guidance are documented.
```

### GitHub code / repo link

```text
https://github.com/p0s/IntentProof
```

### Security confirmation

Check only after confirming:

- no seed phrases
- no private keys
- no passwords
- no `.env`
- no generated wallets/keystores
- no local logs
- no real asset screenshots
- no sensitive local paths or personal data

### Activity rules confirmation

Check after reading the campaign rules.

## Section 2 — Public Showcase Information

Recommended choice:

```text
Yes, feature my project
```

Showcase-friendly one-liner:

```text
IntentProof reviews DApp requests before imToken Web or Token Core Vault signs.
```

Showcase blurb:

```text
A WalletConnect transaction firewall for imToken users. DApps route requests through IntentProof; Token Core evidence explains calldata, approvals, routes, and simulation signals; then imToken Web or a Local Token Core Vault signs only after review.
```

Integration note:

```text
Partner DApps can launch IntentProof with /wc?uri=<walletconnect_uri>. IntentProof also supports /connect?uri= and QR scan/upload fallback.
```
