# SPEC.md — IntentProof Tx Guard

_Last updated: 2026-05-16_

## 0. Canonical direction

Build **IntentProof Tx Guard** for the imToken 10th Anniversary AI Co-creation Campaign.

**Product thesis**

> DApps and AI can propose wallet actions, but IntentProof must explain the actual request with Token Core evidence before imToken makes the final signing decision.

**Winning narrative**

> Let AI plan. Let Token Core analyze. Let policy verify. Let the user stay in control.

**Primary prize fit**

- Best Security Design
- Best AI Wallet
- Best User Sovereignty
- Best On-chain Scenario
- Overall project awards via completion, demonstrability, user value, security, and fit with imToken's Token Core + AI direction

**Hard rule**

This is a working wallet transaction guard, not a static mockup. Protect Wallet routes WalletConnect DApp requests through IntentProof, explains the request using decode/simulation/policy evidence, and relays reviewable requests to imToken for final signing. It does not claim to know the user's private intent for arbitrary live DApp requests. Examples and Token Core Lab remain available without API keys. At least one PASS example scenario must support real Token Core local signing on testnet. Broadcast may remain explicit/optional. Mainnet support is imToken-forwarded only; mainnet requests show a warning and no local browser mainnet signing is allowed.

---

## 1. Submission-aware product constraints

The submission form and campaign rules create real delivery constraints. Treat these as product requirements.

### 1.1 Form-ready naming

Project title must be at most 30 characters.

Use exactly:

```text
IntentProof Tx Guard
```

Character count: 20.

### 1.2 Suggested form choices

If the form allows only one option, choose the first item in each row. If it allows multiple, choose all listed.

| Form field | Submit |
|---|---|
| Project title | `IntentProof Tx Guard` |
| Project category | `AI wallet`; also select `Security and self-custody` and `On-chain use cases` if multi-select is allowed |
| Completion status | `Testnet-ready` |
| Project format | `Web wallet`; also select `Skill` / `Website` if multi-select is allowed |
| Demo link | Hosted app with Protect Wallet first and Examples available without env values |
| Demo video | 60-90 second compressed video, under 20 MB |
| GitHub code / repo link | Public or unlisted GitHub repository, with secrets removed |
| Security confirmation | Must be true: no seed phrases, private keys, passwords, real asset screenshots, generated wallets, keystores, or local logs |

### 1.3 Project description for form

Use this, or keep any edit under 300 characters:

```text
IntentProof Tx Guard routes DApp requests through a WalletConnect review layer before imToken signs. It uses Token Core evidence, deterministic policy, and local receipts to explain approvals, routes, simulations, and unusual calls.
```

### 1.4 Required judge bundle

The repository must produce a submission bundle:

```text
README.md
SUBMISSION.md
DEMO_SCRIPT.md
SECURITY.md or safety section in README
hosted demo link
short video under 20 MB
source code without secrets
```

`SUBMISSION.md` must contain:

- project title
- <=300 character project description
- project category recommendation
- completion status
- project format
- Token Core usage notes
- demo script
- security design
- AI design
- user sovereignty design
- on-chain scenarios
- open-source credits
- limitations and safety boundaries
- exact commands run for verification

---

## 2. Official materials and what is actually possible now

### 2.1 Must use Token Core

The campaign requires Token Core usage. This repository was built from the official Token Core CLI demo branch, not from a blank app. The public IntentProof repo hard-cuts the app to the repository root while preserving provenance in docs and using the official `@consenlabs/tcx-wasm` package. It does not vendor the full upstream monorepo, mobile SDKs, release workflows, or test fixture wallets.

Use this base:

```bash
git clone --branch demo/token-core-cli https://github.com/consenlabs/token-core-monorepo.git
cd token-core-monorepo/token-core/tcx-examples/cli
```

Official base path:

```text
token-core/tcx-examples/cli
```

Current public repo app path:

```text
.
```

### 2.2 What the official CLI demo already provides

Keep and reuse the official implementation wherever possible. The Token Core CLI demo already provides the capabilities most important for this project:

- React + Vite UI
- CLI commands
- `@consenlabs/tcx-wasm`
- Token Core wallet create/import/list in the local CLI
- local Token Core Lab wallet creation in the UI
- transaction templates:
  - ETH transfer
  - ERC-20 transfer
  - ERC-20 approve
  - WETH
  - custom calldata
- transaction analysis:
  - decode
  - contract verification where configured
  - policy result
  - AI/local summary
  - Tenderly asset-change simulation when configured
  - local fallback behavior when API keys are absent
- sign and broadcast flows with policy pre-checks
- Sepolia and Base Sepolia compatibility by default
- Ethereum Mainnet and Base Mainnet chain metadata for analyze/decode/policy readiness
- verification scripts such as lint/typecheck/tests/build/verify/audit depending on the current package scripts

