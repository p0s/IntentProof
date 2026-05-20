# SUBMISSION.md - IntentProof Tx Guard

## Project Title

```text
IntentProof Tx Guard
```

20 characters, under the 30-character limit.

## Project Description

```text
IntentProof Tx Guard routes DApp requests through a Token Core-powered review layer before imToken signs. It explains calldata, approvals, routes, simulation evidence, and unusual mainnet requests in human-readable form.
```

## Category Recommendation

Primary: `AI wallet`

Also select if available:

- `Security and self-custody`
- `On-chain use cases`
- `Wallet experience`

## Completion Status

```text
Testnet-ready
```

## Project Format

Primary: `Web wallet`

Also select if available: `Skill`, `Website`.

## Links

Demo link:

```text
https://www.intentproof.xyz
```

GitHub:

```text
https://github.com/p0s/IntentProof
```

Demo video: upload a 60-90 second video under 20 MB using `DEMO_SCRIPT.md`.

## Token Core Usage Notes

Built from the official Token Core CLI demo branch at
`token-core/tcx-examples/cli`. IntentProof uses `@consenlabs/tcx-wasm` for the
Local Token Core Vault, encrypted keystore-based wallet creation, account
derivation, local signing, Token Core Lab testnet signing, transaction
templates, analyze/decode, policy pre-checks, sign/broadcast flows,
Sepolia/Base Sepolia configuration, and preserved CLI scripts. A lightweight
Token UI-inspired component layer and Security Skill guidance are documented in
provenance files.

## Live WalletConnect Mode

Protect Wallet is the primary product surface. Users choose imToken Web, Local
Token Core Vault, or WalletConnect fallback as the signer source. IntentProof
accepts routed DApp WalletConnect requests, normalizes incoming JSON-RPC
requests, runs policy/Token Core evidence checks, and either explains why the
request cannot continue or forwards/signs with the selected signer.

Users connect DApps from the main Connect a DApp card by pasting a
WalletConnect URI, pasting/uploading a QR screenshot, or scanning a QR with the
camera. IntentProof reads the URI in memory, asks the user to connect imToken if
needed, then pairs the DApp through IntentProof. Custom-wallet routing remains
available for partner/demo integrations, but it is not the primary user flow.

Supported methods:

- `eth_sendTransaction`
- `personal_sign`
- `eth_signTypedData_v4`
- `wallet_switchEthereumChain`
- `eth_accounts`
- `eth_chainId`

Unsafe methods such as `eth_sign`, `eth_signTransaction`, and
`eth_sendRawTransaction` are not relayed.

`VITE_WALLETCONNECT_PROJECT_ID` is optional and public. If it is missing, live
pairing shows setup-required while Examples and Token Core Lab still
work.

## Mainnet Boundary

Ethereum Mainnet and Base Mainnet are supported in Protect Wallet review.
Ethereum is the default live network, and mainnet requests show a clear warning.
imToken Web and WalletConnect fallback keep custody in the external signer.
Local Token Core Vault mainnet signing is disabled by default and requires
explicit session opt-in, vault unlock, acknowledgement, and a non-blocked
request. Undecoded calldata and Universal Router command streams are shown as
incomplete evidence and require explicit review before relay. Direct
DApp-to-imToken sessions bypass IntentProof.

Remote AI parsing and summaries are off by default in the browser. If local
provider keys are configured, the user must opt in for the session before
IntentProof sends intent text or decoded-analysis summaries to Gemini/Groq.
The Request Inbox also has optional local WebLLM review. It runs only after a
user click, uses sub-1 GB browser models, reads the normalized IntentProof
review packet instead of raw calldata, and never changes forwarding authority.

## Demo Script

1. Open the hosted link.
2. Show Protect Wallet as the first screen.
3. Show the signer selector: imToken Web, Local Token Core Vault, and
   WalletConnect fallback.
4. Select a routine request and forward it to imToken in the configured/fake demo
   flow.
5. Select the mainnet unlimited approval request and show the approval details,
   evidence confidence, risk level, execution status, and acknowledgement gate.
6. Select the typed-data request and show human-readable review before forward.
7. Optionally mention `/demo-dapp` as a small integration example.
8. Open Examples and run all five deterministic request outcomes.
9. Show the Local Token Core Vault card, then open Token Core Lab for the
   preserved testnet proof path.
10. Open Activity and show a non-secret receipt summary.

## End-User Path

0. Choose a signer source.
1. Connect a DApp through IntentProof.
2. Review the Request Inbox.
3. Forward to imToken Web, sign with Local Token Core Vault, or reject from the
   review card.
