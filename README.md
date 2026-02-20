# x402-clarity-docs

Pay-per-query Clarity smart contract documentation and analysis service. Payments in sBTC via x402.

## Endpoints

| Endpoint | Method | Cost (sBTC) | Description |
|----------|--------|-------------|-------------|
| `/api/explain` | POST | 0.000003 (~300 sats) | Plain English contract explanation |
| `/api/functions` | POST | 0.000001 (~100 sats) | Document all public/read-only functions |
| `/api/audit-quick` | POST | 0.000005 (~500 sats) | Quick security checklist |
| `/api/diff` | POST | 0.000005 (~500 sats) | Compare two contract versions |

## Request Format

All endpoints accept:
```json
{
  "contractId": "SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait",
  "source": "(optional — raw Clarity source if not deployed)"
}
```

For `/api/diff`:
```json
{
  "oldContractId": "SP..contract-v1",
  "newContractId": "SP..contract-v2"
}
```

## Payment

All paid endpoints use x402 with **sBTC** on Stacks mainnet. The relay handles payment verification automatically.

## Deploy

```bash
# Set secrets
wrangler secret put RECIPIENT_ADDRESS   # your STX address
wrangler secret put OPENROUTER_API_KEY  # for LLM calls

# Deploy
wrangler deploy
```

## Why sBTC?

This service demonstrates x402 payments with sBTC — bitcoin-backed micropayments for API access. Every query pays a few hundred sats, settled on Stacks.
