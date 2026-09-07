import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const MAX_IMAGE_DATA_URL = 3_400_000;
const MAX_OCR_TEXT = 5000;
const MAX_KNOWN_FIELDS = 5000;
const DEFAULT_MODEL = "gpt-5.6-sol";
const CANONICAL_ORIGIN = "https://saad-cardfolio-saadahmed0020-3481s-projects.vercel.app";
const ALLOWED_FIELDS = [
  "category","subject","year","manufacturer","brand","set_name","subset","card_number",
  "parallel","variant_name","serial_number","serial_denominator","team","league",
  "grading_company","grade","language","edition","rookie","autograph","relic","card_type"
] as const;

type JsonRecord = Record<string, unknown>;

function safeText(value: unknown, max = 1000): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
}
function clamp01(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}
function safeJson(value: unknown, max = MAX_KNOWN_FIELDS): string {
  try { return JSON.stringify(value ?? {}).slice(0, max); } catch { return "{}"; }
}
function isImageDataUrl(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 40
    && value.length <= MAX_IMAGE_DATA_URL
    && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$/i.test(value);
}
async function imageFingerprint(dataUrl: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(dataUrl));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowed = origin === CANONICAL_ORIGIN
    || /^https:\/\/cardfolio(?:-[a-z0-9-]+)?-saadahmed0020-3481s-projects\.vercel\.app$/i.test(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : CANONICAL_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  };
}
function json(req: Request, status: number, body: JsonRecord): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8" }
  });
}
function extractOutputText(response: JsonRecord): string {
  if (typeof response.output_text === "string") return response.output_text;
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    const content = Array.isArray((item as JsonRecord)?.content) ? (item as JsonRecord).content as unknown[] : [];
    for (const part of content) {
      const p = part as JsonRecord;
      if (p?.type === "output_text" && typeof p.text === "string") return p.text;
    }
  }
  return "";
}
function identifySchema(): JsonRecord {
  return {
    type: "object", additionalProperties: false,
    required: ["overall_confidence","visual_summary","observations","candidate_identity_clues","ambiguities","recommended_checks"],
    properties: {
      overall_confidence: { type: "number" },
      visual_summary: { type: "string" },
      observations: {
        type: "array",
        items: {
          type: "object", additionalProperties: false,
          required: ["field","value","confidence","evidence"],
          properties: {
            field: { type: "string", enum: [...ALLOWED_FIELDS] },
            value: { type: "string" },
            confidence: { type: "number" },
            evidence: { type: "string" }
          }
        }
      },
      candidate_identity_clues: { type: "array", items: { type: "string" } },
      ambiguities: { type: "array", items: { type: "string" } },
      recommended_checks: { type: "array", items: { type: "string" } }
    }
  };
}
function compareSchema(): JsonRecord {
  return {
    type: "object", additionalProperties: false,
    required: ["decision","match_score","summary","matching_evidence","differences","ambiguities"],
    properties: {
      decision: { type: "string", enum: ["accept","reject","ambiguous"] },
      match_score: { type: "number" },
      summary: { type: "string" },
      matching_evidence: { type: "array", items: { type: "string" } },
      differences: { type: "array", items: { type: "string" } },
      ambiguities: { type: "array", items: { type: "string" } }
    }
  };
}
function sanitizeIdentify(raw: JsonRecord): JsonRecord {
  const observations = Array.isArray(raw?.observations) ? raw.observations.slice(0, 30).map((item) => {
    const o = item as JsonRecord;
    const field = ALLOWED_FIELDS.includes(o?.field as typeof ALLOWED_FIELDS[number]) ? String(o.field) : "card_type";
    return { field, value: safeText(o?.value, 160), confidence: clamp01(o?.confidence), evidence: safeText(o?.evidence, 320) };
  }).filter((o) => o.value) : [];
  const list = (value: unknown, maxItems: number, maxLen: number) => (Array.isArray(value) ? value : []).slice(0, maxItems).map((x) => safeText(x, maxLen)).filter(Boolean);
  return {
    overall_confidence: clamp01(raw?.overall_confidence),
    visual_summary: safeText(raw?.visual_summary, 800),
    observations,
    candidate_identity_clues: list(raw?.candidate_identity_clues, 12, 240),
    ambiguities: list(raw?.ambiguities, 12, 240),
    recommended_checks: list(raw?.recommended_checks, 10, 240)
  };
}
function sanitizeCompare(raw: JsonRecord): JsonRecord {
  const list = (value: unknown, maxItems: number) => (Array.isArray(value) ? value : []).slice(0, maxItems).map((x) => safeText(x, 260)).filter(Boolean);
  return {
    decision: ["accept","reject","ambiguous"].includes(String(raw?.decision)) ? String(raw.decision) : "ambiguous",
    match_score: clamp01(raw?.match_score),
    summary: safeText(raw?.summary, 700),
    matching_evidence: list(raw?.matching_evidence, 12),
    differences: list(raw?.differences, 12),
    ambiguities: list(raw?.ambiguities, 10)
  };
}
function identifyPrompt(ocrText: unknown, knownFields: unknown): string {
  return `You are Cardfolio's conservative collectible-card visual identity analyst.
Inspect the actual card image pixels first. OCR and known fields are supplementary evidence only.
Do NOT price the card. Do NOT invent a checklist match, parallel, serial number, grade, autograph, relic, rookie status, or variation.
Look for visual-only evidence such as foil/refractor treatment, border/color parallel, image/photo variation, insert/subset branding, rookie marks, autograph or relic windows, serial stamps, grading slab/label, manufacturer marks, card number placement, language/edition and front/back design cues.
Return an observation only when there is visible evidence. Use confidence below 0.75 for uncertain or glare-sensitive calls.
When an exact variant cannot be distinguished from this photo, put that uncertainty in ambiguities and recommend the minimum extra photo/check needed.
OCR text:\n${safeText(ocrText, MAX_OCR_TEXT) || "(none)"}\nExisting extracted/user-known fields:\n${safeJson(knownFields)}`;
}
function comparePrompt(knownIdentity: unknown): string {
  return `You are Cardfolio's exact-comp visual auditor.
Image 1 is the user's reference card. Image 2 is a marketplace candidate.
Decide whether Image 2 is visually compatible with the SAME EXACT collectible-card state as Image 1.
Reject meaningful differences in set/product, card number, base vs parallel, foil/color treatment, image variation, insert/subset, autograph/relic, serial-number denominator, language/edition, or grading company/grade.
Do not accept merely because the same player/character appears.
If photos do not reveal enough to decide, return ambiguous rather than guessing.
Known reference identity (supplementary, not a substitute for the images):\n${safeJson(knownIdentity)}`;
}
async function callOpenAI(payload: JsonRecord): Promise<JsonRecord> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw Object.assign(new Error("NOT_CONFIGURED"), { code: "NOT_CONFIGURED" });
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000)
  });
  if (!r.ok) {
    let message = `OpenAI vision request failed (${r.status})`;
    try { const data = await r.json(); if (data?.error?.message) message = safeText(data.error.message, 300); } catch { /* noop */ }
    throw Object.assign(new Error(message), { code: "UPSTREAM", status: r.status });
  }
  return await r.json() as JsonRecord;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { error: "POST required" });

  let body: JsonRecord;
  try { body = await req.json() as JsonRecord; }
  catch { return json(req, 400, { error: "Valid JSON is required" }); }

  const mode = body?.mode === "compare" ? "compare" : "identify";
  const referenceImage = body?.imageDataUrl || body?.referenceImageDataUrl;
  if (!isImageDataUrl(referenceImage)) return json(req, 400, { error: "A compressed JPEG, PNG, or WebP card image is required" });

  const model = safeText(Deno.env.get("OPENAI_VISION_MODEL"), 80) || DEFAULT_MODEL;
  const fingerprint = await imageFingerprint(referenceImage);

  try {
    let payload: JsonRecord;
    if (mode === "compare") {
      const candidateImageUrl = safeText(body?.candidateImageUrl, 2000);
      let parsed: URL;
      try { parsed = new URL(candidateImageUrl); }
      catch { return json(req, 400, { error: "A public HTTPS candidate image URL is required" }); }
      if (parsed.protocol !== "https:") return json(req, 400, { error: "A public HTTPS candidate image URL is required" });

      payload = {
        model, store: false,
        input: [{ role: "user", content: [
          { type: "input_text", text: comparePrompt(body?.knownIdentity || {}) },
          { type: "input_image", image_url: referenceImage, detail: "high" },
          { type: "input_image", image_url: candidateImageUrl, detail: "high" }
        ]}],
        text: { format: { type: "json_schema", name: "card_comp_visual_review", strict: true, schema: compareSchema() } }
      };
    } else {
      payload = {
        model, store: false,
        input: [{ role: "user", content: [
          { type: "input_text", text: identifyPrompt(body?.ocrText || "", body?.knownFields || {}) },
          { type: "input_image", image_url: referenceImage, detail: "high" }
        ]}],
        text: { format: { type: "json_schema", name: "card_visual_analysis", strict: true, schema: identifySchema() } }
      };
    }

    const response = await callOpenAI(payload);
    const outputText = extractOutputText(response);
    if (!outputText) throw Object.assign(new Error("GPT card vision returned no structured result"), { code: "UPSTREAM" });
    let parsed: JsonRecord;
    try { parsed = JSON.parse(outputText) as JsonRecord; }
    catch { throw Object.assign(new Error("GPT card vision returned invalid structured data"), { code: "UPSTREAM" }); }

    if (mode === "compare") {
      return json(req, 200, { configured: true, mode, model, imageFingerprint: fingerprint, reviewedAt: new Date().toISOString(), review: sanitizeCompare(parsed) });
    }
    return json(req, 200, { configured: true, mode, model, imageFingerprint: fingerprint, analyzedAt: new Date().toISOString(), analysis: sanitizeIdentify(parsed) });
  } catch (err) {
    const e = err as Error & { code?: string; status?: number };
    if (e?.code === "NOT_CONFIGURED") return json(req, 503, { configured: false, error: "GPT card vision is not configured yet" });
    console.error("Cardfolio vision failed", { code: e?.code || "UNKNOWN", status: e?.status || null, message: safeText(e?.message, 300) });
    return json(req, 502, { configured: true, error: "GPT card vision could not analyze this image" });
  }
});
