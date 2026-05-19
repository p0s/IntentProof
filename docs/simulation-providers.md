# Simulation providers

IntentProof now uses a layered live-request evidence stack.

## Default provider: open RPC dry-run

No account or API key is required. For `eth_sendTransaction` requests,
IntentProof calls the configured chain RPC with:

- `eth_estimateGas`
- `eth_call`

This catches many immediate reverts and gives a gas estimate, but it does not
reliably produce token balance deltas.

## Optional provider: server-side Tenderly simulation

Hosted Protect Wallet can call a same-origin Vercel function before browser
providers when these private deployment variables are set:

```env
TENDERLY_ACCOUNT_SLUG=
TENDERLY_PROJECT_SLUG=
TENDERLY_ACCESS_TOKEN=
```

The browser sends only transaction metadata to `/api/tenderly-simulate`. The
Tenderly REST access token stays server-side. The API returns a reduced result:
success/revert status, gas, optional simulation links, and asset-change
evidence. If the server route is unconfigured or unavailable, IntentProof falls
back to Alchemy or open RPC.

Do not create `VITE_TENDERLY_ACCESS_TOKEN`; every `VITE_*` value is public in
the browser bundle.

## Optional provider: Alchemy asset changes

Set:

```env
VITE_ALCHEMY_API_KEY=
```

When present, live request scoring calls `alchemy_simulateAssetChanges` after
server-side Tenderly is unavailable. If Alchemy returns asset changes, the
Request Inbox shows stronger score evidence. If Alchemy is absent or fails,
IntentProof falls back to the open RPC dry-run.

Security notes:

- `VITE_ALCHEMY_API_KEY` is public in browser bundles.
- Use a disposable app key with strict origin allowlists.
- Do not put server-only secrets in `VITE_*`.

## Existing Token Core Lab simulation

The Token Core Lab keeps the existing Tenderly/RPC simulation behavior for local
testnet transaction analysis and signing. The same non-`VITE_*` Tenderly REST
credentials are used outside browser bundles.

## Policy boundary

Simulation improves explanation and score confidence only. It never makes an
unrelayable method or chain forwardable. If simulation reports a revert, the
live request is shown with lower confidence and requires explicit review before
any relay to imToken.
