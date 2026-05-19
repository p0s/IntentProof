# Deployment

Use Vercel as the primary hosted demo target. Keep GitHub Pages as an optional
static fallback only if needed.

## Vercel

Production hosted Demo Mode:

```text
https://www.intentproof.xyz
```

Recommended settings:

```text
Framework preset: Vite
Install command: npm ci
Build command: npm run build:ui
Output directory: dist
```

Hosted Demo Mode must work with no environment variables. Leave all `VITE_*`
values empty unless a value is explicitly disposable and acceptable as
browser-visible.

Never deploy these as `VITE_*` browser variables:

```text
TENDERLY_ACCESS_TOKEN
GEMINI_API_KEY
GROQ_API_KEY
OPENAI_API_KEY
TOKENCORE_CLI_PASSWORD
```

If richer AI parsing, Tenderly REST simulation, or Live imToken routing needs a
protected token later, add a server-side function/proxy first and keep the secret
server-only.

## GitHub Pages Fallback

GitHub Pages is suitable only for the static Demo Mode build. Do not add secrets,
wallets, keystores, generated receipts, or local logs to a Pages artifact.
