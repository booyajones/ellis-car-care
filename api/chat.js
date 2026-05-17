/* ============================================================
   /api/chat — Vercel Edge Function (DUAL-PROVIDER)
   ------------------------------------------------------------
   Routes between Claude Haiku 4.5 (warmer voice, strong on
   conversational extraction) and Gemini 2.5 Flash (faster,
   cheaper, stronger at vehicle make/model ID from photos).

   Routing policy:
     - Photo present in this turn → primary: Gemini, fallback: Claude
     - Text-only turn             → primary: Claude, fallback: Gemini
     - Override via ?provider=claude or ?provider=gemini

   Failover triggers (try the fallback):
     - Upstream timeout (12s per provider)
     - HTTP 5xx from upstream
     - JSON parse failure on the response
     - Empty response

   The client never has to know which provider answered, but we
   include "provider" in the response payload for observability.
   ============================================================ */

export const config = { runtime: "edge" };

const CLAUDE_MODEL = "claude-haiku-4-5";
const GEMINI_MODEL = "gemini-2.5-flash";
const CLAUDE_URL  = "https://api.anthropic.com/v1/messages";
const GEMINI_URL  = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const UPSTREAM_TIMEOUT_MS = 12_000;

const SYSTEM_PROMPT = `You are Ellis Car Care's wash-planning assistant on his static website.

Ellis is an 18-year-old who hand-details cars in customers' driveways around Burns Park, Ann Arbor. He's headed to U of M in the fall. He offers three packages:
  - Quick Shine ($40, ~45 min): exterior hand wash + dry + tires + jambs.
  - Driveway Detail ($90, ~2 hrs): everything in Quick Shine + interior vacuum, wipe-down, glass, vents.
  - Full Reset ($200, ~4 hrs): everything in Driveway Detail + iron decon + clay bar + wax/sealant + headlight restoration + leather/fabric + plastic trim.

Travel: Burns Park free. Greater Ann Arbor (48104/48103/48105) +$5. Anywhere else: ask Ellis.

Your job is to have a short, warm conversation (target 3–5 turns) and extract structured fields about the car. You DO NOT quote prices — the deterministic engine on the site does that based on the fields you extract. Your job is extraction + warm reply.

If the user uploads a photo, look hard:
  - Identify make/model/year if you can.
  - Judge paint condition (clean / swirls / dull / contaminants like tree sap or bird drops).
  - Judge headlight haze (clear / hazy / foggy/yellowed).
  - Note visible dirt level, pet hair, stains in the interior if visible.
  - Note vehicle class/size (sedan/suv/truck/etc.).
  - Don't comment on people, license plates, or addresses in the background.

Voice: like Ellis would talk. Local, friendly, no jargon, no upsell-y language. Short sentences. One question at a time. Don't say "amazing" or "delve" or use em dashes. Plain English. It's OK to be warm and a little funny.

CRITICAL RULES (don't violate these):
  1. NEVER mention package names ("Quick Shine", "Driveway Detail", "Full Reset") or prices in your reply. The site's deterministic engine handles pricing and package selection from the fields you extract. Your job is extraction + a warm question, not selling.
  2. Be eager to extract explicit signals. If the user says "I want wax/sealant/protection/ceramic" → extract wax:"yes". If they say "no wax this time" or "just a wash" → wax:"no". If they say "paint looks good / clean / great / no swirls" → exteriorCondition:"clean". If they say "dull/scratched/swirly paint" → exteriorCondition:"dull". If "tree sap, bird droppings, road tar" → exteriorCondition:"contaminants". If "dog hair everywhere / lots of pet hair" → petHair:"lots". If "kid disaster / set-in stains" → interiorCondition:"disaster" + stains:"heavy". If user explicitly types a body type ("sedan", "SUV", "truck", "minivan", "coupe", "wagon"→treat as suv, "hatchback"→sedan, "crossover"→suv), extract carType right away — you can still ask which one if size matters.
  3. Electric vehicles always get carType:"ev" — Tesla, Rivian, Lucid, Polestar, Ford Lightning, Mustang Mach-E, Hyundai Ioniq, Kia EV6, Chevy Bolt, etc. Even if SUV-shaped. EV trumps body style for this field.
  4. Don't ask for info already provided. If the user said "2019 Civic, exterior only, clean paint, in Burns Park" — extract all four (carModel, scope, exteriorCondition, location) and only ask about headlights + timing.
  5. Don't ask about interior fields when scope is "exterior". Don't ask about exterior fields when scope is "interior".
  6. If user asks for a service that isn't offered (engine bay detailing, ceramic coating, paint correction beyond polish, machine compound), politely say Ellis can talk about that over text — don't make something up. For paint correction specifically, you can mention "Ellis quotes paint restoration by photo over text" (this matches the actual add-on on the site).
  7. When a specific make/model is named with no ambiguity, infer carType and carSize using your automotive knowledge — don't re-ask. Examples:
       Civic, Corolla, Mazda3, Mini, Golf, Tesla Model 3 → carType:"sedan"/"ev", carSize:"compact"
       Camry, Accord, Tesla Model Y, Maxima → carType:"sedan"/"ev", carSize:"midsize"
       Charger, S-Class, 7-Series, Maybach → carType:"sedan", carSize:"fullsize"
       CR-V, RAV4, Forester, Outback → carType:"suv", carSize:"compact"
       Pilot, Highlander, Explorer, Telluride, Atlas → carType:"suv", carSize:"midsize"
       Tahoe, Suburban, Expedition, Yukon, Sequoia, Navigator, Escalade → carType:"suv", carSize:"fullsize"
       Tacoma, Ranger, Colorado, Frontier → carType:"truck", carSize:"compact"
       F-150, Silverado 1500, RAM 1500, Tundra → carType:"truck", carSize:"midsize"
       F-250+, Silverado 2500+, RAM 2500+, HD trucks → carType:"truck", carSize:"fullsize"
       M3 (G80, 2021+), C-class, 3-Series, A4 → carType:"sedan", carSize:"midsize"
       M4, Corvette, Mustang, Challenger, Supra, GR86 → carType:"coupe", carSize:"midsize"
       Sienna, Odyssey, Pacifica, Carnival → carType:"minivan", carSize:"fullsize"
     If a model could go either way (e.g. Mustang Mach-E is EV + SUV), prefer the more specific category (EV wins, per rule 3).

CRITICAL OUTPUT RULE: The "reply" is an acknowledgement + brief observation only (1–2 short sentences). The "next_question" is the only place the question lives. Do NOT phrase the reply as a question or include the next question text in the reply — that creates duplicated questions on screen. Good: reply="Nice, got it." next_question="What's the year and model?". Bad: reply="Got it — what's the year and model?" next_question="What's the year and model?".

You must return ONE JSON object per turn — no markdown, no preamble. Exactly this shape:

{
  "reply": "1–2 short acknowledgement sentences to the user. Not a question.",
  "extracted": { ...only fields you learned or confirmed this turn... },
  "observed_from_photo": "if a photo was attached: one short line on what you saw, omitted if none",
  "next_question": "the single next question, omitted when ready_to_recommend is true",
  "quick_replies": ["2 to 5 short tap labels", "..."],
  "ready_to_recommend": false
}

The "extracted" object must only use these keys and EXACT values:
  carType:           "sedan" | "suv" | "truck" | "minivan" | "coupe" | "ev" | "other"
  carModel:          free text (year/make/model)
  carSize:           "compact" | "midsize" | "fullsize"
  scope:             "exterior" | "interior" | "both"
  interiorCondition: "clean" | "normal" | "rough" | "disaster"
  petHair:           "none" | "some" | "lots"
  stains:            "none" | "light" | "heavy"
  seats:             "cloth" | "leather" | "mix" | "unknown"
  exteriorCondition: "clean" | "swirls" | "dull" | "contaminants"
  wax:               "yes" | "no"
  headlights:        "clear" | "hazy" | "foggy" | "unknown"
  timing:            "thisweek" | "weekend" | "nextweek" | "flexible"
  location:          "burns" | "annarbor" | "nearby"
  notes:             free text

When to set ready_to_recommend = true:
  - At minimum you have: scope, and one condition signal in that scope.
  - For exterior in scope: ideally exteriorCondition + headlights.
  - For interior in scope: ideally interiorCondition + petHair.
  - You always need: location and timing (ask if missing).
  - Aim for 3–5 turns total. Don't drag it out.

If something is unclear or the user is vague, ASK — don't invent. Never hallucinate add-ons or services that aren't in the package descriptions above.

Quick reply guidance:
  - Provide tap-friendly button labels when there's a clear set of choices.
  - Return empty array when free-form input fits better (e.g. car make/model, free-text notes).
  - Labels stay under ~28 characters each.

Output JSON ONLY. No backticks, no commentary.`;

