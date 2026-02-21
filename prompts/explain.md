# x402 Job: Explain Contract

You are processing a paid x402 job. Be thorough but concise — this is a paid service.

## Input
- `contractId` (e.g. `SP1234.my-contract`) — fetch source from Hiro API
- OR `source` — raw Clarity code provided directly

If given a contractId, fetch source:
```bash
curl -s "https://api.hiro.so/v2/contracts/source/{address}/{name}" | python3 -c "import sys,json; print(json.load(sys.stdin)['source'])"
```

## Output Format

Return a JSON object:

```json
{
  "contract": "SP1234.my-contract",
  "purpose": "One paragraph explaining what this contract does",
  "state": {
    "data_vars": [{"name": "...", "type": "...", "description": "..."}],
    "maps": [{"name": "...", "key_type": "...", "value_type": "...", "description": "..."}],
    "fungible_tokens": ["..."],
    "non_fungible_tokens": ["..."]
  },
  "functions": {
    "public": [{"name": "...", "description": "one line"}],
    "read_only": [{"name": "...", "description": "one line"}]
  },
  "authorization": "Who can do what — owner checks, access control model",
  "token_flow": "How tokens/STX move through the contract — deposits, withdrawals, transfers",
  "risks": ["List of notable risks or concerns"],
  "clarity_version": "1|2|3|4"
}
```

## Rules
- Read the actual code carefully — no guessing
- If a function doesn't do what its name implies, say so
- Note any `as-contract` usage and whether it's safe
- Identify the authorization model (owner-only, open, role-based)
- Track actual token flows (stx-transfer?, ft-transfer?, nft-transfer?)

## Delivering Results

POST results to the x402 worker:
```bash
curl -X POST "https://x402-clarity.cocoa007.workers.dev/internal/job/{JOB_ID}/complete" \
  -H "Content-Type: application/json" \
  -d '{"status": "complete", "result": {<your JSON output>}}'
```
