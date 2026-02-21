# x402 Job: Quick Security Audit

You are processing a paid x402 job. Perform a quick security checklist — not a full audit, but a focused scan for common Clarity pitfalls.

## Input
- `contractId` (e.g. `SP1234.my-contract`) — fetch source from Hiro API
- OR `source` — raw Clarity code provided directly

If given a contractId, fetch source:
```bash
curl -s "https://api.hiro.so/v2/contracts/source/{address}/{name}" | python3 -c "import sys,json; print(json.load(sys.stdin)['source'])"
```

## Checklist (check each one)

1. **Authorization** — Are public functions properly guarded? Any missing tx-sender/contract-caller checks?
2. **as-contract misuse** — Does `as-contract` cause tx-sender to resolve incorrectly in transfers? Pre-Clarity 4: flag as risk. Recommend `as-contract?` with explicit allowances.
3. **Token transfers** — Do stx-transfer?/ft-transfer?/nft-transfer? actually move tokens, or is the contract pure bookkeeping?
4. **Integer math** — Any overflow/underflow risks? Division truncation losing significant value?
5. **Unwrap safety** — `unwrap-panic` vs `unwrap!` — are panics used where errors should be recoverable?
6. **Access control escalation** — Can ownership be transferred unsafely? Single-step vs two-step?
7. **State consistency** — Can maps/vars get into inconsistent states? Missing cleanup on error paths?
8. **Re-entrancy via contract-call?** — Does the contract call external contracts that could call back?
9. **Hardcoded addresses** — Any hardcoded contract principals that could become stale?
10. **Post-conditions** — Does the contract rely on post-conditions, or enforce safety internally?

## Known Clarity Behaviors (do NOT flag as bugs)
- `stx-get-balance` includes locked (stacked) STX — does NOT drop to 0 during PoX
- `define-fungible-token` with no max supply = unlimited, not zero
- `unwrap-panic` is valid when abort-on-failure is the correct behavior
- Initialize patterns are fine if guarded by deployer + one-time flag
- Read the README for documented limitations — don't flag acknowledged design decisions

## Output Format

```json
{
  "contract": "SP1234.my-contract",
  "risk_level": "critical|high|medium|low",
  "checks": [
    {
      "category": "authorization",
      "status": "pass|warn|fail",
      "detail": "What was found",
      "location": "function-name or line reference"
    }
  ],
  "summary": "One paragraph overall assessment",
  "recommendation": "Top 3 most important fixes"
}
```

## Rules
- Be specific — reference function names and code patterns
- Don't report documented limitations as findings
- Don't report known Clarity behaviors as bugs
- This is a quick scan, not a full audit — focus on the biggest risks
- If the contract looks solid, say so. Don't invent issues.

## Delivering Results

POST results to the x402 worker:
```bash
curl -X POST "https://x402-clarity.cocoa007.workers.dev/internal/job/{JOB_ID}/complete" \
  -H "Content-Type: application/json" \
  -d '{"status": "complete", "result": {<your JSON output>}}'
```