const ALLOWED_ORIGINS = new Set([
  "https://ellis-car-care.vercel.app",
  "http://localhost:5180",
  "http://127.0.0.1:5180",
]);

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://ellis-car-care.vercel.app";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

// ============================================================
//  Per-IP rate limit — in-memory token bucket
//  ------------------------------------------------------------
//  Edge functions reuse module-scope state across invocations
//  on the same instance. Different regions = different buckets,
//  which is fine: most attackers hit from one location.
//  Limit: 20 requests / 5 min per IP. A real user uses 3–8 turns
//  to plan a wash, so this is generous for humans and tight on
//  abuse. Returns HTTP 429 with Retry-After when exceeded.
// ============================================================
const RATE_LIMIT_MAX     = 20;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const ipBuckets = new Map(); // ip -> { count, resetAt }
const MAX_BUCKETS = 5000;    // simple bounded cache to prevent memory growth

function getClientIp(req) {
  const xff = req.headers.get("x-forwarded-for") || "";
  const first = xff.split(",")[0].trim();
  if (first) return first;
  return req.headers.get("x-real-ip") || "unknown";
}

function rateLimitCheck(ip) {
  const now = Date.now();
  let b = ipBuckets.get(ip);
  if (!b || b.resetAt <= now) {
    // GC stale entries to keep the Map bounded
    if (ipBuckets.size >= MAX_BUCKETS) {
      for (const [k, v] of ipBuckets) {
        if (v.resetAt <= now) ipBuckets.delete(k);
        if (ipBuckets.size < MAX_BUCKETS * 0.75) break;
      }
    }
    b = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    ipBuckets.set(ip, b);
  }
  b.count += 1;
  const allowed = b.count <= RATE_LIMIT_MAX;
  const retryAfterSec = Math.ceil((b.resetAt - now) / 1000);
  return { allowed, count: b.count, limit: RATE_LIMIT_MAX, retryAfterSec };
}

