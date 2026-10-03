import { handler } from "./handler.ts";

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

const queued = { id: 123, book: 62, chapter: 3, verse: 17 };

async function runScenario(options: {
  body?: Record<string, unknown>;
  verseMissing?: boolean;
  queueError?: boolean;
  reject?: number;
  rejectDescription?: string;
  markupRejected?: boolean;
  /** Fail only this chat, with a chat-specific Telegram error. */
  unreachableChat?: number;
}) {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; method: string; body: Record<string, unknown> }[] = [];
  Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-key");
  Deno.env.set("CRON_SECRET", "test-secret");
  Deno.env.set("TELEGRAM_BOT_TOKEN", "test-token");
  globalThis.fetch = (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = JSON.parse(String(init?.body ?? "{}"));
    calls.push({ url, method, body });
    if (url.includes("/rest/v1/telegram_queue") && method === "GET") {
      return Promise.resolve(Response.json(options.queueError ? { message: "DB unavailable" } : queued,
        { status: options.queueError ? 500 : 200 }));
    }
    if (url.includes("/bible/")) {
      return Promise.resolve(Response.json(options.verseMissing ? {} : {
        title: "1 John", chapters: [{}, {}, { verses: Array(17).fill("Verse text") }],
      }));
    }
    if (url.endsWith("/getMe")) {
      return Promise.resolve(Response.json({ ok: true, result: { username: "verse_bot" } }));
    }
    if (url.includes("/rest/v1/telegram_subscribers") && method === "GET") {
      return Promise.resolve(Response.json(url.includes("username=")
        ? [{ chat_id: 749661969 }] : [{ chat_id: 11 }, { chat_id: 22 }]));
    }
    if (url.endsWith("/sendMessage")) {
      if (options.unreachableChat === body.chat_id) {
        return Promise.resolve(Response.json(
          { ok: false, error_code: 400, description: "Bad Request: chat not found" }, { status: 400 }));
      }
      const code = options.reject ?? (options.markupRejected && body.reply_markup ? 400 : undefined);
      const description = options.rejectDescription ??
        (code === 400 ? "Bad Request: reply markup is too long" : "Unauthorized");
      return Promise.resolve(Response.json(code
        ? { ok: false, error_code: code, description }
        : { ok: true }, { status: code ?? 200 }));
    }
    if (url.includes("/rest/v1/") && ["POST", "DELETE", "PATCH"].includes(method)) {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  try {
    const response = await handler(new Request("https://test/functions/v1/telegram-verse", {
      method: "POST", headers: { authorization: "Bearer test-secret" },
      body: JSON.stringify(options.body ?? {}),
    }));
    return { status: response.status, body: await response.json(), calls };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

Deno.test("test sends only to @lijaleme without queue/history mutations", async () => {
  const result = await runScenario({ body: { test: true } });
  assert(result.status === 200 && result.body.sent === 1, "test should send once");
  assert(result.body.shareButtonOmitted === 0, "normal send should retain its button");
  const sends = result.calls.filter((c) => c.url.endsWith("/sendMessage"));
  assert(sends.length === 1 && sends[0].body.chat_id === 749661969, "wrong test recipient");
  assert(!result.calls.some((c) => c.url.includes("/rest/") && c.method !== "GET"), "test mutated database");
});

Deno.test("queued verse loading failure cannot generate a replacement or remove the pin", async () => {
  const result = await runScenario({ verseMissing: true });
  assert(result.status === 500, "failure should be visible");
  assert(!result.calls.some((c) => c.method !== "GET"), "unexpected fallback or write");
});

Deno.test("database queue errors cannot be mistaken for an empty queue", async () => {
  const result = await runScenario({ queueError: true });
  assert(result.status === 500, "failure should be visible");
  assert(!result.calls.some((c) => c.method !== "GET"), "unexpected fallback or write");
});

Deno.test("zero deliveries returns failure and preserves queue and history", async () => {
  const result = await runScenario({ reject: 401 });
  assert(result.status === 502 && result.body.sent === 0, "must report failure");
  assert(result.body.failures[0].code === 401, "Telegram error missing");
  assert(!result.calls.some((c) => c.url.includes("/rest/") && c.method !== "GET"), "failed send mutated database");
});

Deno.test("invalid share markup retries just the verse and completes the queue", async () => {
  const result = await runScenario({ markupRejected: true });
  assert(result.status === 200 && result.body.sent === 2, "fallback must deliver");
  assert(result.body.shareButtonOmitted === 2, "recovered markup errors should be reported");
  assert(result.calls.filter((c) => c.url.endsWith("/sendMessage")).length === 4, "each rejected button should retry once");
  assert(result.calls.some((c) => c.method === "DELETE"), "delivered queue should advance");
  assert(result.calls.some((c) => c.url.includes("verse_history") && c.method === "POST"), "delivery should be recorded");
});

Deno.test("test typos and unsupported recipient overrides cannot broadcast", async () => {
  for (const body of [{ test: "true" }, { chat_id: 749661969 }]) {
    const result = await runScenario({ body });
    assert(result.status === 400 && result.calls.length === 0, "unsafe body should be rejected before sending");
  }
});

Deno.test("one unreachable chat cannot pin the queue or resend to everyone tomorrow", async () => {
  const result = await runScenario({ unreachableChat: 22 });
  assert(result.body.sent === 1 && result.body.failed === 1, "one delivery and one failure expected");
  assert(result.status === 207, "partial delivery should be visible but not reported as total failure");
  assert(result.calls.some((c) => c.url.includes("telegram_queue") && c.method === "DELETE"),
    "a verse that reached anyone must leave the queue");
  assert(result.calls.some((c) => c.url.includes("verse_history") && c.method === "POST"),
    "a verse that reached anyone must be recorded");
  const deactivations = result.calls.filter((c) => c.url.includes("telegram_subscribers") && c.method === "PATCH");
  assert(deactivations.length === 1 && deactivations[0].url.includes("22"), "the unreachable chat should be deactivated");
  assert(!deactivations[0].url.includes("11"), "the reachable chat must stay active");
  assert(result.body.deactivated === 1, "deactivation should be reported");
});

Deno.test("an error every recipient hits is the message's fault, not the chats'", async () => {
  // If nothing got through, "chat not found" can't be trusted as chat-specific
  // (a wrong token for another bot says exactly that) — never mass-deactivate.
  const result = await runScenario({ reject: 400, rejectDescription: "Bad Request: chat not found" });
  assert(result.status === 502 && result.body.sent === 0, "total failure must be reported");
  assert(!result.calls.some((c) => c.url.includes("/rest/") && c.method !== "GET"),
    "a total failure must not deactivate anyone, advance the queue, or log history");
});

Deno.test("test mode never deactivates, even when the test chat is unreachable", async () => {
  const result = await runScenario({ body: { test: true }, unreachableChat: 749661969 });
  assert(result.body.sent === 0, "unreachable test chat should not count as sent");
  assert(!result.calls.some((c) => c.url.includes("/rest/") && c.method !== "GET"), "test mutated database");
});
