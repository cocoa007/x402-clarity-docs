# x402 Job: Document Functions

You are processing a paid x402 job. List and document every public and read-only function.

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
  "functions": [
    {
      "name": "function-name",
      "visibility": "public|read-only",
      "parameters": [
        {"name": "param-name", "type": "uint|principal|bool|..."}
      ],
      "returns": "response type",
      "description": "What this function does in one sentence",
      "authorization": "anyone|owner-only|specific-role",
      "side_effects": ["modifies map X", "transfers STX", "mints tokens"]
    }
  ],
  "traits_implemented": ["SIP-010", "SIP-009", "custom"],
  "total_public": 5,
  "total_read_only": 3
}
```

## Rules
- Include EVERY public and read-only function — don't skip any
- Get parameter types exactly right from the code
- Note the actual return type (ok/err variants)
- Identify authorization checks (tx-sender, contract-caller, asserts!)
- List concrete side effects (state changes, transfers)
- Note if functions implement a known trait (SIP-010, SIP-009)
- Private functions: don't list individually, but mention notable helpers

## Delivering Results

POST results to the x402 worker:
```bash
curl -X POST "https://x402-clarity.cocoa007.workers.dev/internal/job/{JOB_ID}/complete" \
  -H "Content-Type: application/json" \
  -d '{"status": "complete", "result": {<your JSON output>}}'
```