Do **not** rebuild these primitives from scratch. Hard-cut the user experience while preserving these capabilities.

### 2.3 Token UI usage

Use `consenlabs/token-ui` as a design-system reference, not as the app base.

Reason: Token UI is a minimal React template for wallet-like UI composition. It does not include production wallet connection, signing, custody, backend, or chain-indexing logic.

Allowed Token UI usage:

- read and follow its design guidance
- read and apply `security/SKILL.md`
- copy small MIT-licensed component/style patterns only when clearly credited
- use the same product language: calm financial UI, user control, risk clarity, imToken-like cards and badges

Do **not** convert the Token Core CLI demo into a pnpm monorepo just to import Token UI. That risks breaking the official working Token Core base.

### 2.4 Security Skill usage

Read and apply:

```text
https://github.com/consenlabs/token-ui/tree/main/security
```

Core safety behavior:

- Decode before sign.
- Display function, contract, verification status, token, exact amount, affected assets, network, and fee before the sign button is enabled.
- Treat unlimited approvals as Danger/Block when intent forbids them.
- Treat policy violations as Block.
- Show full addresses in confirmation contexts.
- Keep key material local.
- Default live network is Ethereum mainnet through WalletConnect/imToken forwarding.
- Show clear warnings for mainnet write actions; mainnet signing is imToken-forwarded only.
- Keep Examples and Token Core Lab testnet-first.
- Never ask for, store, or display real mnemonics/private keys.
- State safety boundaries in README and SUBMISSION.

---

## 3. Delivery model

### 3.1 Primary product surface and support tools

The product must work for hosted users without env values and also show real
Token Core testnet behavior when run locally.

#### Primary - Protect Wallet

Purpose: real product flow for WalletConnect transaction firewalling.

Properties:

- first screen and primary product surface
- connect imToken through WalletConnect as final signer
- connect a DApp through one minimalist intake surface: scan a WalletConnect QR,
  paste/upload a QR screenshot, or paste the WalletConnect URI
- if a DApp URI is present before imToken is connected, show an inline Connect
  imToken continuation action in that same flow
- support partner/custom wallet routing as a secondary integration path
- show Request Inbox
- normalize incoming JSON-RPC requests
- run parser, decode/analyze evidence, policy compiler, Agent Permission Firewall, address heuristic, and decision engine
- enrich live write requests with a signal stack: verified/local/registry decode
  evidence, optional Alchemy asset-change simulation, and open RPC
  `eth_call`/`estimateGas` dry-run
- optionally run an in-browser WebLLM review after explicit user action. The AI
  receives only the normalized IntentProof review packet, not raw calldata as
  the source of truth, and it never changes policy or forwarding authority.
- show readable request evidence, unusual signals, confidence, and relayability
- do not present live requests as simple yes/no, safe/unsafe, or PASS/BLOCK truth
- require acknowledgement before relaying requests with unusual or incomplete evidence
- do not relay methods/chains that IntentProof technically cannot mediate
- relay the exact request to imToken for final signing review when allowed
- show non-secret local receipt
- if `VITE_WALLETCONNECT_PROJECT_ID` is missing, show setup-required without breaking Examples or Token Core Lab

Protect Wallet does not claim native imToken integration and cannot intercept
DApps opened directly inside imToken Browser. A DApp session must be routed
through IntentProof. IntentProof supports WalletConnect URI route intake for
partner/custom wallet integrations, reads the `uri` parameter in memory, removes
it from the visible URL, and starts DApp pairing after imToken is connected.

#### Secondary support - Examples

Purpose: hosted review, video recording, and deterministic product examples.

Properties:

- no private API keys required
- no real mnemonic/private-key input
- five preview requests always work
- local deterministic intent parser always works
- policy engine and decision engine always work
- fixture transaction requests show pass/warn/block outcomes
- uses the same parser, compiler, policy, decision, and UI states as Protect Wallet and Token Core Lab
- if network/API calls are unavailable, show a degraded but truthful state

#### Secondary support - Token Core Lab

Purpose: real local testnet execution using the official Token Core demo stack.

Properties:

- Sepolia and Base Sepolia supported
- fresh local Token Core testnet wallet creation
- no real seed phrase input
- no browser UI import/export of wallet files or keystores
- local wallet/keystore never committed
- analysis uses available RPC/Etherscan/Tenderly/Gemini/Groq settings from `.env`
- at least one PASS scenario supports Token Core local signing
- broadcast is explicit, separate from signing, and testnet-only

### 3.2 Mainnet forwarding boundary

Ethereum Mainnet and Base Mainnet are allowed only in Protect Wallet
WalletConnect forwarding.

