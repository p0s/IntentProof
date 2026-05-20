# TOKEN_CORE_PROVENANCE.md

IntentProof Tx Guard was derived from the official imToken Token Core CLI demo
branch and hard-cut into a public root app for submission clarity.

## Official Base

```text
Repository: https://github.com/consenlabs/token-core-monorepo
Branch: demo/token-core-cli
Original path: token-core/tcx-examples/cli
```

## Token Core Capabilities Preserved

- `@consenlabs/tcx-wasm`
- local wallet creation, import, list, and selection in the CLI
- Local Token Core Vault creation in the browser product
- encrypted Token Core keystore storage for the Local Token Core Vault
- account derivation for the DApp-exposed local vault address
- reviewed local vault signing after IntentProof policy gates
- fresh local testnet wallet creation in the browser UI
- CLI-managed wallet file support for local development
- transaction templates for ETH transfer, ERC-20 transfer, ERC-20 approval,
  WETH wrap, and custom calldata
- transaction analyze/decode flow
- policy pre-checks
- local Token Core signing
- optional explicit testnet broadcast
- Sepolia and Base Sepolia support for local signing/broadcast
- Ethereum Mainnet and Base Mainnet metadata for analyze/decode/policy readiness
- optional Local Token Core Vault mainnet signing only after explicit session opt-in
- CLI commands and verification scripts

## Public Repo Cutover

The public repository intentionally runs from the root instead of requiring
judges to enter the original nested monorepo path. The browser product removes
wallet-file import/export and uses fresh local testnet wallet creation for Token
Core signing demos. CLI-managed wallet files remain local-dev tooling only. The
full upstream mobile SDKs, release workflows, and test fixture wallets are not
vendored here. The official Token Core dependency and provenance are documented
so the submission stays clear while avoiding unnecessary private or upstream-only
artifacts.

## Design References

Token UI and the Token UI security guidance were used as design and safety
references. A small Token UI-inspired layer is vendored in
`src/ui/token-ui/`; IntentProof does not claim to be a native imToken mobile
feature or an official Token UI package.
