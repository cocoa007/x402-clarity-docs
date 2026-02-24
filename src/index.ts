import { Hono } from "hono";
import { cors } from "hono/cors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Bindings = {
  AUDIT_KV: KVNamespace;
  NETWORK: string;
  RECIPIENT_ADDRESS: string;
  RESULTS_BASE_URL: string;
};

type RequestType = "explain" | "functions" | "audit-quick" | "diff" | "audit-full" | "post-conditions";

interface JobRequest {
  type: RequestType;
  contractId?: string;
  source?: string;
  // For diff
  oldContractId?: string;
  newContractId?: string;
  oldSource?: string;
  newSource?: string;
  // For audit-full
  repo?: string;
  contract?: string;
  // Callback
  callback_address?: string;
}

interface JobRecord {
  job_id: string;
  type: RequestType;
  status: "queued" | "in-progress" | "complete" | "failed";
  request: JobRequest;
  created_at: string;
  updated_at: string;
  result?: any;
  results_url?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Prices in sats
const PRICES: Record<RequestType, number> = {
  "explain": 300,
  "functions": 100,
  "audit-quick": 500,
  "diff": 500,
  "audit-full": 1000,
  "post-conditions": 500,
};

const ESTIMATES: Record<RequestType, string> = {
  "explain": "2-5 minutes",
  "functions": "2-5 minutes",
  "audit-quick": "5-10 minutes",
  "diff": "2-5 minutes",
  "audit-full": "10-20 minutes",
  "post-conditions": "5-10 minutes",
};

const JOB_PREFIX = "job:";
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
    version: "3.0.0",
    description:
      "Clarity smart contract analysis and security audits. All requests are queued and processed asynchronously. Pay with sBTC via x402.",
    endpoints: [
      { path: "/api/request", method: "POST", description: "Submit a job (explain, functions, audit-quick, diff, audit-full, post-conditions)", paymentRequired: true },
      { path: "/api/status/:id", method: "GET", description: "Check job status and get results", free: true },
      { path: "/api/jobs", method: "GET", description: "List recent jobs", free: true },
    ],
    types: {
      "explain": { price: "300 sats", description: "Explain a contract in plain English", estimated: "2-5 minutes" },
      "functions": { price: "100 sats", description: "List and document all public/read-only functions", estimated: "2-5 minutes" },
      "audit-quick": { price: "500 sats", description: "Quick security checklist", estimated: "5-10 minutes" },
      "diff": { price: "500 sats", description: "Compare two contract versions", estimated: "2-5 minutes" },
      "audit-full": { price: "1000 sats", description: "Full security audit with exploit tests", estimated: "10-20 minutes" },
      "post-conditions": { price: "500 sats", description: "Analyze post-condition coverage for safe transaction calls", estimated: "5-10 minutes" },
    },
    payment: {
      asset: "stacks:1/sip010:SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token.sbtc-token",
      network: "stacks:1",
      recipient: "bc1qv8dt3v9kx3l7r9mnz2gj9r9n9k63frn6w6zmrt",
    },
    portfolio: "https://cocoa007.github.io/clarity-audit",
  });
});

// ---------------------------------------------------------------------------
// Bazaar / Discovery — x402 compatible listing
// ---------------------------------------------------------------------------