- Mainnet requests show a clear warning.
- IntentProof reviews and forwards to imToken; it does not custody mainnet keys.
- No separate mainnet allow toggle exists; the network selector and request
  chain are the source of truth.
- No local browser mainnet signing.
- No local browser mainnet broadcast.
- Requests IntentProof cannot mediate are never forwarded.
- Undecodable mainnet transaction calldata is shown as incomplete evidence and
  requires explicit review before relay.
- Uniswap Universal Router command streams are decoded where supported. Unknown
  commands are shown as incomplete route evidence and require explicit review
  before relay.

### 3.3 Hosted app requirements

A hosted demo may be deployed to Vercel, Netlify, Cloudflare Pages, GitHub Pages, or another static host.

Hosted app rules:

- Must default to Protect Wallet.
- Must not include `.env`, generated wallets, keystores, local logs, private keys, mnemonics, personal local paths, author names, or secrets.
- Must not expose server-only secrets through browser variables.
- Must not require a live swap/bridge aggregator to show the core product.
- Must include a visible safety boundary: `Do not enter real seed phrases, private keys, production wallet passwords, or screenshots of real assets. Token Core local signing is testnet-only.`
- Must link to the repository and `SUBMISSION.md` if safe.

### 3.4 Video requirements

Create `DEMO_SCRIPT.md` for a short video under 20 MB.

Target video sequence:

1. Show title and safety boundary.
2. Show the end-user problem: AI/dapp asks for an action; user needs to know whether the actual transaction matches intent.
3. Scenario A: safe ERC-20 transfer passes.
4. Scenario B: unlimited approval is blocked.
5. Scenario C: WETH wrap passes.
6. Scenario D: swap route is blocked or warned because approval/slippage violates policy.
7. Scenario E: bridge/chain mismatch is blocked.
8. Show Agent Permission Firewall controls.
9. Show Verifiable Signing Card and receipt.
10. Show Token Core usage notes.

Keep the video in English or bilingual English/Chinese. Use no real assets or secrets.

---

## 4. End-user usage model

### 4.1 Target users

- imToken users who interact with dapps and are unsure what they are signing
- beginners who need plain-language transaction explanations
- power users who want explicit rules such as no bridges, no unlimited approvals, and max gas
- AI-agent users who want the wallet to be the final control point before an automated action signs

### 4.2 Current hackathon user path

A judge or demo user opens the web demo and uses the skill like this:

1. Open IntentProof.
2. See safety boundary: testnet-only, no real secrets.
3. Use Protect Wallet first, with Examples and Token Core Lab available as secondary support tools.
4. Type a plain-language wallet intent or click a scenario chip.
5. Review the parsed intent and generated policy.
6. Review the Agent Permission Firewall.
7. Click `Verify before signing`.
8. See the pipeline:
   - parse intent
   - compile candidate transaction
   - decode calldata
   - simulate/preview if available
   - check policy
   - make final IntentProof decision
9. Review the Verifiable Signing Card:
   - what the user asked for
   - what the transaction actually does
   - expected asset changes
   - risk/policy decision
   - exact contract/recipient/network
10. If PASS, sign locally with Token Core.
11. Optionally broadcast on testnet.
12. Copy or download a Verifiable Signing Receipt.

### 4.3 Future imToken product path

This must be presented as a wallet-skill product concept that could live inside imToken, not as a claim that it is already integrated into the official mobile wallet.

Future integrated flow:

1. User taps an action in a dapp, AI agent, swap, bridge, payment, or staking flow inside imToken.
2. IntentProof receives:
   - the user intent if available
   - the transaction request
   - the chain
   - the signing account
   - the dapp origin
   - active user/agent policy
3. Token Core decodes and checks the transaction.
4. IntentProof compares actual calldata and route metadata against the user's intent and policy.
5. imToken shows a confirmation card:
   - PASS: sign enabled
   - WARN: acknowledgement required
   - BLOCK: sign disabled with exact reason
6. The user stays in control of final signing.
7. The wallet saves a local receipt for accountability.

### 4.4 Core end-user promise

Every confirmation must answer:

1. **What did I ask for?**
2. **What will this transaction actually do?**
3. **Does it satisfy my wallet/agent safety policy?**

---

## 5. Product shell

Hard-cut the current technical CLI UI into a polished single-product experience:

```text
Protect Wallet
  -> Connect imToken
  -> Connect a DApp
  -> Request Inbox
  -> Verifiable Signing Card
  -> Mainnet warning
  -> Forward / Reject
  -> Receipt summary

Examples
  -> deterministic examples A-E
  -> Intent Console
  -> Parsed Intent + Policy
  -> Agent Permission Firewall
  -> Token Core Analyze Pipeline
  -> Verifiable Signing Card

Token Core Lab
  -> fresh local Token Core testnet wallet
  -> local Token Core Lab gate
  -> optional explicit testnet broadcast

Activity
  -> local non-secret activity
  -> raw receipt hidden in advanced details
```