export default async function handler(req) {
  const origin = req.headers.get("origin") || "";
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, cors);
  }

  // Rate-limit gate (per IP)
  const ip = getClientIp(req);
  const rl = rateLimitCheck(ip);
  if (!rl.allowed) {
    return new Response(JSON.stringify({
      error: "rate_limited",
      limit: rl.limit,
      retry_after_seconds: rl.retryAfterSec,
    }), {
      status: 429,
      headers: {
        ...cors,
        "content-type": "application/json",
        "cache-control": "no-store",
        "Retry-After": String(rl.retryAfterSec),
        "X-RateLimit-Limit": String(rl.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + rl.retryAfterSec),
      },
    });
  }

  let body;
  try { body = await req.json(); }
  catch { return json({ error: "bad_json" }, 400, cors); }

  const { messages, image } = body || {};

  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 24) {
    return json({ error: "invalid_messages" }, 400, cors);
  }

  if (image) {
    if (typeof image.data !== "string" || image.data.length > 1_600_000) {
      return json({ error: "image_too_large" }, 413, cors);
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(image.mediaType)) {
      return json({ error: "unsupported_image_type" }, 400, cors);
    }
  }

  // Normalize messages: enforce role + string content, drop anything weird.
  let cleaned;
  try {
    cleaned = messages.map((m) => {
      if (!m || (m.role !== "user" && m.role !== "assistant")) throw new Error("bad role");
      const text = typeof m.content === "string" ? m.content.slice(0, 4000) : "";
      return { role: m.role, content: text };
    }).filter(m => m.content.length > 0 || m.role === "user");
  } catch (e) {
    return json({ error: "invalid_message_shape" }, 400, cors);
  }

  if (cleaned.length === 0) {
    return json({ error: "empty_messages" }, 400, cors);
  }

  // Routing: photo → Gemini first; text-only → Claude first.
  // Optional override via ?provider= query param.
  const url = new URL(req.url);
  const override = url.searchParams.get("provider"); // "claude" | "gemini" | null

  let primary, fallback;
  if (override === "claude") { primary = "claude"; fallback = "gemini"; }
  else if (override === "gemini") { primary = "gemini"; fallback = "claude"; }
  else if (image) { primary = "gemini"; fallback = "claude"; }
  else { primary = "claude"; fallback = "gemini"; }

  // Try primary, then fallback. Capture errors for diagnostics.
  const attempts = [];
  for (const provider of [primary, fallback]) {
    const t0 = Date.now();
    try {
      const result = await callProvider(provider, cleaned, image);
      const dur = Date.now() - t0;
      const out = sanitizeOutput(result);
      out.provider = provider;
      out.latencyMs = dur;
      out.attempts = attempts.concat([{ provider, ok: true, ms: dur }]);
      return json(out, 200, cors);
    } catch (e) {
      const dur = Date.now() - t0;
      attempts.push({ provider, ok: false, ms: dur, err: String(e && e.message || e).slice(0, 200) });
      // Continue to fallback unless it's a hard input error
      if (e.code === "BAD_INPUT") {
        return json({ error: "bad_input", detail: String(e.message || e) }, 400, cors);
      }
    }
  }

  return json({ error: "all_providers_failed", attempts }, 502, cors);
}

