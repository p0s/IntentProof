# IntentProof Tx Guard

IntentProof Tx Guard is a WalletConnect transaction firewall for imToken users.
DApps route requests through IntentProof, IntentProof explains the actual request
with Token Core evidence and an Agent Permission Firewall, then reviewable
requests can be forwarded to imToken for final signing.

Live WalletConnect review defaults to Ethereum mainnet, with Base, Sepolia, and
Base Sepolia available from the network selector. Examples work on a hosted
build without environment variables. Users can choose imToken Web, a Local Token
Core Vault, or a WalletConnect wallet as the signer source. Token Core Lab
stays testnet-first, while the Local Token Core Vault can sign DApp requests
only after IntentProof review and vault unlock. Mainnet local vault signing is
disabled by default and requires explicit session opt-in.

Hosted app: https://www.intentproof.xyz

This is not a native imToken extension and it cannot intercept DApps opened
directly inside imToken Browser. Users must route a DApp session through
IntentProof for protection.

## Product Flow

Signer setup lives in the top-right account control and the signer selector.
The working flow has three steps:

1. Connect a DApp: partner DApps open IntentProof with a routed WalletConnect
   URI, or users paste a URI, paste/upload a QR screenshot, or scan a QR.
2. Request Inbox: live DApp requests appear with separate evidence confidence,
   risk level, execution/simulation status, and user action.
3. Review incoming request: IntentProof normalizes the JSON-RPC request, applies
   Token Core evidence and policy checks, and shows routine/review/cannot-relay
   status.

From the review card, requests IntentProof cannot mediate are not relayed,
unusual or incomplete evidence requires acknowledgement, and routine requests
can be forwarded exactly to imToken for final signing. Activity is stored locally
without secrets.

## App Structure

```text
.
|-- src/lib/live/                  # WalletConnect request/firewall bridge
|-- src/lib/txUnderstanding/       # protocol identity, ABI, and protocol decoders
|-- src/lib/intentproof/           # parser, compiler, policies, activity
|-- src/ui/screens/                # Protect Wallet and secondary support tools
|-- src/ui/components/             # WalletConnect and signing UI pieces
|-- src/cli.ts                     # preserved Token Core CLI demo commands
|-- public/                        # logo, favicon, social preview
|-- scripts/                       # verification and secret checks
|-- SPEC.md                        # canonical product spec
|-- SUBMISSION.md                  # judge/submission bundle
`-- DEMO_SCRIPT.md                 # short video script
```

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev
```

Examples and Token Core Lab work without API keys. Live WalletConnect
pairing requires a public Reown/WalletConnect project id:

```bash
VITE_WALLETCONNECT_PROJECT_ID=
```

`VITE_*` values are browser-visible. Do not place server secrets, production
wallet credentials, mnemonics, private keys, or generated wallets in `.env`.

## Connect a DApp

Use the main Connect a DApp card as one intake surface: scan a WalletConnect QR,
paste/upload a QR screenshot, or paste the URI into the same field. IntentProof
reads the URI in memory, shows a local Connect imToken action if the final
signer is missing, and then pairs the DApp through IntentProof.

The companion `/demo-dapp` route is only a small integration example for testing
custom-wallet routing.

### Mobile QR flow

Opening IntentProof on a smartphone browser also makes sense: connect imToken as
the final signer, then use `Scan QR with camera` to scan a WalletConnect QR
shown by a DApp on another screen. If the DApp is on the same phone, use a
partner/custom wallet route, paste/upload a QR screenshot, or paste the
WalletConnect URI instead; a phone camera cannot scan a QR that is only on the
same screen.

## Product Surface

- Protect Wallet: the primary product screen. Choose imToken Web, Local Token
  Core Vault, or WalletConnect wallet; connect a DApp; review live requests;
  then forward, sign locally, or reject.
- Examples: secondary deterministic incoming requests for hosted review:
  safe ERC-20 transfer PASS, unlimited approval BLOCK, WETH wrap PASS/WARN, swap
  route policy WARN/BLOCK, and bridge/chain mismatch BLOCK.
