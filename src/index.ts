import { Hono } from "hono";
import { cors } from "hono/cors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Bindings = {
  AUDIT_KV: KVNamespace;
  NETWORK: string;
  X402_RELAY_URL: string;
  RECIPIENT_ADDRESS: string;
  OPENROUTER_API_KEY: string;
  RESULTS_BASE_URL: string;
};

type AuditTier = "quick" | "full";

interface AuditRequest {
  tier: AuditTier;
  repo?: string;
  contract?: string;
  source?: string;
  callback_address?: string;
}

interface AuditRecord {
  audit_id: string;
  tier: AuditTier;
  status: "queued" | "in-progress" | "complete" | "failed";
  repo?: string;
  contract?: string;
  source?: string;
  callback_address?: string;
  created_at: string;
  updated_at: string;
  results_url?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUDIT_PRICES: Record<AuditTier, string> = {
  quick: "200",  // sats
  full: "1000",
};

const AUDIT_PREFIX = "audit:";
const QUEUE_KEY = "queue:pending";

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = new Hono<{ Bindings: Bindings }>();

app.use("/*", cors());

// ---------------------------------------------------------------------------
// Service discovery
// ---------------------------------------------------------------------------

app.get("/", (c) => {
  return c.json({
    service: "x402-clarity",
    version: "2.0.0",
    description:
      "Clarity smart contract documentation, analysis, and security audits. Pay-per-query with sBTC via x402.",
    endpoints: {
      docs: [
        {
          path: "/api/explain",
          method: "POST",
          description: "Explain a Clarity contract in plain English",
          price: "300 sats",
        },
        {
          path: "/api/functions",
          method: "POST",
          description: "List and document all public/read-only functions",
          price: "100 sats",
        },
        {
          path: "/api/audit-quick",
          method: "POST",
          description: "Quick security checklist — common Clarity pitfalls",
          price: "500 sats",
        },
        {
          path: "/api/diff",
          method: "POST",
          description: "Compare two contract versions",
          price: "500 sats",
        },
      ],
      audits: [
        {
          path: "/api/audit-request",
          method: "POST",
          description: "Submit a contract for full security audit (queued, async)",
          tiers: {
            quick: { price: "200 sats", estimated: "5 minutes" },
            full: { price: "1000 sats", estimated: "15 minutes" },
          },
        },
        {
          path: "/api/audit-status/:id",
          method: "GET",
          description: "Check audit status",
          free: true,
        },
        {
          path: "/api/audits",
          method: "GET",
          description: "List recent audits",
          free: true,
        },
      ],
    },
    payment: {
      tokenType: "sBTC",
      network: "mainnet",
      recipient: "bc1qv8dt3v9kx3l7r9mnz2gj9r9n9k63frn6w6zmrt",
    },
    portfolio: "https://cocoa007.github.io/clarity-audit",
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchContractSource(contractId: string): Promise<string | null> {
  const [addr, name] = contractId.split(".");
  if (!addr || !name) return null;
  const url = `https://api.hiro.so/v2/contracts/source/${addr}/${name}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as { source: string };
  return data.source;
}

async function askLLM(
  apiKey: string,
  system: string,
  user: string
): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-4-20250514",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 4096,
    }),
  });
  if (!res.ok) throw new Error(`LLM error: ${res.status}`);
  const data = (await res.json()) as any;
  return data.choices?.[0]?.message?.content ?? "No response";
}

// ---------------------------------------------------------------------------
// x402 payment middleware
// ---------------------------------------------------------------------------

function requirePayment(amount: string) {
  return async (c: any, next: any) => {
    const verified = c.req.header("x-payment-verified");
    if (verified === "true") {
      await next();
      return;
    }
    c.header("X-Payment-Required", "true");
    c.header("X-Payment-Amount", amount);
    c.header("X-Payment-Token", "sBTC");
    c.header("X-Payment-Network", c.env.NETWORK);
    c.header("X-Payment-Recipient", c.env.RECIPIENT_ADDRESS);
    return c.json(
      {
        status: 402,
        message: `Payment required: ${amount} sats sBTC`,
        payment: {
          amount,
          tokenType: "sBTC",
          recipient: c.env.RECIPIENT_ADDRESS,
          network: c.env.NETWORK,
        },
      },
      402
    );
  };
}

// ---------------------------------------------------------------------------
// Docs endpoints
// ---------------------------------------------------------------------------

app.post("/api/explain", requirePayment("300"), async (c) => {
  const body = await c.req.json<{ contractId?: string; source?: string }>();
  const source =
    body.source ?? (body.contractId ? await fetchContractSource(body.contractId) : null);
  if (!source) return c.json({ error: "Provide contractId or source" }, 400);

  const result = await askLLM(
    c.env.OPENROUTER_API_KEY,
    "You are an expert Clarity smart contract analyst. Explain the contract in plain English. Cover: purpose, state (maps/vars), public functions, authorization model, risks/concerns. Be concise but thorough.",
    source
  );
  return c.json({ explanation: result, contractId: body.contractId });
});

app.post("/api/functions", requirePayment("100"), async (c) => {
  const body = await c.req.json<{ contractId?: string; source?: string }>();
  const source =
    body.source ?? (body.contractId ? await fetchContractSource(body.contractId) : null);
  if (!source) return c.json({ error: "Provide contractId or source" }, 400);

  const result = await askLLM(
    c.env.OPENROUTER_API_KEY,
    "You are a Clarity documentation generator. For each public and read-only function in this contract, output: name, parameters (with types), return type, and a one-line description. Format as JSON array.",
    source
  );
  return c.json({ functions: result, contractId: body.contractId });
});

app.post("/api/audit-quick", requirePayment("500"), async (c) => {
  const body = await c.req.json<{ contractId?: string; source?: string }>();
  const source =
    body.source ?? (body.contractId ? await fetchContractSource(body.contractId) : null);
  if (!source) return c.json({ error: "Provide contractId or source" }, 400);

  const result = await askLLM(
    c.env.OPENROUTER_API_KEY,
    `You are a Clarity security auditor. Check this contract for common issues:
- Unchecked authorization (missing tx-sender checks)
- Reentrancy-like patterns
- Integer overflow/underflow
- Unprotected admin functions
- Missing post-conditions
- Unsafe unwrap usage
- Map/var manipulation without proper guards
Rate severity (critical/high/medium/low/info). Be specific with line references.`,
    source
  );
  return c.json({ audit: result, contractId: body.contractId });
});

app.post("/api/diff", requirePayment("500"), async (c) => {
  const body = await c.req.json<{
    oldContractId?: string;
    newContractId?: string;
    oldSource?: string;
    newSource?: string;
  }>();
  const oldSource =
    body.oldSource ??
    (body.oldContractId ? await fetchContractSource(body.oldContractId) : null);
  const newSource =
    body.newSource ??
    (body.newContractId ? await fetchContractSource(body.newContractId) : null);
  if (!oldSource || !newSource)
    return c.json({ error: "Provide both old and new contractId or source" }, 400);

  const result = await askLLM(
    c.env.OPENROUTER_API_KEY,
    `You are a Clarity contract diff analyst. Compare these two contract versions. Identify:
- New functions added
- Functions removed or renamed
- Changed behavior in existing functions
- State/map changes
- Security implications of the changes
Be specific and concise.`,
    `=== OLD VERSION ===\n${oldSource}\n\n=== NEW VERSION ===\n${newSource}`
  );
  return c.json({
    diff: result,
    oldContractId: body.oldContractId,
    newContractId: body.newContractId,
  });
});

// ---------------------------------------------------------------------------
// Audit queue endpoints (paid)
// ---------------------------------------------------------------------------

async function addToQueue(kv: KVNamespace, auditId: string): Promise<void> {
  const raw = await kv.get(QUEUE_KEY);
  const queue: string[] = raw ? JSON.parse(raw) : [];
  queue.push(auditId);
  await kv.put(QUEUE_KEY, JSON.stringify(queue));
}

app.post("/api/audit-request", async (c) => {
  const body = await c.req.json<AuditRequest>();

  const tier = body.tier;
  if (!tier || !["quick", "full"].includes(tier)) {
    return c.json({ error: 'Invalid tier. Must be "quick" or "full".' }, 400);
  }

  if (!body.source && !(body.repo && body.contract)) {
    return c.json({ error: "Provide either source or repo + contract path." }, 400);
  }

  // x402 payment gate (dynamic price based on tier)
  const verified = c.req.header("x-payment-verified");
  if (verified !== "true") {
    const amount = AUDIT_PRICES[tier];
    c.header("X-Payment-Required", "true");
    c.header("X-Payment-Amount", amount);
    c.header("X-Payment-Token", "sBTC");
    c.header("X-Payment-Network", c.env.NETWORK);
    c.header("X-Payment-Recipient", c.env.RECIPIENT_ADDRESS);
    c.header("X-Payment-Description", `Clarity ${tier} audit — ${amount} sats sBTC`);
    return c.json(
      {
        status: 402,
        message: `Payment required: ${amount} sats sBTC`,
        payment: {
          amount,
          tokenType: "sBTC",
          recipient: c.env.RECIPIENT_ADDRESS,
          network: c.env.NETWORK,
          description: `Clarity ${tier} audit`,
        },
      },
      402
    );
  }

  // Payment verified — create audit record
  const auditId = crypto.randomUUID();
  const now = new Date().toISOString();

  const record: AuditRecord = {
    audit_id: auditId,
    tier,
    status: "queued",
    repo: body.repo,
    contract: body.contract,
    source: body.source,
    callback_address: body.callback_address,
    created_at: now,
    updated_at: now,
  };

  await c.env.AUDIT_KV.put(
    `${AUDIT_PREFIX}${auditId}`,
    JSON.stringify(record),
    { expirationTtl: 60 * 60 * 24 * 30 }
  );

  await addToQueue(c.env.AUDIT_KV, auditId);

  return c.json({
    audit_id: auditId,
    tier,
    status: "queued",
    estimated_completion: tier === "quick" ? "5 minutes" : "15 minutes",
    results_url: `${c.env.RESULTS_BASE_URL}/${auditId}.html`,
    callback: body.callback_address
      ? "Will notify via inbox when complete"
      : null,
  });
});

// ---------------------------------------------------------------------------
// Audit status & listing (free)
// ---------------------------------------------------------------------------

app.get("/api/audit-status/:id", async (c) => {
  const id = c.req.param("id");
  const raw = await c.env.AUDIT_KV.get(`${AUDIT_PREFIX}${id}`);
  if (!raw) return c.json({ error: "Audit not found" }, 404);

  const record: AuditRecord = JSON.parse(raw);
  return c.json({
    audit_id: record.audit_id,
    tier: record.tier,
    status: record.status,
    created_at: record.created_at,
    updated_at: record.updated_at,
    results_url: record.status === "complete"
      ? `${c.env.RESULTS_BASE_URL}/${record.audit_id}.html`
      : null,
    error: record.error || null,
  });
});

app.get("/api/audits", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") || "20"), 100);
  const list = await c.env.AUDIT_KV.list({ prefix: AUDIT_PREFIX, limit });

  const audits: any[] = [];
  for (const key of list.keys) {
    const raw = await c.env.AUDIT_KV.get(key.name);
    if (!raw) continue;
    const record: AuditRecord = JSON.parse(raw);
    audits.push({
      audit_id: record.audit_id,
      tier: record.tier,
      status: record.status,
      repo: record.repo,
      contract: record.contract,
      created_at: record.created_at,
      results_url: record.status === "complete"
        ? `${c.env.RESULTS_BASE_URL}/${record.audit_id}.html`
        : null,
    });
  }

  audits.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return c.json({ audits, count: audits.length });
});

// ---------------------------------------------------------------------------
// Internal endpoints (agent polls these — protect with auth in production)
// ---------------------------------------------------------------------------

app.get("/internal/queue", async (c) => {
  const raw = await c.env.AUDIT_KV.get(QUEUE_KEY);
  const queue: string[] = raw ? JSON.parse(raw) : [];
  return c.json({ pending: queue });
});

app.get("/internal/audit/:id", async (c) => {
  const id = c.req.param("id");
  const raw = await c.env.AUDIT_KV.get(`${AUDIT_PREFIX}${id}`);
  if (!raw) return c.json({ error: "Not found" }, 404);
  return c.json(JSON.parse(raw));
});

app.post("/internal/audit/:id/status", async (c) => {
  const id = c.req.param("id");
  const raw = await c.env.AUDIT_KV.get(`${AUDIT_PREFIX}${id}`);
  if (!raw) return c.json({ error: "Not found" }, 404);

  const record: AuditRecord = JSON.parse(raw);
  const update = await c.req.json<{
    status: AuditRecord["status"];
    error?: string;
  }>();

  record.status = update.status;
  record.updated_at = new Date().toISOString();
  if (update.error) record.error = update.error;
  if (update.status === "complete") {
    record.results_url = `${c.env.RESULTS_BASE_URL}/${id}.html`;
  }

  await c.env.AUDIT_KV.put(
    `${AUDIT_PREFIX}${id}`,
    JSON.stringify(record),
    { expirationTtl: 60 * 60 * 24 * 30 }
  );

  // Remove from pending queue
  if (update.status !== "queued") {
    const qRaw = await c.env.AUDIT_KV.get(QUEUE_KEY);
    const queue: string[] = qRaw ? JSON.parse(qRaw) : [];
    await c.env.AUDIT_KV.put(
      QUEUE_KEY,
      JSON.stringify(queue.filter((qid) => qid !== id))
    );
  }

  return c.json({ ok: true, record });
});

export default app;