Keep the CLI commands and underlying Token Core flows working. Remove or demote old generic UI sections that compete with the new story.

---

## 6. Core scenarios

Build and polish these five scenarios. The first three are mandatory for the live demo. The last two are mandatory for product breadth but may be policy-gated from deterministic route metadata if no reliable testnet route exists.

### Scenario A — Safe ERC-20 transfer: PASS

User intent:

```text
Send 5 USDC to my saved vendor on Sepolia. Do not approve anything. Max gas $1.
```

Expected result:

- chain: Sepolia
- action: ERC-20 transfer
- token: USDC or existing official demo test token constant
- recipient: trusted address-book entry
- approval: none
- policy: PASS
- sign button enabled after analysis
- optional broadcast enabled if wallet is funded and RPC is configured

Implementation notes:

- Use existing demo token/template constants where available.
- If adding Sepolia USDC/Base Sepolia USDC constants, place them in a single constants file and document source.
- Do not rely on real balances for the decision; missing funds should be a separate execution warning, not a policy failure.

### Scenario B — Unlimited approval: BLOCK

User intent:

```text
Swap 10 USDC to ETH, but never allow unlimited approvals.
```

Candidate transaction:

```text
ERC-20 approve(spender, uint256.max)
```

Expected result:

- decoded function: `approve`
- approval amount: unlimited / max uint256
- risk severity: Danger
- policy result: BLOCK
- sign button disabled
- explanation:

```text
Blocked: this transaction grants unlimited token approval, but your intent forbids unlimited approvals.
```

### Scenario C — WETH wrap: PASS

User intent:

```text
Wrap 0.01 ETH into WETH on Sepolia. Do not bridge. Max gas $1.
```

Expected result:

- action: WETH deposit/wrap
- ETH decreases and WETH increases when simulation is available
- no approval
- no bridge
- policy: PASS or WARN depending on verification/simulation availability
- sign enabled when decision is not BLOCK

### Scenario D — Swap route policy: WARN or BLOCK

User intent:

```text
Swap 10 USDC to ETH with max slippage 0.5%. Do not approve unlimited amounts.
```

Build as a product-level route evaluator. Do not add a fragile live swap aggregator as a hard requirement.

Expected behavior:

- route metadata is deterministic and visible
- if route requires unlimited approval: BLOCK
- if route slippage exceeds user limit: BLOCK
- if route needs exact approval and is otherwise safe: WARN or PASS depending on decode/verification
- if the route cannot be decoded/simulated: WARN or BLOCK depending on active policy

### Scenario E — Bridge/chain mismatch: BLOCK

User intent:

```text
Send 5 USDC on Sepolia. Do not bridge and do not use Base.
```

Candidate route:

- transaction request or route metadata indicates Base Sepolia or bridge/cross-chain action

Expected result:

- mismatch shown clearly
- policy result: BLOCK
- sign disabled
- explanation:

```text
Blocked: this candidate uses Base Sepolia / bridge routing, but your intent only allows Sepolia and forbids bridging.
```

---

## 7. Required product modules

### 7.1 Intent Console

Features:

- natural-language input
- scenario chips for A-E
- `Verify before signing` button
- mode badge: Demo/Testnet
- no raw calldata as primary entry point
- optional expandable advanced calldata area

### 7.2 Structured intent model

Create TypeScript types similar to:

```ts
type IntentAction = 'transfer' | 'approve' | 'wrap' | 'swap' | 'bridge' | 'unknown';
type IntentDecision = 'pass' | 'info' | 'warn' | 'danger' | 'block';

interface UserIntent {
  rawText: string;
  action: IntentAction;
  chain?: 'sepolia' | 'base-sepolia';
  asset?: string;
  amount?: string;
  recipientLabel?: string;
  recipientAddress?: string;
  maxGasUsd?: number;
  maxSlippageBps?: number;
  forbidBridge: boolean;
  forbidUnlimitedApprovals: boolean;
  forbidApprovals?: boolean;
  allowedChains?: string[];
  allowedProtocols?: string[];
  requireVerifiedContract?: boolean;
  requireTrustedRecipient?: boolean;
}
```

Use stricter types if existing code supports them. Avoid over-modeling beyond the five demo scenarios.

### 7.3 Local deterministic parser

Always works without AI/API keys.

Minimum parsing support:

- transfer amount, asset, recipient label, chain
- WETH wrap amount and chain
- swap amount, input/output assets, slippage bps
- `do not approve`, `no approval`, `no unlimited approval`
- `do not bridge`, `no bridge`
- `do not use Base`, `Sepolia only`
- gas cap in USD