app.get("/list", (c) => {
  const baseUrl = "https://x402-clarity.cocoa007.workers.dev";
  const recipient = c.env.RECIPIENT_ADDRESS;
  const network = c.env.NETWORK;

  const items = Object.entries(PRICES).map(([type, price]) => ({
    resource: `${baseUrl}/api/request`,
    type: "http",
    x402Version: 2,
    lastUpdated: "2026-02-21T14:00:00.000Z",
    metadata: {
      name: `clarity-${type}`,
      description: ESTIMATES[type as RequestType]
        ? `${type}: ${(Object.entries(PRICES) as [string, number][]).find(([t]) => t === type)?.[1]} sats — ${ESTIMATES[type as RequestType]}`
        : type,
      category: "smart-contract-analysis",
      provider: "cocoa007",
    },
    accepts: [
      {
        scheme: "exact",
        asset: "stacks:1/sip010:SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token.sbtc-token",
        network: "stacks:1",
        payTo: recipient,
        maxAmountRequired: String(price),
        maxTimeoutSeconds: 300,
        description: `Clarity ${type}`,
        mimeType: "application/json",
        resource: `${baseUrl}/api/request`,
        outputSchema: {
          input: {
            method: "POST",
            type: "http",
            body: { type, contractId: "string", source: "string (optional)" },
          },
          output: {
            type: "application/json",
            schema: { job_id: "string", status: "string", status_url: "string" },
          },
        },
      },
    ],
  }));

  return c.json({ items, count: items.length });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function addToQueue(kv: KVNamespace, jobId: string): Promise<void> {
  const raw = await kv.get(QUEUE_KEY);
  const queue: string[] = raw ? JSON.parse(raw) : [];
  queue.push(jobId);
  await kv.put(QUEUE_KEY, JSON.stringify(queue));
}

// ---------------------------------------------------------------------------
// POST /api/request — submit any job type
// ---------------------------------------------------------------------------

app.post("/api/request", async (c) => {
  const body = await c.req.json<JobRequest>();

  // Validate type
  const type = body.type;
  if (!type || !Object.keys(PRICES).includes(type)) {
    return c.json({
      error: `Invalid type. Must be one of: ${Object.keys(PRICES).join(", ")}`,
    }, 400);
  }

  // Validate input based on type
  if (type === "diff") {
    if (!(body.oldContractId || body.oldSource) || !(body.newContractId || body.newSource)) {
      return c.json({ error: "Diff requires old and new contractId or source." }, 400);
    }
  } else if (type === "audit-full") {
    if (!body.source && !(body.repo && body.contract)) {
      return c.json({ error: "Full audit requires source or repo + contract path." }, 400);
    }
  } else {
    if (!body.contractId && !body.source) {
      return c.json({ error: "Provide contractId or source." }, 400);
    }
  }

  // x402 payment gate
  const verified = c.req.header("x-payment-verified");
  if (verified !== "true") {
    const amount = String(PRICES[type]);
    c.header("X-Payment-Required", "true");
    c.header("X-Payment-Amount", amount);
    c.header("X-Payment-Asset", "stacks:1/sip010:SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token.sbtc-token");
    c.header("X-Payment-Network", "stacks:1");
    c.header("X-Payment-Recipient", c.env.RECIPIENT_ADDRESS);
    c.header("X-Payment-Description", `Clarity ${type} — ${amount} sats sBTC`);
    return c.json({
      status: 402,
      message: `Payment required: ${amount} sats sBTC`,
      payment: {
        amount,
        asset: "stacks:1/sip010:SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token.sbtc-token",
        network: "stacks:1",
        recipient: c.env.RECIPIENT_ADDRESS,
        description: `Clarity ${type}`,
      },
    }, 402);
  }

  // Payment verified — create job
  const jobId = crypto.randomUUID();
  const now = new Date().toISOString();

  const record: JobRecord = {
    job_id: jobId,
    type,
    status: "queued",
    request: body,
    created_at: now,
    updated_at: now,
  };

  await c.env.AUDIT_KV.put(
    `${JOB_PREFIX}${jobId}`,
    JSON.stringify(record),
    { expirationTtl: 60 * 60 * 24 * 30 }
  );

  await addToQueue(c.env.AUDIT_KV, jobId);

  return c.json({
    job_id: jobId,
    type,
    status: "queued",
    estimated_completion: ESTIMATES[type],
    status_url: `/api/status/${jobId}`,
    callback: body.callback_address
      ? "Will notify via inbox when complete"
      : null,
  });
});

// ---------------------------------------------------------------------------
// GET /api/status/:id — check job status + results
// ---------------------------------------------------------------------------

app.get("/api/status/:id", async (c) => {
  const id = c.req.param("id");
  const raw = await c.env.AUDIT_KV.get(`${JOB_PREFIX}${id}`);
  if (!raw) return c.json({ error: "Job not found" }, 404);

  const record: JobRecord = JSON.parse(raw);
  return c.json({
    job_id: record.job_id,
    type: record.type,
    status: record.status,
    created_at: record.created_at,
    updated_at: record.updated_at,
    result: record.result || null,
    results_url: record.results_url || null,
    error: record.error || null,
  });
});

// ---------------------------------------------------------------------------
// GET /api/jobs — list recent jobs
// ---------------------------------------------------------------------------

app.get("/api/jobs", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") || "20"), 100);
  const list = await c.env.AUDIT_KV.list({ prefix: JOB_PREFIX, limit });

  const jobs: any[] = [];
  for (const key of list.keys) {
    const raw = await c.env.AUDIT_KV.get(key.name);
    if (!raw) continue;
    const record: JobRecord = JSON.parse(raw);
    jobs.push({
      job_id: record.job_id,
      type: record.type,
      status: record.status,
      created_at: record.created_at,
      result: record.status === "complete" ? (record.result ? "available" : null) : null,
      results_url: record.results_url || null,
    });
  }

  jobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return c.json({ jobs, count: jobs.length });
});

// ---------------------------------------------------------------------------
// Internal endpoints (agent polls these)
// ---------------------------------------------------------------------------

// GET /internal/queue — pending job IDs
app.get("/internal/queue", async (c) => {
  const raw = await c.env.AUDIT_KV.get(QUEUE_KEY);
  const queue: string[] = raw ? JSON.parse(raw) : [];
  return c.json({ pending: queue });
});

// GET /internal/job/:id — full job record including request details
app.get("/internal/job/:id", async (c) => {
  const id = c.req.param("id");
  const raw = await c.env.AUDIT_KV.get(`${JOB_PREFIX}${id}`);
  if (!raw) return c.json({ error: "Not found" }, 404);
  return c.json(JSON.parse(raw));
});

// POST /internal/job/:id/complete — agent posts results
app.post("/internal/job/:id/complete", async (c) => {
  const id = c.req.param("id");
  const raw = await c.env.AUDIT_KV.get(`${JOB_PREFIX}${id}`);
  if (!raw) return c.json({ error: "Not found" }, 404);

  const record: JobRecord = JSON.parse(raw);
  const update = await c.req.json<{
    status: "in-progress" | "complete" | "failed";
    result?: any;
    results_url?: string;
    error?: string;
  }>();

  record.status = update.status;
  record.updated_at = new Date().toISOString();
  if (update.result) record.result = update.result;
  if (update.results_url) record.results_url = update.results_url;
  if (update.error) record.error = update.error;

  await c.env.AUDIT_KV.put(
    `${JOB_PREFIX}${id}`,
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
