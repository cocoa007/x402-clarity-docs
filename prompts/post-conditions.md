# x402 Job: Post-Condition Analysis

You are processing a paid x402 job. Be thorough but concise — this is a paid service.

## Input
- `contractId` (e.g. `SP1234.my-contract`) — fetch source from Hiro API
- OR `source` — raw Clarity code provided directly

If given a contractId, fetch source:
```bash
curl -s "https://api.hiro.so/v2/contracts/source/{address}/{name}" | python3 -c "import sys,json; print(json.load(sys.stdin)['source'])"
```

## What to Analyze

Examine every public function for STX, fungible token (FT), and non-fungible token (NFT) transfers. For each transfer found:

1. **Identify the transfer** — function name, asset type, sender, recipient, amount/id
2. **Assess post-condition coverage** — Can the caller fully constrain this transfer with post-conditions?
3. **Flag missing/insufficient protection** — Transfers where callers CANNOT protect themselves via post-conditions (e.g., `as-contract` transfers from the contract principal, indirect calls, dynamic amounts)
4. **Recommend caller post-conditions** — Exactly which post-conditions a caller should attach for safe invocation

## Key Clarity Concepts

- `stx-transfer?` — moves STX; callers can attach `STXPostCondition`
- `ft-transfer?` — moves SIP-010 tokens; callers can attach `FungiblePostCondition`
- `nft-transfer?` — moves NFTs; callers can attach `NonFungiblePostCondition`
- `as-contract` — changes `tx-sender` to the contract principal; post-conditions on the *caller* won't cover these
- `contract-call?` — calls another contract; that contract may do additional transfers
- Post-condition modes: `Allow` (dangerous — permits unlisted transfers) vs `Deny` (safe default — blocks unlisted transfers)

## Output Format

Return a JSON object:

```json
{
  "contract": "SP1234.my-contract",
  "summary": "One paragraph: overall post-condition safety posture of this contract",
  "transfers": [
    {
      "function": "deposit",
      "asset": "STX",
      "from": "tx-sender",
      "to": "contract",
      "amount": "dynamic (parameter)",
      "as_contract": false,
      "caller_can_constrain": true,
      "recommended_post_condition": {
        "type": "stx-postcondition",
        "principal": "caller",
        "condition": "eq",
        "amount": "match the amount parameter"
      }
    }
  ],
  "indirect_calls": [
    {
      "function": "swap",
      "callee": "SP1234.dex-contract",
      "callee_function": "execute-swap",
      "risk": "May perform additional token transfers not visible in this contract"
    }
  ],
  "risks": [
    {
      "severity": "high|medium|low",
      "description": "Description of the post-condition risk",
      "affected_function": "function-name",
      "recommendation": "What to do about it"
    }
  ],
  "caller_checklist": [
    "When calling function-name: attach STX post-condition (sender=you, condition=eq, amount=X)",
    "Always use post-condition mode Deny when calling this contract",
    "..."
  ],
  "overall_safety": "safe|caution|unsafe",
  "clarity_version": "1|2|3|4"
}
```

## Rules
- Read the actual code carefully — no guessing
- Trace every path that moves STX, FTs, or NFTs
- Flag any `as-contract` transfer — callers cannot constrain these with their own post-conditions
- Flag any `contract-call?` to external contracts — those may do unexpected transfers
- If the contract uses `allow` post-condition mode anywhere, flag it as high risk
- Note if the contract has admin/owner functions that could drain funds
- Be specific in recommendations — name exact post-condition types, principals, and conditions

## Delivering Results

POST results to the x402 worker:
```bash
curl -X POST "https://x402-clarity.cocoa007.workers.dev/internal/job/{JOB_ID}/complete" \
  -H "Content-Type: application/json" \
  -d '{"status": "complete", "result": {<your JSON output>}}'
```