### 7.4 Optional LLM parser

Optional and never required for correctness.

Preferred implementation:

- Reuse existing Gemini/Groq utilities from the official CLI demo if practical.
- LLM returns structured intent JSON only.
- Deterministic parser validates and normalizes all LLM output.
- Transaction calldata must never be trusted just because an LLM produced it.
- Wallet secrets must never be sent to an LLM.

OpenAI support is optional. If added, keep it server-only via an optional route/proxy with real secrets excluded from browser bundles. Do not add OpenAI if it risks breaking static hosting or verification.

### 7.5 Intent compiler

Converts `UserIntent` into a candidate transaction plan using known-safe templates.

The compiler must produce:

```ts
interface CandidatePlan {
  id: string;
  scenarioId?: 'A' | 'B' | 'C' | 'D' | 'E';
  mode: 'demo' | 'testnet';
  userIntent: UserIntent;
  chain: 'sepolia' | 'base-sepolia';
  txRequest?: unknown;
  routeMetadata: RouteMetadata;
  expectedEffects: ExpectedEffect[];
  unsupportedReason?: string;
}
```

Use existing official demo templates for transfer/approve/WETH/custom calldata.

### 7.6 Agent Permission Firewall

A visible control panel that merges with user intent policy.

Minimum controls:

- allowed chains: Sepolia, Base Sepolia
- max spend per transaction
- daily spend cap display/demo state
- max gas USD
- max slippage bps
- forbid bridge
- forbid unlimited approvals
- require verified contract
- require trusted recipient
- require first-time-contract confirmation
- trusted recipients list

Preset states:

- `Beginner Safe`
- `Agent Limited`
- `Power User`

### 7.7 Policy compiler

Merge these sources in order:

1. default risk policy from existing `src/policies/default-risk-policy.json`
2. structured user intent
3. Agent Permission Firewall
4. scenario-specific safety constraints

Most restrictive rule wins.

### 7.8 IntentProof decision engine

Combines Token Core analysis with route/intent policy.

Decision states:

| State | Meaning | Sign behavior |
|---|---|---|
| PASS | intent, policy, route, and decoded transaction align | sign enabled |
| INFO | safe but simulation/API missing or non-critical info | sign enabled with context |
| WARN | potentially acceptable, but user must acknowledge | sign disabled until acknowledgement |
| DANGER | high risk but not necessarily a direct intent violation | sign disabled unless explicit override exists; no override in default demo |
| BLOCK | direct violation or unsupported danger | sign disabled |

Block conditions:

- unlimited approval while forbidden
- bridge/cross-chain route while forbidden
- actual chain not allowed
- slippage exceeds max
- recipient must be trusted but is not trusted
- action mismatches intent materially
- contract verification required but unavailable
- custom calldata cannot be decoded and blind signing is disallowed

### 7.9 Token Core Analyze Pipeline

Show a step timeline:

1. Parse intent
2. Compile candidate transaction
3. Decode calldata with Token Core / existing demo analysis
4. Check contract verification
5. Simulate / preview asset changes if available
6. Apply default policy
7. Apply intent and agent policy
8. Produce final IntentProof decision

Each step needs status:

```text
pass / info / warn / danger / block / unavailable
```

### 7.10 Verifiable Signing Card

This is the most important UI component.

Must show:

- original user intent
- parsed action
- actual decoded action
- chain requested vs actual chain
- sender
- full recipient/contract address
- method/function
- token and exact amount
- approval status
- expected asset changes
- gas estimate or unavailable state
- policy checks with pass/warn/block badges
- final decision
- sign button gated by final decision

Never show raw hex as the main explanation. Raw calldata may appear in an expandable advanced section.

### 7.11 Signing and broadcast

- Sign only after Token Core analysis has run.
- Sign only when decision is PASS/INFO, or WARN after acknowledgement.
- BLOCK and DANGER disable signing in the default demo.
- Broadcast is a separate button after signing.
- Broadcast is testnet-only.
- Mainnet chain metadata may be used for decode/analyze/policy readiness, but mainnet signing/broadcast is not enabled in this build.
- Receipt includes transaction hash if broadcast succeeds.
- If broadcast fails, show a readable error and do not fake success.

### 7.12 Verifiable Signing Receipt

After sign or broadcast, generate a local receipt:

```text
IntentProof Receipt
Intent: ...
Decision: PASS/WARN
Chain: Sepolia
Action: ERC-20 transfer
Token: USDC
Amount: 5
Recipient: vendor-safe-demo (...full address...)
Policy checks: ...
Token Core analysis: completed
Signed: yes/no
Broadcast: yes/no
Tx hash: ...
Timestamp: ...
```

Allow copy/download as JSON and human-readable text. Do not store activity remotely.

### 7.13 Address poisoning heuristic

