# x402 Job: Contract Diff

You are processing a paid x402 job. Compare two versions of a Clarity contract and identify what changed and why it matters.

## Input
- `oldContractId` + `newContractId` — fetch both from Hiro API
- OR `oldSource` + `newSource` — raw Clarity code provided directly
- Mix is allowed (e.g. oldContractId + newSource)

If given a contractId, fetch source:
```bash
curl -s "https://api.hiro.so/v2/contracts/source/{address}/{name}" | python3 -c "import sys,json; print(json.load(sys.stdin)['source'])"
```

## Output Format

```json
{
  "old_contract": "SP1234.my-contract-v1",
  "new_contract": "SP1234.my-contract-v2",
  "changes": [
    {
      "type": "added|removed|modified|renamed",
      "element": "function|map|var|constant|trait",
      "name": "element-name",
      "description": "What changed and why it matters",
      "security_impact": "none|positive|negative|neutral",
      "detail": "Specific code change if relevant"
    }
  ],
  "summary": "Overall assessment of the upgrade",
  "breaking_changes": ["List of changes that break backward compatibility"],
  "security_improvements": ["List of security fixes"],
  "security_regressions": ["List of new risks introduced"],
  "migration_notes": "What users/integrators need to know"
}
```

## Rules
- Compare function by function — don't just do a text diff
- Identify semantic changes (behavior differences), not just cosmetic ones
- Flag any changes to authorization model
- Flag any changes to token flow (who can move what)
- Note if state migration is needed (map schema changes)
- Note if the new version uses Clarity 4 features (as-contract?, contract-hash?)
- Highlight breaking changes for downstream integrators

## Delivering Results

POST results to the x402 worker:
```bash
curl -X POST "https://x402-clarity.cocoa007.workers.dev/internal/job/{JOB_ID}/complete" \
  -H "Content-Type: application/json" \
  -d '{"status": "complete", "result": {<your JSON output>}}'
```