// ============================================================
//  Provider dispatch
// ============================================================
async function callProvider(provider, cleaned, image) {
  if (provider === "claude") {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("missing_anthropic_key");
    return await callClaude(cleaned, image);
  }
  if (provider === "gemini") {
    if (!process.env.GOOGLE_API_KEY) throw new Error("missing_google_key");
    return await callGemini(cleaned, image);
  }
  throw new Error("unknown_provider");
}

// ============================================================
//  Claude Haiku 4.5
// ============================================================
async function callClaude(cleaned, image) {
  const apiMessages = cleaned.slice(0, -1).map(m => ({ role: m.role, content: m.content }));
  const last = cleaned[cleaned.length - 1];

  let lastContent;
  if (image && last.role === "user") {
    lastContent = [
      { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
      { type: "text", text: last.content || "Here's a photo of my car." },
    ];
  } else {
    lastContent = last.content;
  }
  apiMessages.push({ role: "user", content: lastContent });
  // JSON prefill
  apiMessages.push({ role: "assistant", content: "{" });

  const body = {
    model: CLAUDE_MODEL,
    max_tokens: 700,
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }
    ],
    messages: apiMessages,
  };

  const data = await postWithTimeout(CLAUDE_URL, {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = data?.content?.[0]?.text ?? "";
  const parsed = parseJsonLoose("{" + raw);
  if (!parsed) throw new Error("claude_parse_error");
  return { ...parsed, _usage: data?.usage };
}

// ============================================================
//  Gemini 2.5 Flash
// ============================================================
async function callGemini(cleaned, image) {
  // Map our conversation to Gemini's contents format.
  // Last user message gets the image attached.
  const contents = cleaned.map((m, i) => {
    const role = m.role === "assistant" ? "model" : "user";
    const isLastUser = i === cleaned.length - 1 && m.role === "user";
    const parts = [];
    if (isLastUser && image) {
      parts.push({ inlineData: { mimeType: image.mediaType, data: image.data } });
    }
    parts.push({ text: m.content || (isLastUser && image ? "Here's a photo of my car." : "") });
    return { role, parts };
  });

  const body = {
    contents,
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 800,
      temperature: 0.6,
    },
  };

  const url = `${GEMINI_URL(GEMINI_MODEL)}?key=${encodeURIComponent(process.env.GOOGLE_API_KEY)}`;
  const data = await postWithTimeout(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  // Gemini returns: { candidates: [ { content: { parts: [{ text: "..." }] } } ], usageMetadata: {...} }
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const parsed = parseJsonLoose(raw);
  if (!parsed) throw new Error("gemini_parse_error");
  return { ...parsed, _usage: data?.usageMetadata };
}

// ============================================================
//  Shared helpers
// ============================================================
async function postWithTimeout(url, init) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let resp;
  try {
    resp = await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    clearTimeout(t);
    throw new Error("upstream_timeout:" + (e && e.message || e));
  }
  clearTimeout(t);

  if (!resp.ok) {
    let detail;
    try { detail = await resp.text(); } catch { detail = ""; }
    const err = new Error(`http_${resp.status}:${detail.slice(0, 200)}`);
    err.upstreamStatus = resp.status;
    throw err;
  }
  try {
    return await resp.json();
  } catch (e) {
    throw new Error("response_not_json");
  }
}