- Local Token Core Vault: first-class product signer using `@consenlabs/tcx-wasm`
  for fresh wallet creation, encrypted keystore storage in IndexedDB, account
  derivation, unlock, reviewed transaction signing, `personal_sign`, and
  EIP-712 typed-data signing through viem hashing plus Token Core `EcSign`.
  It stores no plaintext mnemonic, private key, passkey secret, or vault
  password.
- Token Core Lab: secondary fresh local Token Core testnet wallet creation, Token Core
  signing, and optional explicit Sepolia/Base Sepolia broadcast. No browser
  wallet-file import/export exists.
- Activity: secondary local non-secret activity with raw details hidden behind advanced
  disclosure.

## Live Rating Evidence

IntentProof now separates protocol identity, ABI decode, protocol-specific
decode, transaction risk, and execution status. A known DApp or decoded contract
can show high evidence confidence while still needing user review because it is
mainnet, high-impact, or simulated to revert.

Evidence comes from deterministic signals: calldata decode evidence,
contract/source evidence, selected Keystone ABI metadata, local ABI fallbacks,
known protocol profiles, protocol decoders, policy checks, optional Alchemy
asset-change simulation, and open RPC `eth_call`/`estimateGas` dry-runs. Risk is
shown separately as routine, standard, needs review, high-impact permission, or
blocked. Execution is shown separately as success, revert, unavailable, pending,
or not applicable.

ABI registries help with method-level calldata decoding, but routers such as
Uniswap Universal Router also have nested command languages. IntentProof uses
protocol decoder plugins for Uniswap Universal Router, ERC-20 approvals,
Permit2, Lido, signatures, and network coordination. Uniswap V2/V3 Universal
Router routes are decoded into route evidence. Uniswap V4 `V4_SWAP` is
recognized as a Uniswap swap with partial V4 decode until every nested V4 route
detail can be safely displayed; this does not turn the request into a
high-impact permission unless an approval or Permit2 authority is present.

Routine wallet coordination requests such as account, chain, and capability
checks are answered locally and recorded in Activity instead of cluttering the
primary Request Inbox. Unsupported methods or chains remain unrelayable.

The Request Inbox also includes optional local AI review. It uses WebLLM in the
browser after the user clicks `Review selected` or `Review inbox`, with model
options kept under 1 GB: SmolLM2 360M, TinyLlama 1.1B 1k, and Qwen2.5 0.5B. The
local model receives only IntentProof's normalized review packet, including the
deterministic transaction-understanding result. It does not receive wallet
secrets, and it is not allowed to make requests forwardable. If no explicit user
intent exists for a live DApp request, AI review must say intent is unclear
rather than inventing a mismatch. Users can delete downloaded local AI model
files from the Request Inbox. That clears WebLLM model cache entries only; it
does not touch local vaults, receipts, WalletConnect sessions, or app settings.

## Token Core Usage

IntentProof is derived from the official Token Core CLI demo branch at
`token-core/tcx-examples/cli` and uses:

- `@consenlabs/tcx-wasm`
- Local Token Core Vault creation, encrypted keystore storage, account
  derivation, reviewed local transaction signing, `personal_sign`, and
  EIP-712 typed-data signing through Token Core message signing
- local Token Core testnet wallet creation and signing in Token Core Lab
- shared CLI/UI testnet wallet storage
- transaction templates for ETH, ERC-20 transfer, ERC-20 approve, WETH, and
  custom calldata
- analyze/decode/policy checks
- Sepolia and Base Sepolia signing/broadcast support
- EVM transaction signing with either EIP-1559 fee fields or legacy `gasPrice`
- preserved CLI scripts and tests

imToken Web signing uses `@consenlabs/imtoken-connect` as the primary external
signer path. WalletConnect live mode uses Reown/WalletConnect packages with
dynamic imports so Examples and Token Core Lab still run when no project id is
set.

