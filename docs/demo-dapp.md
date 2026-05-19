# Companion demo DApp

Route:

```text
/demo-dapp
```

Product name:

```text
IntentProof Demo Merchant
```

Purpose: show the product-like WalletConnect path:

```text
DApp -> custom wallet modal -> IntentProof -> verify -> imToken signs
```

The demo DApp is not Uniswap, Aave, or any real third-party DApp.

## Flow

1. Open `/demo-dapp`.
2. Click `Connect protected wallet`.
3. The demo creates a WalletConnect pairing when
   `VITE_WALLETCONNECT_PROJECT_ID` is configured.
4. The modal offers `Open in IntentProof`, `Copy WalletConnect URI`, and a QR.
5. `Open in IntentProof` uses:

```text
/wc?uri=<encoded_walletconnect_uri>
```

6. IntentProof captures the URI, removes it from the visible URL, waits for
   imToken/final signer, then pairs the DApp.
7. The demo request buttons send deterministic JSON-RPC requests through the
   live pipeline when the session is connected.

## Request buttons

- `Pay 5 test USDC`
- `Request unlimited approval`
- `Wrap 0.01 ETH`
- `Propose swap route`
- `Propose bridge route`
- `Sign typed data`

These are deterministic request fixtures. They do not use live swap or bridge
SDKs.

## No Project ID behavior

If `VITE_WALLETCONNECT_PROJECT_ID` is empty, the route still renders and shows
the custom wallet URL pattern, but live pairing is setup-required. Preview
Requests and Testnet Signing remain functional.
