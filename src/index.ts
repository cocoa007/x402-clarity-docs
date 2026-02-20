import { Hono } from "hono";
import { cors } from "hono/cors";

type Bindings = {
  NETWORK: string;
  X402_RELAY_URL: string;
  RECIPIENT_ADDRESS: string;
  OPENROUTER_API_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("/*", cors());

// Health + service discovery
app.get("/", (c) => {
  return c.json({
    service: "x402-clarity-docs",
    version: "0.1.0",
    description:
      "Pay-per-query Clarity smart contract documentation and analysis. Powered by sBTC.",
    endpoints: [
      {
        path: "/api/explain",
        method: "POST",
        description:
          "Explain a Clarity contract — functions, state, risks, plain English",
        paymentRequired: true,
        price: { amount: 0.000003, tokenType: "sBTC" },
      },
      {
        path: "/api/functions",
        method: "POST",
        description:
          "List and document all public/read-only functions in a contract",
        paymentRequired: true,
        price: { amount: 0.000001, tokenType: "sBTC" },
      },
      {
        path: "/api/audit-quick",
        method: "POST",
        description:
          "Quick security checklist — common Clarity pitfalls and red flags",
        paymentRequired: true,
        price: { amount: 0.000005, tokenType: "sBTC" },
      },
      {
        path: "/api/diff",
        method: "POST",
        description:
          "Compare two contract versions — what changed and why it matters",
        paymentRequired: true,
        price: { amount: 0.000005, tokenType: "sBTC" },
      },
    ],
    payment: {
      tokenType: "sBTC",
      network: "mainnet",
    },
  });
});

// ---------- Helpers ----------

async function fetchContractSource(
  contractId: string
): Promise<string | null> {
  // contractId = "SP….<contract-name>"
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
  const res = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
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
    }
  );
  if (!res.ok) throw new Error(`LLM error: ${res.status}`);
  const data = (await res.json()) as any;
  return data.choices?.[0]?.message?.content ?? "No response";
}

// ---------- x402 middleware stub ----------
// In production, wire up @4x02/middleware. For now we trust the relay header.

function requirePayment(amount: string, tokenType: string) {
  return async (c: any, next: any) => {
    // x402 relay sets x-payment-verified header after settlement
    const verified = c.req.header("x-payment-verified");
    if (verified === "true") {
      await next();
      return;
    }
    // Return 402 with payment details
    return c.json(
      {
        status: 402,
        message: `Payment required: ${amount} ${tokenType}`,
        payment: {
          amount,
          tokenType,
          recipient: c.env.RECIPIENT_ADDRESS,
          network: c.env.NETWORK,
        },
      },
      402
    );
  };
}

// ---------- Routes ----------

// Explain a contract
app.post("/api/explain", requirePayment("300", "sBTC"), async (c) => {
  const body = await c.req.json<{ contractId?: string; source?: string }>();
  const source =
    body.source ?? (body.contractId ? await fetchContractSource(body.contractId) : null);
  if (!source) return c.json({ error: "Provide contractId or source" }, 400);

  const result = await askLLM(
    c.env.OPENROUTER_API_KEY,
    `You are an expert Clarity smart contract analyst. Explain the contract in plain English. Cover: purpose, state (maps/vars), public functions, authorization model, risks/concerns. Be concise but thorough.`,
    source
  );
  return c.json({ explanation: result, contractId: body.contractId });
});

// List functions
app.post("/api/functions", requirePayment("100", "sBTC"), async (c) => {
  const body = await c.req.json<{ contractId?: string; source?: string }>();
  const source =
    body.source ?? (body.contractId ? await fetchContractSource(body.contractId) : null);
  if (!source) return c.json({ error: "Provide contractId or source" }, 400);

  const result = await askLLM(
    c.env.OPENROUTER_API_KEY,
    `You are a Clarity documentation generator. For each public and read-only function in this contract, output: name, parameters (with types), return type, and a one-line description. Format as JSON array.`,
    source
  );
  return c.json({ functions: result, contractId: body.contractId });
});

// Quick audit
app.post("/api/audit-quick", requirePayment("500", "sBTC"), async (c) => {
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

// Diff two versions
app.post("/api/diff", requirePayment("500", "sBTC"), async (c) => {
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

export default app;
