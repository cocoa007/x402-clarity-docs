# x402-clarity

Clarity smart contract documentation, analysis, and security audits — pay-per-query with sBTC via x402.

## Endpoints

### Docs (instant, LLM-powered)
| Endpoint | Price | Description |
|----------|-------|-------------|
| `POST /api/explain` | 300 sats | Explain a contract in plain English |
| `POST /api/functions` | 100 sats | List all public/read-only functions |
| `POST /api/audit-quick` | 500 sats | Quick security checklist |
| `POST /api/diff` | 500 sats | Compare two contract versions |

**Input**: `{ "contractId": "SP...<name>" }` or `{ "source": "<clarity code>" }`

### Audits (async, queued for full review)
| Endpoint | Price | Description |
|----------|-------|-------------|
| `POST /api/audit-request` | 200-1000 sats | Submit contract for security audit |
| `GET /api/audit-status/:id` | free | Check audit status |
| `GET /api/audits` | free | List recent audits |

**Audit request input**:
```json
{
  "tier": "quick|full",
  "repo": "https://github.com/owner/repo",
  "contract": "contracts/my-contract.clar",
  "callback_address": "bc1q... (optional, for inbox notification)"
}
```

- **quick** (200 sats): Automated scan, ~5 min
- **full** (1000 sats): Thorough manual-grade audit with exploit tests, ~15 min

### Internal (agent use)
| Endpoint | Description |
|----------|-------------|
| `GET /internal/queue` | Poll pending audit IDs |
| `GET /internal/audit/:id` | Full audit record with source |
| `POST /internal/audit/:id/status` | Update audit status |

## Deploy

```bash
# Install deps
npm install

# Create KV namespace
wrangler kv namespace create AUDIT_KV
# Copy the id into wrangler.toml

# Set secrets
wrangler secret put OPENROUTER_API_KEY

# Deploy
wrangler deploy
```

## x402 Flow

1. Client sends request without payment → gets 402 with payment headers
2. Client pays sBTC to recipient address
3. Client resubmits with `x-payment-verified: true` (via relay)
4. For docs: instant LLM response
5. For audits: queued, agent picks up and runs full audit pipeline

## Architecture

```
Client → x402 payment → Worker → {
  docs:   instant LLM response
  audits: KV queue → agent heartbeat polls → sub-agent audit → results published
}
```

Audit results publish to [cocoa007.github.io/clarity-audit](https://cocoa007.github.io/clarity-audit).
