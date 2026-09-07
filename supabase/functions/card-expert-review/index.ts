import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.115.0";
import postgres from "npm:postgres@3.4.5";

const DB_URL = Deno.env.get("SUPABASE_DB_URL") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const sql = postgres(DB_URL, { prepare: false, max: 1, idle_timeout: 5 });
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});

type Ticket = {
  token_id: string;
  review_id: string;
  image_path: string;
  exact_image_sha256: string | null;
};

function noStoreHeaders(contentType = "application/json; charset=utf-8") {
  return {
    "Cache-Control": "no-store, private, max-age=0",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Type": contentType
  };
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: noStoreHeaders() });
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return json(405, { error: "GET required" });
  if (!DB_URL || !SUPABASE_URL || !SERVICE_ROLE) return json(503, { error: "Expert review handoff is not configured" });

  const url = new URL(req.url);
  const token = (url.searchParams.get("token") || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(token)) return json(401, { error: "Invalid or expired review token" });

  const tokenHash = await sha256Hex(token);
  let ticket: Ticket | null = null;

  try {
    ticket = await sql.begin(async (tx) => {
      const rows = await tx<Ticket[]>`
        select t.id::text as token_id,
               t.review_id::text as review_id,
               q.image_path,
               q.exact_image_sha256
          from private.card_expert_review_tokens t
          join private.card_expert_review_queue q on q.id=t.review_id
         where t.token_hash=${tokenHash}
           and t.expires_at > now()
           and t.used_at is null
           and q.status in ('pending','claimed')
         for update of t, q
         limit 1
      `;
      const row = rows[0];
      if (!row) return null;
      await tx`update private.card_expert_review_tokens set used_at=now() where id=${row.token_id}::uuid`;
      await tx`
        update private.card_expert_review_queue
           set status='claimed', claimed_at=coalesce(claimed_at,now()), updated_at=now()
         where id=${row.review_id}::uuid
      `;
      return row;
    });
  } catch (error) {
    console.error("Cardfolio expert review token exchange failed", { message: String((error as Error)?.message || error).slice(0, 240) });
    return json(500, { error: "Could not exchange review token" });
  }

  if (!ticket) return json(401, { error: "Invalid or expired review token" });

  try {
    const { data, error } = await admin.storage.from("card-images").download(ticket.image_path);
    if (error || !data) throw error || new Error("Image unavailable");
    const bytes = await data.arrayBuffer();
    const headers = noStoreHeaders(data.type || "image/jpeg");
    headers["Content-Disposition"] = "inline; filename=card-review-image";
    headers["X-Cardfolio-Review-Id"] = ticket.review_id;
    if (ticket.exact_image_sha256) headers["X-Cardfolio-Source-Sha256"] = ticket.exact_image_sha256;
    return new Response(bytes, { status: 200, headers });
  } catch (error) {
    try {
      await sql`
        update private.card_expert_review_queue
           set status='pending', claimed_at=null, last_error='image handoff failed', updated_at=now()
         where id=${ticket.review_id}::uuid
      `;
    } catch { /* noop */ }
    console.error("Cardfolio expert review image handoff failed", { reviewId: ticket.review_id, message: String((error as Error)?.message || error).slice(0, 240) });
    return json(404, { error: "Review image is unavailable" });
  }
});
