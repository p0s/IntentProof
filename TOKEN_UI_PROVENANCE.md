# TOKEN_UI_PROVENANCE.md

IntentProof uses Token UI as a design and safety reference, not as a full app
base. The project remains the official Token Core CLI demo-derived Vite app and
does not migrate into the Token UI pnpm workspace.

## What Was Added

A lightweight Token UI-inspired component layer lives in:

```text
src/ui/token-ui/Button.tsx
src/ui/token-ui/Card.tsx
src/ui/token-ui/Badge.tsx
src/ui/token-ui/Alert.tsx
src/ui/token-ui/Tabs.tsx
src/ui/token-ui/tokenUi.css
```

These components provide small, local UI primitives for the signer selector,
Local Token Core Vault card, and request-review surfaces. They are intentionally
minimal and do not import Token UI as a dependency.

## Security Guidance Applied

- Decode before sign.
- Show full addresses in confirmation contexts.
- Keep secrets local.
- Avoid browser wallet-file import/export.
- Treat approvals, unknown calldata, and mainnet write actions as review-worthy.
- Never claim native imToken integration unless the integration is actually native.

## Boundaries

IntentProof is not an official Token UI package and does not claim to be a
native imToken extension. imToken Web account creation and passkeys remain owned
by imToken Web; IntentProof only reviews DApp requests before forwarding or
local Token Core Vault signing.