## Safety Boundaries

- Ethereum mainnet is the default live WalletConnect network; Examples and
  Token Core Lab remain testnet-first.
- Mainnet forwarding through imToken Web or a WalletConnect wallet shows a warning.
- Local Token Core Vault mainnet signing is disabled by default and requires
  explicit session opt-in, vault unlock, acknowledgement, and a non-blocked
  request.
- Direct DApp-to-imToken sessions bypass IntentProof.
- Requests IntentProof cannot mediate are not forwarded.
- Unusual or incomplete evidence requires explicit acknowledgement before forwarding.
- Unsupported methods such as `eth_sign`, `eth_signTransaction`, and
  `eth_sendRawTransaction` are not relayed.
- Wallet secrets stay local and are never sent to AI providers.
- Do not enter real seed phrases, private keys, production wallet passwords, or
  screenshots of real assets.

## Environment Variables

Hosted app preview flows and deterministic tests require no values.

Optional public/client values:

```text
VITE_WALLETCONNECT_PROJECT_ID=
VITE_ALCHEMY_API_KEY=
VITE_ETHERSCAN_API_KEY=
VITE_TENDERLY_NODE_ACCESS_KEY=
VITE_GEMINI_API_KEY=
VITE_GROQ_API_KEY=
```

`VITE_GEMINI_API_KEY` and `VITE_GROQ_API_KEY` are public browser values. They
are intended for local testing only; the hosted product keeps remote AI off by
default and requires an explicit per-session opt-in before sending intent text
or decoded-analysis summaries to a provider.

WebLLM local AI review does not require an API key. The first run downloads the
selected open model into the browser cache, so it may take time and requires a
browser with WebGPU support. Use `Delete local AI model files` in the Request
Inbox to remove downloaded WebLLM model files from this browser.

`VITE_ALCHEMY_API_KEY` and `VITE_TENDERLY_NODE_ACCESS_KEY` are also public
browser values. Use disposable, origin-restricted keys for hosted deployments.
For Tenderly REST simulation, use only the server-side `TENDERLY_*` variables
below. Never create or deploy `VITE_TENDERLY_ACCESS_TOKEN`.

Optional server/CLI-only values:

```text
TENDERLY_ACCOUNT_SLUG=
TENDERLY_PROJECT_SLUG=
TENDERLY_ACCESS_TOKEN=
TOKENCORE_CLI_HOME=./.tokencore-cli
TOKENCORE_CLI_PASSWORD=
```

When `TENDERLY_ACCOUNT_SLUG`, `TENDERLY_PROJECT_SLUG`, and
`TENDERLY_ACCESS_TOKEN` are configured on Vercel, hosted Protect Wallet uses a
same-origin `/api/tenderly-simulate` function for live-request simulation before
falling back to Alchemy/open RPC. The REST token is not sent to the browser.

## Verification

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:cli
npm run test:smoke:chains
npm run test:ui
npm run build:ui
npm run secrets:check
git diff --check
```

Run the bundled gate with:

```bash
npm run verify
npm run audit:high
```

## Deployment

Vercel deployment uses `npm ci`, `npm run build:ui`, and `dist`. Keep `.env`,
`.vercel`, generated wallets, keystores, and local logs out of git and out of
the public deploy bundle. The hosted build should default to Protect Wallet and
show setup-required for WalletConnect if `VITE_WALLETCONNECT_PROJECT_ID` is not
configured.

## Credits

- imToken Token Core and `@consenlabs/tcx-wasm`
- Reown / WalletConnect, used under the WalletConnect Community License
- MLC WebLLM for optional in-browser local AI review, Apache-2.0
- ZXing browser QR decoding and `qrcode`, MIT licensed
- Token UI and Security Skill as design/safety references
- React, Vite, TypeScript, Vitest, Testing Library, ESLint
- Viem and public Sepolia/Base Sepolia/Ethereum/Base metadata