Minimum behavior:

- show full addresses on confirmation
- compare candidate recipient against trusted recipients
- warn if recipient shares only prefix/suffix with a trusted address but differs in the middle
- block if policy requires trusted recipient and candidate is not trusted
- never suggest copying addresses from transaction history

---

## 8. UI and content expectations

Use an imToken-like, calm, financial product style:

- card-based layout
- clear hierarchy
- risk badges
- wallet-skill framing
- no cluttered developer-first screen as the primary UI
- advanced details hidden by default but available
- English UI is acceptable; short Chinese labels are optional

Suggested UI copy:

```text
IntentProof Tx Guard
Verifiable AI signing for imToken

Describe what you want. IntentProof checks what the transaction actually does before Token Core signs.
```

Safety banner:

```text
Testnet demo only. Do not enter real seed phrases, private keys, passwords, or screenshots of real assets.
```

Blocked state copy:

```text
Signing blocked because the transaction does not match your intent.
```

Warning state copy:

```text
This may be safe, but one check needs your attention before signing.
```

---

## 9. Open-source and existing-code strategy

Use existing open-source work only where it reduces risk. The official Token Core demo is the primary implementation base.

### 9.1 Primary code to build on

| Source | Use |
|---|---|
| `consenlabs/token-core-monorepo`, branch `demo/token-core-cli` | Product base, Token Core wallet/sign/analyze/broadcast, templates, policies, testnet support |
| `@consenlabs/tcx-wasm` | Wallet core / signing capability from official demo |
| existing `viem` dependency in the demo if present | EVM types, encode/decode helpers, chain/RPC helpers |
| existing policy files | Base policy layer |
| existing AI summary utilities | Optional LLM parsing only if safe and already available |

### 9.2 Reference only, not dependency by default

| Source | Use |
|---|---|
| `consenlabs/token-ui` | Visual style and security guidance only |
| `RabbyHub/Rabby` | UX reference for transaction clarity and DeFi wallet risk surfaces; do not import large extension code |
| `Tenderly/tenderly-rabby-transaction-preview` | Reference pattern for showing asset in/out and simulation summaries; prefer existing official demo Tenderly integration |
| `MetaMask/snaps` | Concept reference for wallet skills/transaction insights; do not convert this to a Snap |
| GoPlus / Blockaid-style risk APIs | Optional future plugin only; not a core dependency |
| OpenZeppelin Contracts | ABI/reference only if needed; do not add contract deployment unless necessary |

### 9.3 Dependency policy

Do not add a new package unless all are true:

1. existing code cannot reasonably solve the need
2. the package license is compatible
3. the dependency is small and maintained
4. it does not require secrets in browser bundles
5. it does not jeopardize `npm run verify`
6. `SPEC.md` and `SUBMISSION.md` are updated with the reason

Avoid adding:

- live swap aggregator SDKs
- live bridge SDKs
- backend frameworks unless absolutely required
- wallet import libraries that bypass Token Core
- browser wallet-file import/export surfaces
- phishing/risk APIs that require protected keys in browser code

### 9.4 WalletConnect dependency exception

Protect Wallet requires real WalletConnect pairing and forwarding, which the
existing Token Core CLI demo does not provide. The approved exception is:

- `@reown/walletkit` for inbound DApp sessions.
- `@walletconnect/ethereum-provider` for outbound imToken signing.
- `@walletconnect/core` and `@walletconnect/utils` for WalletKit setup and
  errors.
- `@walletconnect/sign-client` for the companion demo DApp pairing route.

Security reason: these packages are dynamically imported only in live
WalletConnect paths, require only public `VITE_WALLETCONNECT_PROJECT_ID`, and
do not handle wallet secrets or local Token Core key material. Examples
and Token Core Lab work when WalletConnect is unconfigured.

License note: the packages use the WalletConnect Community License. Submission
and README docs must credit Reown / WalletConnect and note that production
usage must comply with their terms.

### 9.5 QR dependency exception

Product-grade DApp connection requires QR scan/upload fallback. The approved
exception is:

- `@zxing/browser` and `@zxing/library` for browser QR scan/upload decoding.
- `qrcode` for the companion demo DApp QR display.

Security reason: QR handling only extracts WalletConnect URIs, validates that
they are `wc:` v2 URIs, and feeds the same pairing path as routed URLs and
pasted WalletConnect URIs. It does not process wallet secrets, mnemonics, private keys, or
keystores.

License note: these QR packages are MIT licensed.

### 9.6 Browser AI dependency exception

Optional request-inbox AI review requires local in-browser model inference,
which the existing Token Core CLI demo does not provide. The approved exception
is:

- `@mlc-ai/web-llm` for WebGPU local LLM inference.

