# STATUS.md - IntentProof backlog

_Last updated: 2026-05-19_

## Current Decision Set

- Product title: `IntentProof Tx Guard`.
- Product target: WalletConnect transaction firewall for imToken users.
- Primary screen: `Protect Wallet`.
- Default live network: Ethereum mainnet through WalletConnect/imToken
  forwarding. Examples and Token Core Lab remain testnet-first.
- Live mode: DApps route WalletConnect requests through IntentProof, then
  reviewable requests can be forwarded to imToken for final signing. Live
  Request Inbox is evidence-first: it shows what the request does, what is
  unusual, what evidence is missing, and what IntentProof can or cannot relay.
  It does not claim to know the user's private intent or reduce arbitrary DApp
  requests to simple safe/unsafe truth.
- DApp connection: primary flow is a minimalist unified intake for QR camera
  scan, QR screenshot paste/upload, or WalletConnect URI paste. Secondary
  partner/custom routing still captures the URI in memory, removes it from the
  visible URL, then pairs after imToken connects.
- Not claimed: native imToken extension or arbitrary imToken Browser
  interception.
- Token Core: preserved for local testnet wallet creation/signing, templates,
  analyze/decode/policy checks, CLI commands, Sepolia, and Base Sepolia.
- Mainnet: Ethereum and Base mainnet show a warning in Protect Wallet
  WalletConnect forwarding. There is no separate mainnet allow toggle. Requests
  with unusual or incomplete evidence require acknowledgement before relay;
  methods/chains IntentProof cannot mediate are not relayed. No local browser
  mainnet signing or broadcast.
- Remote AI: browser AI parsing/summaries are off by default and require an
  explicit per-session opt-in before public `VITE_*` provider keys are used.
- In-browser AI: optional WebLLM request-inbox review runs only after the user
  clicks it. It loads one selected local model under 1 GB, reads the normalized
  IntentProof review packet instead of raw calldata, and never changes policy or
  forwarding authority.
- Wallet files: no browser import/export UI.
- Secrets: no `.env`, generated wallets, keystores, private keys, mnemonics,
  local logs, personal data, or real-asset screenshots committed.

## Product Surface

- [x] Protect Wallet is the default first screen.
- [x] Top-right imToken account control.
- [x] Connect a DApp card.
- [x] Request Inbox.
- [x] Verifiable Signing Card for live requests.
- [x] Mainnet warning for Ethereum/Base mainnet requests.
- [x] Forward/reject actions framed as imToken final review, not IntentProof
  safety approval.
- [x] Examples is a secondary support tool with five deterministic scenarios.
- [x] Token Core Lab is a secondary support tool with local Token Core wallet/signing controls.
- [x] Activity is a secondary support tool with local non-secret activity.

## Live WalletConnect

- [x] Added chain config for Ethereum, Base, Sepolia, and Base Sepolia.
- [x] Added live request normalizer.
- [x] Added inbound WalletConnect wallet client with dynamic imports.
- [x] Added imToken signer WalletConnect client with dynamic imports.
- [x] Added policy bridge and fake live clients for deterministic tests.
- [x] Missing `VITE_WALLETCONNECT_PROJECT_ID` shows setup-required without
  breaking Examples or Token Core Lab.
- [x] Unrelayable live requests are rejected and not forwarded.
- [x] Requests with unusual signals require acknowledgement.
- [x] Routine live requests forward exactly once in fake live tests.
- [x] Routed DApp URL supports custom wallet entries without user paste/scan.
- [x] Unified DApp connection intake for visible WalletConnect URI paste, QR
  screenshot paste/upload, and camera scan feeds the same pairing path.
- [x] Routed or pasted DApp URIs show an inline Connect imToken continuation
  action when the final signing wallet is not connected yet.
- [x] Companion `/demo-dapp` route is kept as a small integration example.
- [x] Network selector requests `wallet_switchEthereumChain` in imToken and
  emits WalletConnect `chainChanged` to connected DApps.
- [x] Ethereum is the default live network; all configured WalletConnect
  networks are advertised without a duplicate mainnet allow switch.
- [x] Connected account pill exposes an explicit imToken disconnect/logout action.
- [x] Inbound WalletConnect sessions advertise and locally answer
  `wallet_getCapabilities` so Uniswap-style DApps can continue to the
  transaction request instead of stalling at `Confirm in wallet`.
- [x] Common Uniswap Universal Router v2/v3 swap command streams decode into
  WARN-gated route evidence instead of fail-closed BLOCK. Unsupported router
  commands still block on mainnet.
