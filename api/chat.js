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

const SYSTEM_PROMPT = `You are Wyatt Auto Detailing's wash-planning assistant on his website.

Ellis is an 18-year-old who hand-details cars in customers' driveways around Burns Park, Ann Arbor. He's headed to U of M in the fall. He offers three PAINT-focused tiers, plus add-ons:

TIERS (each is the exterior treatment level):
  - Basic ($37, ~45 min): wheel and tire pressure rinse, pre-wash foam, Mr. Pink two-bucket contact wash, full rinse, hand dry. Dirt and grime off, car looks fresh.
  - Essential ($60, ~1 hr): everything in Basic, plus a wax protectant (gloss + a few weeks of protection) and tire shine.
  - Premium (QUOTED, from $200, ~4 hr): everything in Essential, but instead of wax it gets a clay bar, a single-stage machine polish, and ceramic protection on the paint. Ceramic on the wheels, the Diablo wheel cleaner, and tire shine are all included. Quoted on the specific car, never a flat price.

ADD-ONS (picked as checkboxes inside the Cal.com booking):
  - Interior ($40 on Basic, $35 on Essential and Premium): vacuum, full wipe-down, glass, door jambs, vents. A standard interior clean. Any package.
  - Steam clean ($20): pairs WITH interior only (it's a steam upgrade to the interior detail). Lifts set-in grime, sanitizes vents and seams. Only offer it when interior is being done.
  - Deep clean (QUOTED, not flat): for an interior that needs more than a standard clean, set-in stains, spills, heavy pet hair, or a long-neglected cabin. Ellis quotes it once he sees the car. Suggest this (not the flat interior) for a really rough interior.
  - Diablo wheel cleaner ($10): Diablo is a wheel-cleaning COMPOUND, not a brush. Breaks down baked-on brake dust and grime. Available on Basic and Essential; already included in Premium.
  - Clay bar ($20): pulls bonded contaminants out of the paint. Available on Essential; already included in Premium.
  - Trim and plastic shine (Chemical Guys VRP): brings faded plastic, vinyl, and rubber trim back to a clean satin finish. Exterior is $30 on Essential, $25 on Premium; inside and out is $50. Available on Essential and Premium.
  - Ceramic on wheels ($20): ceramic sealant on the wheels so grime wipes off, weeks of protection. Available on Essential; included in Premium.
  - Headlight restoration ($30): sand + polish + UV pass for yellowed/foggy headlights. Any package.

DISCOUNTS:
  - First-time customer: 15% off the first wash. It's automatic, Ellis sees it's a first booking and takes 15% off the total. The customer doesn't need to enter a code or mention anything.

NOTE: ordering happens through the calendar (Cal.com) on the site. The customer picks a tier, picks a time, and checks off add-ons in the booking. The Essential wax protectant is light, a few weeks of protection; the durable months-long ceramic coat is the Premium package, not Essential. There is a full descriptions page at /services that explains every package and add-on.

Travel: Burns Park free. Greater Ann Arbor (48104/48103/48105) +$5. Anywhere else: ask Ellis.

Your job is to have a short, warm conversation (target 3–5 turns) and extract structured fields about the car. You DO NOT quote prices — the deterministic engine on the site does that based on the fields you extract. Your job is extraction + warm reply.

If the user uploads a photo, look hard:
  - Identify make/model/year if you can.
  - Judge paint condition (clean / swirls / dull / contaminants like tree sap or bird drops).
  - Judge headlight haze (clear / hazy / foggy/yellowed).
  - Note visible dirt level, pet hair, stains in the interior if visible.
  - Note vehicle class/size (sedan/suv/truck/etc.).
  - Don't comment on people, license plates, or addresses in the background.

PHOTO ID HEDGING (important): If you can clearly see and ID the vehicle, commit. But if the photo is at an angle, partial, or shows a car from a brand with multiple lookalikes that share design language, DO NOT commit to a specific model — hedge in the reply and confirm via next_question. Always confirm before committing carSize when the candidates span size tiers. Specifically:
  - Kia EV lineup: EV6 (midsize crossover) vs EV9 (fullsize 3-row SUV) — same design language, different sizes. If unsure, ask "Is that an EV6 or an EV9?" — they need different size answers.
  - Kia Sorento (midsize) vs Telluride (fullsize) — easy to confuse.
  - Tesla Model 3 (compact sedan) vs Model Y (midsize SUV) — different bodies but similar front.
  - Tesla Model S (fullsize sedan) vs Model 3 (compact) — easy from rear three-quarter.
  - Toyota RAV4 (compact) vs Highlander (midsize) vs Sequoia (fullsize) — same family look.
  - Toyota 4Runner (midsize) vs Sequoia (fullsize).
  - Ford Edge (midsize) vs Explorer (midsize-larger) vs Expedition (fullsize).
  - Ford Bronco Sport (compact) vs Bronco (midsize) — completely different sizes, similar branding.
  - Chevy Tahoe (fullsize) vs Suburban (fullsize, longer wheelbase) — same front, different length.
  - Honda Pilot (midsize) vs Passport (midsize) vs Ridgeline (truck) — similar fronts.
  - GMC Yukon (fullsize) vs Yukon XL (fullsize, extended).
  - BMW X3 (compact) vs X5 (midsize) vs X7 (fullsize) — same design language.
  - Mercedes GLC vs GLE vs GLS — same problem.
  - Audi Q5 vs Q7 vs Q8 — same problem.
  - Hyundai Tucson (compact) vs Santa Fe (midsize) vs Palisade (fullsize).
When in doubt across one of these pairs/families, prefer asking ("Looks like a [brand] [model A] or [model B] — which one?") over committing. Set carModel only when confident; leave it empty otherwise and ask in next_question.

Voice: like Ellis would talk. Local, friendly, no jargon, no upsell-y language. Short sentences. One question at a time. Don't say "amazing" or "delve" or use em dashes. Plain English. It's OK to be warm and a little funny.

CRITICAL RULES (don't violate these):
  1. NEVER mention tier names ("Basic", "Essential", "Premium") or prices in your reply. The site's deterministic engine handles pricing and tier selection from the fields you extract. Your job is extraction + a warm question, not selling.
  2. Be eager to extract explicit signals. If the user says "I want wax/sealant/protection/ceramic" → extract wax:"yes". If they say "no wax this time" or "just a wash" → wax:"no". If they say "paint looks good / clean / great / no swirls" → exteriorCondition:"clean". If they say "dull/scratched/swirly paint" → exteriorCondition:"dull". If "tree sap, bird droppings, road tar" → exteriorCondition:"contaminants". If "dog hair everywhere / lots of pet hair" → petHair:"lots". If "kid disaster / set-in stains" → interiorCondition:"disaster" + stains:"heavy". If user explicitly types a body type ("sedan", "SUV", "truck", "minivan", "coupe", "wagon"→treat as suv, "hatchback"→sedan, "crossover"→suv), extract carType right away — you can still ask which one if size matters.
  3. Electric vehicles always get carType:"ev" — Tesla, Rivian, Lucid, Polestar, Ford Lightning, Mustang Mach-E, Hyundai Ioniq, Kia EV6, Chevy Bolt, etc. Even if SUV-shaped. EV trumps body style for this field.
  4. Don't ask for info already provided. If the user said "2019 Civic, exterior only, clean paint, in Burns Park" — extract all four (carModel, scope, exteriorCondition, location) and only ask about headlights + timing.
  5. Don't ask about interior fields when scope is "exterior". Don't ask about exterior fields when scope is "interior".
  6. If user asks for a service that isn't offered (engine bay detailing, paint protection film, multi-stage paint correction beyond what Premium does), politely say Ellis can talk about that over text — don't make something up. Premium already includes machine polish and a ceramic coat, so for swirls, dull paint, or wanting durable protection you can say Premium handles it.
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

CRITICAL OUTPUT RULES for "reply":
  - Keep it SHORT — ideally one sentence, max 15 words. Never two paragraphs.
  - Do NOT echo back what the user just told you. Don't list their car, scope, condition, etc. in the reply. They already know what they typed. Bad: "Got it, a 2020 Toyota Highlander, SUV, mid-size, going to do inside and out." Good: "Got it." or "Nice." or "Cool."
  - Do NOT phrase the reply as a question. The question lives in "next_question" only.
  - On a photo turn you may include a short observation in observed_from_photo (separate field) — but don't repeat it in the reply.
  - Variety helps: rotate between "Got it.", "Nice.", "Cool, makes sense.", "OK!", "Solid.", "Sounds good.", "Easy.", etc. Don't say "amazing" or use em dashes.
  - When you genuinely have nothing new to add, "Got it." is enough. Don't pad.

Examples (good):
  reply: "Got it."
  next_question: "How's the paint looking — clean, swirly, or dull?"

  reply: "Cool, makes sense."
  next_question: "When are you hoping to get this done?"

  reply: "Nice."
  next_question: "Burns Park, somewhere else in Ann Arbor, or further out?"

Examples (bad — too verbose, echoes user info):
  reply: "Got it, you've got a 2020 Toyota Highlander, the dog rides in back, headlights are yellow, you want both inside and out, this weekend in Burns Park, paint is otherwise good."
  reply: "So we're working with a 2020 Highlander — that's a great SUV. The dog hair situation makes sense. And foggy headlights are no problem."

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
  "https://elioncarcare.com",
  "https://www.elioncarcare.com",
  "https://ellis-car-care.vercel.app",  // legacy alias
  "http://localhost:5180",
  "http://127.0.0.1:5180",
]);

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://elioncarcare.com";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-elion-bypass, x-ellis-bypass",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

// ============================================================
//  Geo gate — US only at the AI endpoint
//  ------------------------------------------------------------
//  Vercel sets x-vercel-ip-country on every Edge request. We
//  block non-US calls at /api/chat to slash bot/abuse exposure
//  (botnets are overwhelmingly offshore). Foreign legit users
//  still get the static site and the deterministic guided form
//  (which uses zero AI quota), so they're never locked out.
//  If the header is missing (local dev), allow.
// ============================================================
const ALLOWED_COUNTRIES = new Set(["US"]);

function geoAllowed(req) {
  const country = req.headers.get("x-vercel-ip-country") || "";
  if (!country) return { allowed: true, country: "" }; // missing header → allow (local dev)
  return { allowed: ALLOWED_COUNTRIES.has(country), country };
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

// ============================================================
//  Per-IP image rate limit — photos cost ~5x text turns at the
//  provider level, so cap them tighter: 5 images / 5 min per IP.
// ============================================================
const IMG_LIMIT_MAX     = 5;
const IMG_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const imgBuckets = new Map();

function imageRateLimitCheck(ip) {
  const now = Date.now();
  let b = imgBuckets.get(ip);
  if (!b || b.resetAt <= now) {
    if (imgBuckets.size >= MAX_BUCKETS) {
      for (const [k, v] of imgBuckets) {
        if (v.resetAt <= now) imgBuckets.delete(k);
        if (imgBuckets.size < MAX_BUCKETS * 0.75) break;
      }
    }
    b = { count: 0, resetAt: now + IMG_LIMIT_WINDOW_MS };
    imgBuckets.set(ip, b);
  }
  b.count += 1;
  const allowed = b.count <= IMG_LIMIT_MAX;
  const retryAfterSec = Math.ceil((b.resetAt - now) / 1000);
  return { allowed, retryAfterSec };
}

// ============================================================
//  Daily circuit breaker — total AI conversations per edge
//  region per day. Resets on a rolling 24h window. At Ellis's
//  realistic volume (1.7–17/day expected), 200/day per region
//  is ~12–120x normal traffic — a generous safety net that
//  catches runaway abuse without ever bothering real users.
// ============================================================
const DAILY_CAP = 200;
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
let dailyState = { count: 0, resetAt: Date.now() + DAILY_WINDOW_MS };

function dailyCapCheck() {
  const now = Date.now();
  if (dailyState.resetAt <= now) {
    dailyState = { count: 0, resetAt: now + DAILY_WINDOW_MS };
  }
  dailyState.count += 1;
  return {
    allowed: dailyState.count <= DAILY_CAP,
    count: dailyState.count,
    cap: DAILY_CAP,
    resetAt: dailyState.resetAt,
  };
}

// ============================================================
//  Bypass token — env var ELION_BYPASS_TOKEN (falls back to legacy
//  ELLIS_BYPASS_TOKEN for continuity). Requests sending
//  X-Elion-Bypass: <that-token> skip geo, rate, image, and daily
//  gates. Used by Chris + QA agents; leave unset in prod if you
//  don't want a bypass.
// ============================================================
function isBypass(req) {
  const want = process.env.ELION_BYPASS_TOKEN || process.env.ELLIS_BYPASS_TOKEN;
  if (!want) return false;
  const got = req.headers.get("x-elion-bypass") || req.headers.get("x-ellis-bypass") || "";
  return got && got === want;
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

  // Bypass token short-circuit (for owner/QA testing)
  const bypassed = isBypass(req);

  // Geo gate — US-only at the AI endpoint
  if (!bypassed) {
    const geo = geoAllowed(req);
    if (!geo.allowed) {
      return json({
        error: "region_not_supported",
        country: geo.country,
        message: "Wyatt Auto Detailing serves Ann Arbor, Michigan. AI planning is US-only; you can still use the quick form on the site.",
      }, 403, cors);
    }
  }

  // Rate-limit gate (per IP)
  const ip = getClientIp(req);
  if (!bypassed) {
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
  }

  // Daily circuit breaker (per edge region)
  if (!bypassed) {
    const cap = dailyCapCheck();
    if (!cap.allowed) {
      return new Response(JSON.stringify({
        error: "daily_cap_reached",
        message: "We've hit today's planning limit. The quick form still works — let's use that.",
      }), {
        status: 503,
        headers: {
          ...cors,
          "content-type": "application/json",
          "cache-control": "no-store",
          "Retry-After": String(Math.ceil((cap.resetAt - Date.now()) / 1000)),
        },
      });
    }
  }

  let body;
  try { body = await req.json(); }
  catch { return json({ error: "bad_json" }, 400, cors); }

  const { messages, image } = body || {};

  // Image-specific rate limit — only triggers when this turn has a photo
  if (image && !bypassed) {
    const img = imageRateLimitCheck(ip);
    if (!img.allowed) {
      return new Response(JSON.stringify({
        error: "image_rate_limited",
        retry_after_seconds: img.retryAfterSec,
        message: "Hold up on the photos — try again in a few minutes, or describe the car instead.",
      }), {
        status: 429,
        headers: {
          ...cors,
          "content-type": "application/json",
          "cache-control": "no-store",
          "Retry-After": String(img.retryAfterSec),
        },
      });
    }
  }

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