Security reason: WebLLM is dynamically imported only after an explicit user
click, downloads selected open model weights to browser cache, and receives only
the normalized IntentProof review packet. It never receives seed phrases,
private keys, keystores, wallet passwords, WalletConnect secrets, or raw
calldata as the source of truth. Its output is advisory JSON and cannot change
policy decisions or forwarding gates.

License note: WebLLM is Apache-2.0 licensed.

---

## 10. Security and privacy requirements

### 10.1 Never commit

- `.env`
- `.env.*` except safe examples
- private keys
- seed phrases
- passwords
- generated wallet files
- keystores
- local DBs
- screenshots with real balances
- logs containing secrets
- RPC/API secrets
- local absolute paths
- personal author names or attribution lines

### 10.2 Browser secret rule

`VITE_*` variables are public in browser bundles. Use them only for demo/public keys or local development. Do not place server-only secrets in `VITE_*`.

### 10.3 AI safety rule

Never send to an AI provider:

- seed phrases
- private keys
- passwords
- generated keystores
- full sensitive wallet state
- real asset screenshots

The LLM can parse user intent text only. The deterministic compiler and Token Core analysis are the source of truth.

### 10.4 Mainnet warning / testnet signing rule

Default live WalletConnect review to Ethereum mainnet, with Base, Sepolia, and
Base Sepolia available from the network selector. Mainnet requests are reviewed
by IntentProof and forwarded to imToken only; local browser mainnet signing and
broadcast are not enabled. Examples and Token Core Lab remain testnet-first.

### 10.5 Hosted write APIs

Avoid hosted write APIs. If any are added, they must be:

- server-only
- admin-token protected
- allowlisted
- idempotent where possible
- testnet-only
- documented in `SECURITY.md`

---

## 11. README requirements

Update `README.md` to be judge-friendly.

Minimum sections:

1. What is IntentProof?
2. Why it matters for imToken users
3. Product surface: Protect Wallet plus Examples, Token Core Lab, Activity
4. Quick start
5. Environment variables
6. Scenario walkthroughs A-E
7. Token Core usage
8. Security boundaries
9. Verification commands
10. Deployment notes
11. Open-source credits
12. Limitations

---

## 12. SUBMISSION.md requirements

Create `SUBMISSION.md` for copy/paste into the form and for judges.

Include:

```text
Project title
Project description <=300 chars
Category recommendation
Completion status
Project format
Demo link placeholder
Video link/upload note
GitHub repo placeholder
Token Core usage notes
Demo script
End-user usage path
Security design
AI design
User sovereignty design
On-chain scenario design
Open-source credits
Safety confirmation
Known limitations
Verification results
```

### Token Core usage notes text

Use or adapt:

```text
Built from the official Token Core CLI demo branch at token-core/tcx-examples/cli. IntentProof uses @consenlabs/tcx-wasm, Token Core local testnet wallet creation/signing, transaction templates, analyze/decode, policy pre-checks, sign/broadcast flows, and Sepolia/Base Sepolia configuration. Protect Wallet adds WalletConnect forwarding to imToken with Ethereum/Base mainnet warnings. Token UI and Security Skill were used as design and safety references.
```

---

## 13. Acceptance criteria

### 13.1 Product acceptance

- [ ] App opens as `IntentProof Tx Guard`, not generic CLI UI.
- [ ] Protect Wallet is the default first screen.
- [ ] First screen has a top-right Connect imToken account control and a Connect a DApp card.
- [ ] Scenario grid is not on the first screen.
- [ ] Safety boundary is visible on first screen.
- [ ] Examples works without `.env` or API keys.
- [ ] Token Core Lab supports Sepolia and Base Sepolia.
- [ ] Mainnet warning appears for Ethereum/Base mainnet live requests.
- [ ] Mainnet forwarding is allowed only through imToken and requires acknowledgement when evidence is unusual or incomplete.
- [ ] No local browser mainnet signing exists.
- [ ] Scenario A PASS is demonstrable.
- [ ] Scenario B BLOCK is demonstrable.
- [ ] Scenario C PASS/WARN is demonstrable.
- [ ] Scenario D WARN/BLOCK is demonstrable.
- [ ] Scenario E BLOCK is demonstrable.
- [ ] Agent Permission Firewall controls affect decisions.
- [ ] Verifiable Signing Card shows intent vs actual transaction.
- [ ] Full addresses are visible in confirmation contexts.
- [ ] At least one PASS scenario supports Token Core local signing.
- [ ] Broadcast is optional, explicit, and testnet-only.
- [ ] Receipt is generated locally.
- [ ] WalletConnect setup-required state is honest when the public project id is missing.
- [ ] README, SUBMISSION, DEMO_SCRIPT exist.

### 13.2 Technical acceptance

