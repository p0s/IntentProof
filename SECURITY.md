# SECURITY.md

IntentProof Tx Guard is testnet-first for the imToken Token Core AI co-creation
campaign. It includes Ethereum Mainnet and Base Mainnet metadata for
decode/analyze/policy readiness, but it is not an official imToken mobile
integration and is not a mainnet signing product.

## Safety Model

- Decode before sign: candidate transactions are analyzed before signing is
  enabled.
- Policy before signature: BLOCK and DANGER decisions disable signing by
  default; WARN requires explicit acknowledgement.
- Testnet by default: Sepolia and Base Sepolia are the local signing and
  broadcast networks.
- Mainnet-ready, not mainnet-active: Ethereum Mainnet and Base Mainnet are
  configured for analyze/decode/policy readiness only.
- Local custody: Token Core wallet creation and signing happen locally.
- Browser UI custody hard-cut: wallet-file import/export is not available in
  the web product. Use fresh generated testnet wallets for demos.
- Explicit broadcast: signing and broadcasting are separate actions.

## Never Submit Or Commit

- seed phrases or recovery phrases
- private keys
- real wallet passwords
- `.env` files
- generated wallets or keystores
- local logs or databases
- screenshots with real balances or real assets
- Vercel project metadata or access tokens
- local machine paths or personal data

## Browser And AI Boundaries

`VITE_*` variables are public in browser bundles. Hosted Demo Mode must run
without protected API keys. Optional AI parsing receives only user intent text
or sanitized analysis summaries; wallet passwords, seed phrases, private keys,
keystores, and generated wallet files must never be sent to an AI provider.

## Known Limitations

- Hosted Demo Mode may use deterministic fixture/degraded analysis when RPC,
  Etherscan, Tenderly, Gemini, or Groq keys are absent.
- Swap and bridge scenarios are deterministic policy routes, not production
  aggregator or bridge integrations.
- Live imToken / WalletConnect Mode is documented as a future extension
  boundary unless a separate deployment explicitly implements it. Passkeys are a
  future local session-approval guard, not a wallet-secret export mechanism.

## Reporting

For hackathon review, use the repository issue tracker or contact the project
owner through the submission form. Do not include secrets, seed phrases, private
keys, generated wallets, or real asset screenshots in reports.
