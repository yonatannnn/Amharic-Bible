// Supabase Edge Function: sends an FCM push when a new message is inserted.
// Wire it to a Database Webhook on `messages` (INSERT).
//
// Deploy:   supabase functions deploy notify --no-verify-jwt
// Secrets:  supabase secrets set FIREBASE_SERVICE_ACCOUNT="$(cat service-account.json)"
//           (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are provided automatically)
//
// Then create a Database Webhook: Database → Webhooks → new →
//   table=messages, events=INSERT, type=Supabase Edge Function → notify.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

function b64url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64url(new Uint8Array(sig))}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const json = await res.json();
  return json.access_token;
}

async function sendToToken(sa: ServiceAccount, accessToken: string, token: string, title: string, body: string, data: Record<string, string>) {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        data,
        android: { priority: "high", notification: { channel_id: "messages" } },
      },
    }),
  });
  return res.ok;
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record;
    const table = payload.table;
    if (!record) return new Response("ignored", { status: 200 });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const sa = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT")!) as ServiceAccount;
    const accessToken = await getAccessToken(sa);

    // ---- Friend request (friendships INSERT, pending) ----
    if (table === "friendships") {
      if (record.status !== "pending") return new Response("not pending", { status: 200 });
      const [{ data: requester }, { data: tokens }] = await Promise.all([
        supabase.from("profiles").select("name, username, avatar_url").eq("id", record.requester_id).single(),
        supabase.from("device_tokens").select("token").eq("user_id", record.addressee_id),
      ]);
      if (!tokens || tokens.length === 0) return new Response("no tokens", { status: 200 });
      const name = requester?.name ?? requester?.username ?? "Someone";
      const data = { type: "friend-request", senderName: name, senderAvatar: requester?.avatar_url ?? "" };
      let sent = 0;
      for (const t of tokens) {
        if (await sendToToken(sa, accessToken, t.token, name, "sent you a friend request 👋", data)) sent++;
      }
      return new Response(JSON.stringify({ sent }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // ---- New message (messages INSERT) ----
    const msg = record;
    if (!msg.friendship_id) return new Response("ignored", { status: 200 });

    const { data: fr } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id")
      .eq("id", msg.friendship_id)
      .single();
    if (!fr) return new Response("no friendship", { status: 200 });
    const recipientId = fr.requester_id === msg.sender_id ? fr.addressee_id : fr.requester_id;

    const [{ data: sender }, { data: tokens }] = await Promise.all([
      supabase.from("profiles").select("name, username, avatar_url").eq("id", msg.sender_id).single(),
      supabase.from("device_tokens").select("token").eq("user_id", recipientId),
    ]);
    if (!tokens || tokens.length === 0) return new Response("no tokens", { status: 200 });

    const senderName = sender?.name ?? sender?.username ?? "A friend";
    const body = msg.type === "verse"
      ? "📖 Shared a verse"
      : msg.type === "image"
      ? "🖼 Sent a photo"
      : (msg.text ?? "New message");
    const data = {
      friendshipId: String(msg.friendship_id),
      type: "message",
      senderName,
      senderAvatar: sender?.avatar_url ?? "",
    };

    let sent = 0;
    for (const t of tokens) {
      if (await sendToToken(sa, accessToken, t.token, senderName, body, data)) sent++;
    }
    return new Response(JSON.stringify({ sent }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(`error: ${e}`, { status: 200 });
  }
});
