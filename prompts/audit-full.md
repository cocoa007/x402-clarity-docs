# x402 Job: Full Security Audit

You are processing a paid x402 job. Perform a thorough security audit following the cocoa007 audit methodology.

## Input
- `repo` + `contract` — GitHub repo URL + contract path
- OR `source` — raw Clarity code provided directly
- OR `contractId` — deployed contract to fetch from Hiro API

## Methodology

Follow the full audit methodology at: `/home/node/.openclaw/workspace/memory/audit-methodology.md`

Key steps:
1. **Read the README** — check for documented limitations. Do NOT report acknowledged design decisions as findings.
2. **Cross-check Known Clarity Behaviors** — see methodology file. Do NOT report known language behaviors as bugs.
3. **Pin the commit hash** if auditing from a repo.
4. **Audit thoroughly** — all vulnerability classes.
5. **Verify each finding** — re-read the code. Ask: "Is this actually a bug?"
6. **Assign confidence** (High/Medium/Low).
7. **Write exploit tests** for Critical findings.

## Output Format

```json
{
  "contract": "owner/repo or contractId",
  "commit": "abc1234 (if from repo)",
  "clarity_version": "1|2|3|4",
  "confidence": "high|medium|low",
  "documented_limitations": ["List of limitations acknowledged in README"],
  "findings": [
    {
      "id": "C-01|H-01|M-01|L-01|I-01",
      "severity": "critical|high|medium|low|informational",
      "title": "One-line description",
      "location": "function name or file:line",
      "description": "What the bug is and why it matters",
      "code": "The vulnerable code snippet",
      "impact": "What an attacker can do / what breaks",
      "recommendation": "How to fix it"
    }
  ],
  "exploit_tests": "Clarity code for critical finding exploit tests",
  "summary": "Overall assessment paragraph",
  "recommendations": ["Top 3 most important fixes"]
}
```

## Common False Positives to Avoid
- `stx-get-balance` includes locked STX — does NOT drop to 0 during PoX stacking
- Initialize patterns are valid if guarded (deployer-only + one-time flag) — don't recommend removing them
- `define-fungible-token` with no max supply = unlimited, not zero
- `as-contract` in pre-Clarity 4 is a risk worth noting, but not always a bug
- `unwrap-panic` is valid when abort-on-failure is correct behavior
- Post-conditions are tx-level, not per-contract-call
- Documented limitations are not findings

## Clarity 4 Recommendations
When recommending fixes:
- Prefer `as-contract?` with `with-ft`/`with-nft`/`with-stx` over manual allowlist maps
- Mention `contract-hash?` for verifiable deployments
- Keep contracts deployment-agnostic (don't bake params into constants)

## Delivering Results

POST results to the x402 worker:
```bash
curl -X POST "https://x402-clarity.cocoa007.workers.dev/internal/job/{JOB_ID}/complete" \
  -H "Content-Type: application/json" \
  -d '{"status": "complete", "result": {<your JSON output>}}'
```

If the job includes `repo`, also:
- Generate an HTML report and push to cocoa007/clarity-audit
- Open an issue on the source repo with findings summary
- Save audit record to memory/audits/{project}-audit.md