- [ ] Existing CLI commands still work.
- [ ] Existing policy files still load.
- [ ] No secret files are committed.
- [ ] No generated wallets/keystores are committed.
- [ ] No local mainnet signing or broadcast dependency is required.
- [ ] Ethereum Mainnet and Base Mainnet are present only for Protect Wallet forwarding.
- [ ] No live swap/bridge aggregator is required for core demo.
- [ ] Degraded network/API states are honest and readable.

### 13.3 Verification acceptance

Run as much as practical:

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:cli
npm run test:smoke:chains
npm run test:ui
npm run build:ui
npm run verify
npm run audit:high
git diff --check
git status --short
```

If a script is absent, document that instead of inventing results. If a command fails, fix the root cause. If a network/API-dependent test is flaky, isolate it and keep deterministic tests passing.

### 13.4 Visual acceptance

When practical, run:

```bash
npm run dev
```

Visually verify:

- first screen
- each scenario chip
- PASS state
- WARN state
- BLOCK state
- signing disabled on block
- receipt after signing
- mobile-ish narrow viewport

Screenshots may be added to docs only if they contain no secrets, no real balances, and no personal/local information.

---

## 14. Tests to add or update

Minimum tests:

- parse transfer intent
- parse WETH wrap intent
- parse swap with max slippage
- parse bridge ban
- parse chain restriction
- unlimited approval block
- slippage violation block
- bridge forbidden block
- chain mismatch block
- trusted recipient requirement
- address poisoning heuristic
- gas cap behavior
- UI sign disabled on block
- UI warning acknowledgement before sign
- UI sign enabled on pass after analysis
- receipt generation

Keep original CLI tests green.

---

## 15. Implementation plan

### Milestone 0 — baseline and guardrails

- Add/replace `SPEC.md`, `AGENTS.md`, `STATUS.md`, `.gitignore`.
- Read `README.md`, `package.json`, `.env.example`, `src/**`, `src/policies/**`.
- Run baseline verification or document existing failures.
- Map existing Token Core flows before editing.

### Milestone 1 — product shell hard cutover

- Replace generic CLI UI with IntentProof shell.
- Add mode switch, safety banner, scenario chips, product header.
- Keep old advanced tools only as an expandable developer/debug section if needed.

### Milestone 2 — intent and policy

- Add intent types.
- Add deterministic parser.
- Add optional LLM parsing through existing demo utilities if safe.
- Add Agent Permission Firewall.
- Add policy compiler.
- Add route metadata.

### Milestone 3 — candidate plans

- Wire scenarios A-E to candidate transaction plans.
- Reuse existing transfer/approve/WETH/custom calldata templates.
- Add deterministic swap route policy metadata.
- Add deterministic bridge/chain mismatch metadata.

### Milestone 4 — Token Core analysis and decision

- Pipe candidate tx requests through existing analyze/decode/simulation/policy flow.
- Add IntentProof decision engine on top.
- Degrade honestly when API keys are missing.

### Milestone 5 — signing and receipt

- Gate signing by final decision.
- Add warning acknowledgement.
- Use Token Core local signing for PASS path.
- Add optional broadcast.
- Add local receipt copy/download.

### Milestone 6 — docs, submission, deployment

- Update README.
- Create SUBMISSION.md.
- Create DEMO_SCRIPT.md.
- Add demo/video instructions.
- Add open-source credits.
- Add verification results section.
- Run final checks.

---

## 16. Demo video script target

A strong 75-second script:

```text
0-8s: IntentProof Tx Guard — AI can propose, but the wallet verifies.
8-18s: User enters transfer intent. IntentProof parses policy.
18-28s: Token Core analyzes ERC-20 transfer. PASS. Sign enabled.
28-40s: User enters swap intent forbidding unlimited approvals. Candidate route requests max approval. BLOCK.
40-50s: WETH wrap. PASS/WARN with asset preview.
50-60s: Bridge/chain mismatch. BLOCK.
60-68s: Agent Permission Firewall controls.
68-75s: Receipt + Token Core usage + testnet safety.
```

---

## 17. Known limitations to disclose

- This is a hackathon wallet-skill product build, not an official imToken mobile integration.
- Examples may use fixture/degraded analysis when API keys are absent.
- Token Core Lab requires local setup and optionally testnet funds/API keys for full sign/broadcast/simulation.
- Swap and bridge flows are policy-evaluated candidate routes, not live production aggregator integrations.
- AI parser is optional; deterministic parser and policy checks are authoritative.
- No real seed phrases/private keys should ever be used.

---

## 18. Non-goals

Do not build:

- a full consumer wallet replacement
- a mainnet signing product
- a production swap aggregator
- a production bridge
- a custodial backend
- a browser extension
- a mobile app
- a generic AI chatbot that cannot verify transactions
- UI mockups without Token Core-backed behavior
