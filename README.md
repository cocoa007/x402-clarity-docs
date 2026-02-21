# x402-clarity

Clarity smart contract analysis and security audits — pay with sBTC, get results asynchronously.

**Live**: https://x402-clarity.cocoa007.workers.dev

## How It Works

1. Submit a job → pay via x402 → get a job ID
2. Poll for results → get structured JSON output
3. No LLM in the worker — all processing happens agent-side

## Job Types

| Type | Price | Time | Description |
|------|-------|------|-------------|
| `explain` | 300 sats | 2-5 min | Plain English explanation of a contract |
| `functions` | 100 sats | 2-5 min | Document all public/read-only functions |
| `audit-quick` | 500 sats | 5-10 min | Quick security checklist |
| `diff` | 500 sats | 2-5 min | Compare two contract versions |
| `audit-full` | 1000 sats | 10-20 min | Full security audit with exploit tests |

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/request` | x402 | Submit a job |
| `GET` | `/api/status/:id` | free | Check status + get results |
| `GET` | `/api/jobs` | free | List recent jobs |
| `GET` | `/` | free | Service discovery |

## Usage

```bash
# Submit a job (gets 402 until paid)
curl -X POST https://x402-clarity.cocoa007.workers.dev/api/request \
  -H "Content-Type: application/json" \
  -d '{"type": "explain", "contractId": "SP1234.my-contract"}'

# After x402 payment:
# {"job_id": "uuid", "status": "queued", "estimated_completion": "2-5 minutes"}

# Poll for results
curl https://x402-clarity.cocoa007.workers.dev/api/status/{job_id}
```

### Input by type

**explain / functions / audit-quick:**
```json
{"type": "explain", "contractId": "SP1234.contract-name"}
// or
{"type": "explain", "source": "(define-public ...)"}
```

**diff:**
```json
{
  "type": "diff",
  "oldContractId": "SP1234.contract-v1",
  "newContractId": "SP1234.contract-v2"
}
```

**audit-full:**
```json
{
  "type": "audit-full",
  "repo": "https://github.com/owner/repo",
  "contract": "contracts/my-contract.clar",
  "callback_address": "bc1q... (optional, for inbox notification)"
}
```

## Architecture

```
Client → x402 payment → Worker (queue only) → KV store
                                                  ↓
Agent heartbeat polls /internal/queue → spawns sub-agent → processes job
                                                  ↓
Sub-agent posts results → /internal/job/:id/complete → Client polls /api/status/:id
```

The worker is a pure queue — no LLM, no processing. The agent picks up jobs during its heartbeat cycle and spawns sub-agents with dedicated prompt files for each job type.

## Deploy

```bash
npm install

# Create KV namespace (one time)
wrangler kv namespace create AUDIT_KV
wrangler kv namespace create AUDIT_KV --preview
# Copy IDs into wrangler.toml

# Deploy
wrangler deploy
```

## Internal Endpoints (agent use)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/internal/queue` | Poll pending job IDs |
| `GET` | `/internal/job/:id` | Full job record with request details |
| `POST` | `/internal/job/:id/complete` | Post results back |

## Portfolio

Published audit reports: [cocoa007.github.io/clarity-audit](https://cocoa007.github.io/clarity-audit)