4. Use Examples for deterministic hosted examples.
7. Use Token Core Lab only for fresh local Token Core testnet wallets.

## Security Design

- Decode-before-sign.
- Requests IntentProof cannot mediate disable forwarding.
- Unusual or incomplete evidence requires acknowledgement.
- Evidence confidence is separate from transaction risk and execution status.
- Known DApp does not mean automatically safe.
- Routine account, chain, and capability requests are answered locally and
  moved to Activity.
- Mainnet forwarding shows a warning.
- Local Token Core Vault mainnet signing is session opt-in only and remains
  blocked for BLOCK requests.
- Full target addresses are shown in confirmation contexts.
- Address poisoning heuristic compares trusted recipients and warns on
  prefix/suffix lookalikes.
- Browser wallet-file import/export is absent.
- Wallet secrets are never sent to AI providers.
- `VITE_*` variables are treated as public client values.
- `.env`, generated wallets, keystores, private keys, mnemonics, local logs, and
  screenshots with real assets are excluded.

## AI Design

The deterministic parser is authoritative and works without API keys. Optional
Gemini/Groq summaries can be used for intent/analysis language only, and their
output is normalized by deterministic code. AI output never authorizes calldata
or signing by itself.

For live DApp requests, optional WebLLM review runs fully in the browser. The
AI input is a compact packet containing decoded function, chain, method,
policy decision/reasons, warnings, blockers, simulation availability, and asset
delta summary. It is advisory: it can suggest questions and scam-pattern hints,
but deterministic policy, Token Core evidence, and imToken final review remain
authoritative.

Users can run local AI on a selected request or batch-review all open
non-routine requests. The result never changes forwarding gates.

## User Sovereignty Design

IntentProof answers three questions before signing:

1. What did I ask for?
2. What will this request actually do?
3. Does it satisfy my policy?

imToken remains the final signer for live WalletConnect mode. Token Core remains
the local Token Core Lab and verification layer.

## On-Chain Scenarios

- Preview 1: safe Sepolia ERC-20 transfer, PASS.
- Preview 2: unlimited ERC-20 approval, BLOCK.
- Preview 3: Sepolia WETH wrap, PASS/WARN.
- Preview 4: swap route policy violation, WARN/BLOCK.
- Preview 5: Base/bridge mismatch for Sepolia-only intent, BLOCK.

## Open-Source Credits

- imToken Token Core / `@consenlabs/tcx-wasm`
- Reown / WalletConnect, used under the WalletConnect Community License
- MLC WebLLM, Apache-2.0, for optional in-browser local model review
- ZXing browser QR decoding and `qrcode`, MIT licensed
- Token UI and Security Skill references
- React, Vite, TypeScript, Vitest, Testing Library, ESLint
- Viem and public chain metadata

## Known Limitations

- Not an official imToken mobile integration.
- Does not intercept DApps opened directly in imToken Browser.
- Live WalletConnect pairing needs a public project id.
- Production WalletConnect usage must comply with Reown / WalletConnect terms.
- Hosted app preview flows use deterministic examples when live DApp requests are not
  paired.
- Swap and bridge flows are policy-evaluated candidate routes, not live
  production aggregators.
- Token Core Lab requires a fresh local Token Core testnet wallet and optional
  testnet funds for broadcast.

## Safety Confirmation

Before submission confirm:

- no seed phrases
- no private keys
- no passwords
- no `.env`
- no generated wallets or keystores
- no local logs
- no real asset screenshots
- no sensitive local paths or personal data

## Verification Results

Latest local verification:

```text
npm run lint                 PASS
npm run typecheck            PASS
npm run test:unit            PASS - 37 files, 235 tests
npm run test:cli             PASS - 4 files, 37 tests
npm run test:smoke:chains    PASS - 1 file, 7 tests
npm run test:ui              PASS - 4 files, 34 tests
npm run build:ui             PASS - WebLLM chunk-size warning only
npm run verify               PASS equivalent via component commands
npm run audit:high           PASS - no high severity issues; moderate transitive ws advisory remains through @consenlabs/imtoken-connect -> viem
npm run secrets:check        PASS
git diff --check             PASS
```

Visual QA:

```text
Protect Wallet desktop       PASS
Mainnet warning              PASS
Review acknowledgement gate  PASS
Examples support tool        PASS
Token Core Lab support tool  PASS
Activity support tool        PASS
No wallet-file import UI     PASS
```
