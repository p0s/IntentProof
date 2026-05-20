# SECURITY.md

IntentProof Tx Guard is testnet-first for local Token Core signing defaults in
the imToken Token Core AI co-creation campaign. It includes Ethereum Mainnet and
Base Mainnet metadata for decode/analyze/policy readiness, but it is not an
official imToken mobile integration.

## Safety Model

- Decode before sign: candidate transactions are analyzed before signing is
  enabled.
- Policy before signature: BLOCK and DANGER decisions disable signing by
  default; WARN requires explicit acknowledgement.
- Testnet by default: Sepolia and Base Sepolia are the local signing and
  broadcast networks.
- Mainnet guarded: Ethereum Mainnet and Base Mainnet are configured for live
  review. Local Token Core Vault mainnet signing is disabled by default and
  requires explicit session opt-in, vault unlock, warning acknowledgement, and a
  non-blocked request.
- Local custody: Token Core wallet creation and signing happen locally when the
  Local Token Core Vault or Token Core Lab is selected.
- Browser UI custody hard-cut: wallet-file import/export is not available in
  the web product. Use fresh generated wallets only.
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
- imToken Web signing uses imToken Connect as an external signer. IntentProof
  does not create imToken accounts or store imToken passkeys.
- Passkey support is a local vault unlock/gating mechanism only. PRF is used
  only when browser support can be proven; otherwise password vault mode remains
  available.

## Reporting

For hackathon review, use the repository issue tracker or contact the project
owner through the submission form. Do not include secrets, seed phrases, private
keys, generated wallets, or real asset screenshots in reports.