- [x] Live Request Inbox scoring now includes decode evidence, optional
  server-side Tenderly simulation, optional Alchemy asset-change simulation,
  open RPC dry-run simulation, gas estimate evidence, and explicit
  unavailable/revert states.
- [x] Simulation success can raise confidence, but simulation metadata never
  bypasses unrelayable method/chain checks. Simulated reverts lower confidence
  and require explicit review before relay.
- [x] Live Request Inbox hard-cut to evidence-first language: routine, review,
  and cannot-relay states replace user-facing PASS/WARN/BLOCK verdicts.
- [x] Optional in-browser LLM review added as a Request Inbox evidence factor.
  It supports SmolLM2 360M, TinyLlama 1.1B 1k, and Qwen2.5 0.5B WebLLM models,
  all labeled below the 1 GB local-model budget. AI output is strict JSON and
  advisory only.
- [x] Added a repeatable `npm run test:e2e:dapps` harness for Tokenlon, 1inch,
  Curve, Lido, ENS, Sushi, Compound, and Aave request classes. This tests the
  real Protect Wallet inbox, scoring, reject, warning acknowledgement,
  coordination approval, and exact-once forwarding paths without extracting
  third-party WalletConnect pairing links.
- [x] Reown dashboard project exists; production and local test origins are
  allowlisted. Public Project ID stays in local/deployment env only, not git.

## Preserved Token Core Capabilities

- [x] `@consenlabs/tcx-wasm`.
- [x] Local fresh testnet wallet creation.
- [x] Local Token Core testnet signing.
- [x] Optional explicit testnet broadcast.
- [x] Sepolia and Base Sepolia support.
- [x] Analyze/decode/policy checks and transaction templates.
- [x] CLI commands and tests.
- [x] Compact offline ABI registry generated for selected Ethereum mainnet
  contracts to improve readable calldata decoding without changing policy
  trust decisions.

## Documentation

- [x] README explains Protect Wallet, Examples, Token Core Lab, Activity.
- [x] SUBMISSION explains WalletConnect forwarding and mainnet boundary.
- [x] DEMO_SCRIPT updated for product flow.
- [x] SUBMISSION_FORM_DRAFT updated.
- [x] `.env.example` documents optional public WalletConnect project id.
- [x] `docs/live-imtoken-mode.md` documents the live mode boundary.
- [x] `docs/reown-setup.md`, `docs/walletguide.md`, and `docs/demo-dapp.md`
  document setup and distribution.

## Remaining Risks

- Real WalletConnect interoperability should be tested against an actual imToken
  mobile session again after the `wallet_getCapabilities` hosted fix deploys.
  The previous live Uniswap attempt reached `Confirm in wallet` but no inbox
  item because the capability probe was not advertised in the session namespace.
- Hosted builds without `VITE_WALLETCONNECT_PROJECT_ID` can demonstrate all
  policy/UI states but cannot pair live sessions.
- Swap and bridge routes remain deterministic policy examples, not production
  aggregator integrations.

## Verification Summary

- `npm run lint` PASS.
- `npm run typecheck` PASS.
- `npm run test:unit` PASS - 30 files, 200 tests.
- `npm run test:cli` PASS - 4 files, 37 tests.
- `npm run test:smoke:chains` PASS - 1 file, 7 tests.
- `npm run test:ui` PASS - 4 files, 31 tests.
- `npm run build:ui` PASS.
- `npm run verify` equivalent PASS via lint, typecheck, unit, CLI, chain smoke,
  and UI build commands.
- `npm run audit:high` PASS - 0 vulnerabilities.
- `npm run secrets:check` PASS.
- `git diff --check` PASS.
- Browser visual QA PASS for Protect Wallet desktop, secondary Examples/Token
  Core Lab/Activity tools, `/wc?uri=` routed DApp intake, and `/demo-dapp`
  companion merchant route.
- `npm run test:e2e:dapps` PASS - Tokenlon/1inch/Curve/Lido/ENS/Sushi/Compound/Aave
  request harness.
- `/wc?uri=` route scrub verified: the page removes the raw URI from the visible
  URL, shows `DApp route detected`, waits for imToken, and does not render the
  routed URI in page text.
- No account address, QR URI, screenshot, session metadata, or generated wallet
  artifact was added to docs or git.
- Browser E2E after the wallet coordination fix was intentionally deferred on
  2026-05-18 per user request: "finish without testing in a browser for now".