function parseJsonLoose(raw) {
  if (!raw || typeof raw !== "string") return null;
  try { return JSON.parse(raw); } catch {}
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch {}
  }
  return null;
}

function sanitizeOutput(parsed) {
  return {
    reply: String(parsed.reply || "").slice(0, 1200),
    extracted: sanitizeExtracted(parsed.extracted),
    next_question: parsed.next_question ? String(parsed.next_question).slice(0, 240) : "",
    quick_replies: Array.isArray(parsed.quick_replies)
      ? parsed.quick_replies.slice(0, 6).map(s => String(s).slice(0, 60))
      : [],
    ready_to_recommend: !!parsed.ready_to_recommend,
    observed_from_photo: parsed.observed_from_photo
      ? String(parsed.observed_from_photo).slice(0, 280)
      : "",
    usage: {
      input_tokens: parsed._usage?.input_tokens ?? parsed._usage?.promptTokenCount ?? null,
      output_tokens: parsed._usage?.output_tokens ?? parsed._usage?.candidatesTokenCount ?? null,
      cache_read_input_tokens: parsed._usage?.cache_read_input_tokens ?? null,
      cache_creation_input_tokens: parsed._usage?.cache_creation_input_tokens ?? null,
    },
  };
}

// Strict whitelist of fields and their allowed values
const ALLOWED = {
  carType: ["sedan","suv","truck","minivan","coupe","ev","other"],
  carSize: ["compact","midsize","fullsize"],
  scope: ["exterior","interior","both"],
  interiorCondition: ["clean","normal","rough","disaster"],
  petHair: ["none","some","lots"],
  stains: ["none","light","heavy"],
  seats: ["cloth","leather","mix","unknown"],
  exteriorCondition: ["clean","swirls","dull","contaminants"],
  wax: ["yes","no"],
  headlights: ["clear","hazy","foggy","unknown"],
  timing: ["thisweek","weekend","nextweek","flexible"],
  location: ["burns","annarbor","nearby"],
};
const FREE_TEXT = new Set(["carModel","notes"]);

function sanitizeExtracted(obj) {
  if (!obj || typeof obj !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (ALLOWED[k]) {
      if (typeof v === "string" && ALLOWED[k].includes(v)) out[k] = v;
    } else if (FREE_TEXT.has(k)) {
      if (typeof v === "string") out[k] = v.slice(0, 240);
    }
  }
  return out;
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}
