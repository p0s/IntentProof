# IntentProof Tx Guard

IntentProof Tx Guard is a WalletConnect transaction firewall for imToken users.
DApps route requests through IntentProof, IntentProof explains the actual request
with Token Core evidence and an Agent Permission Firewall, then reviewable
requests can be forwarded to imToken for final signing.

Live WalletConnect review defaults to Ethereum mainnet, with Base, Sepolia, and
Base Sepolia available from the network selector. Examples work on a hosted
build without environment variables, and Token Core Lab uses Token Core local
signing only on Sepolia and Base Sepolia. Mainnet requests show warnings in the
signing card and are forwarded to imToken only. IntentProof never performs local
browser mainnet signing.

Hosted app: https://www.intentproof.xyz

This is not a native imToken extension and it cannot intercept DApps opened
directly inside imToken Browser. Users must route a DApp session through
IntentProof for protection.

## Product Flow

Signer setup lives in the top-right account control. The working flow has three
steps:

1. Connect a DApp: partner DApps open IntentProof with a routed WalletConnect
   URI, or users paste a URI, paste/upload a QR screenshot, or scan a QR.
2. Request Inbox: live DApp requests appear with score, confidence, and reason.
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

- Protect Wallet: the primary product screen. Connect imToken, connect a DApp,
  review live requests, use the mainnet warning, then forward to imToken or reject.
- Examples: secondary deterministic incoming requests for hosted review:
  safe ERC-20 transfer PASS, unlimited approval BLOCK, WETH wrap PASS/WARN, swap
  route policy WARN/BLOCK, and bridge/chain mismatch BLOCK.
- Token Core Lab: secondary fresh local Token Core testnet wallet creation, Token Core
  signing, and optional explicit Sepolia/Base Sepolia broadcast. No browser
  wallet-file import/export exists.
- Activity: secondary local non-secret activity with raw details hidden behind advanced
  disclosure.

## Live Rating Evidence

IntentProof scores live DApp requests from multiple deterministic signals:
calldata decode evidence, contract/source evidence, policy checks, Uniswap route
decode where supported, optional Alchemy asset-change simulation, and open RPC
`eth_call`/`estimateGas` dry-runs. Alchemy is optional; without it the app still
uses the configured chain RPC as a free/open dry-run provider.

Simulation is evidence, not permission. A successful simulation can raise score
confidence, while a revert or missing simulation lowers confidence and requires
careful review. Unsupported methods or chains remain unrelayable.

## Token Core Usage

IntentProof is derived from the official Token Core CLI demo branch at
`token-core/tcx-examples/cli` and uses:

- `@consenlabs/tcx-wasm`
- local Token Core testnet wallet creation and signing
- shared CLI/UI testnet wallet storage
- transaction templates for ETH, ERC-20 transfer, ERC-20 approve, WETH, and
  custom calldata
- analyze/decode/policy checks
- Sepolia and Base Sepolia signing/broadcast support
- preserved CLI scripts and tests

WalletConnect live mode uses Reown/WalletConnect packages with dynamic imports
so Examples and Token Core Lab still run when no project id is set.

## Safety Boundaries

- Ethereum mainnet is the default live WalletConnect network; Examples and
  Token Core Lab remain testnet-first.
- Mainnet forwarding is allowed only through imToken and shows a warning.
- No local browser mainnet signing or broadcast.
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
- ZXing browser QR decoding and `qrcode`, MIT licensed
- Token UI and Security Skill as design/safety references
- React, Vite, TypeScript, Vitest, Testing Library, ESLint
- Viem and public Sepolia/Base Sepolia/Ethereum/Base metadata
