# Simulation providers

IntentProof now uses a layered live-request evidence stack.

## Default provider: open RPC dry-run

No account or API key is required. For `eth_sendTransaction` requests,
IntentProof calls the configured chain RPC with:

- `eth_estimateGas`
- `eth_call`

This catches many immediate reverts and gives a gas estimate, but it does not
reliably produce token balance deltas.

## Optional provider: Alchemy asset changes

Set:

```env
VITE_ALCHEMY_API_KEY=
```

When present, live request scoring first calls
`alchemy_simulateAssetChanges`. If Alchemy returns asset changes, the Request
Inbox shows stronger score evidence. If Alchemy is absent or fails, IntentProof
falls back to the open RPC dry-run.

Security notes:

- `VITE_ALCHEMY_API_KEY` is public in browser bundles.
- Use a disposable app key with strict origin allowlists.
- Do not put server-only secrets in `VITE_*`.

## Existing Token Core Lab simulation

The Token Core Lab keeps the existing Tenderly/RPC simulation behavior for local
testnet transaction analysis and signing. Tenderly REST credentials stay
server/CLI-only and are not required for hosted Protect Wallet.

## Policy boundary

Simulation improves explanation and score confidence only. It never makes a
policy-blocked request forwardable. If simulation reports a revert, the live
request fails closed and is not forwarded to imToken.
