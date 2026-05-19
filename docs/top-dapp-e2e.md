# Top DApp E2E Testing

IntentProof supports arbitrary WalletConnect DApps, but automated agents should not copy active third-party `wc:` pairing links out of dapp modals. Those links are short-lived pairing capability material.

Use two test layers instead:

1. `npm run test:e2e:dapps`
   - deterministic CI/local harness
   - exercises the real Protect Wallet inbox, scoring, policy, warning acknowledgement, reject, local coordination approval, and exact-once forwarding paths
   - covers named origins for Tokenlon, 1inch, Curve, Lido, ENS, Sushi, Compound, and Aave with representative WalletConnect request classes
2. Browser compatibility pass
   - open each real DApp and confirm WalletConnect QR/link availability
   - do not print, store, commit, or log the live `wc:` URI
   - if a human pastes/scans the URI into IntentProof, continue testing from the connected session and Request Inbox

The companion `/demo-dapp` route remains the fully automated live-handoff path because the DApp itself opens IntentProof with `/wc?uri=...`, matching the custom-wallet / partner-DApp integration pattern without requiring the tester to extract the URI.
