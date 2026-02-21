# x402-clarity-docs

An x402-paid API that provides AI-powered Clarity smart contract analysis. Pay with sBTC to get:

- **`POST /api/explain`** — Plain English contract explanation (300 sats sBTC)
- **`POST /api/functions`** — Document all public/read-only functions (100 sats sBTC)
- **`POST /api/audit-quick`** — Quick security audit (500 sats sBTC)
- **`POST /api/diff`** — Compare two contract versions (500 sats sBTC)

## How it works

1. Send a request with `contractId` (e.g., `SP000000000000000000002Q6VF78.pox-4`) or raw `source`
2. Pay the x402 sBTC fee
3. Get AI-powered Clarity analysis back

## Deploy

```bash
npm install
# Set secrets
wrangler secret put OPENROUTER_API_KEY
# Deploy
wrangler deploy
```

## Payment

Payments go to: `SP16H0KE0BPR4XNQ64115V5Y1V3XTPGMWG5YPC9TR`
Protocol: x402 (sBTC on Stacks mainnet)
