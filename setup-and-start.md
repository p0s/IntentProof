# Setup and start

## 1. Clone this public repo

```bash
git clone git@github.com:<your-user>/IntentProof.git
cd IntentProof
```

This repo was derived from the official Token Core demo branch at
`token-core/tcx-examples/cli`, but the IntentProof Tx Guard app now runs from the
repository root and uses the published `@consenlabs/tcx-wasm` package.

## 2. Install and baseline

```bash
npm install
cp .env.example .env
npm run dev
```

## 3. Environment notes

The product must work in Demo Mode without `.env` or API keys.

For richer Testnet Mode, configure only demo/testnet credentials in `.env`. Do not use production secrets. Do not commit `.env`.

Expected optional keys from the official demo may include Alchemy, Etherscan,
Tenderly, Gemini, and Groq variables. Use `.env.example` as source of truth.
`VITE_*` values are browser-visible; leave them empty for hosted Demo Mode unless
they are intentionally public. Tenderly REST sharing uses server/CLI-only
`TENDERLY_*` variables.

## 4. Deploy hosted Demo Mode

Use Vercel as the primary demo target:

```text
Production demo: https://intentproof-tx-guard.vercel.app
```

```text
Install command: npm ci
Build command: npm run build:ui
Output directory: dist
```

Do not configure secrets or generated wallets for the hosted demo. See
`docs/deployment.md`.

## 5. Final checks before submission

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

Document any absent script or unavoidable network/API limitation in `SUBMISSION.md`.
