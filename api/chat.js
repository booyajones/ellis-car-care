/* ============================================================
   /api/chat — Vercel Edge Function
   ------------------------------------------------------------
   Proxies the Wash Planner chatbot to Claude Haiku 4.5 (vision).
   Keeps the API key server-side. Returns a structured JSON
   payload the client merges into its deterministic state.
   ============================================================ */

export const config = { runtime: "edge" };

const MODEL = "claude-haiku-4-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

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
  2. Be eager to extract explicit signals. If the user says "I want wax/sealant/protection/ceramic" → extract wax:"yes". If they say "no wax this time" or "just a wash" → wax:"no". If they say "dull/scratched/swirly paint" → exteriorCondition:"dull". If "tree sap, bird droppings, road tar" → exteriorCondition:"contaminants". If "dog hair everywhere / lots of pet hair" → petHair:"lots". If "kid disaster / set-in stains" → interiorCondition:"disaster" + stains:"heavy".
  3. Electric vehicles always get carType:"ev" — Tesla, Rivian, Lucid, Polestar, Ford Lightning, Mustang Mach-E, Hyundai Ioniq, Kia EV6, Chevy Bolt, etc. Even if SUV-shaped. EV trumps body style for this field.
  4. Don't ask for info already provided. If the user said "2019 Civic, exterior only, clean paint, in Burns Park" — extract all four (carModel, scope, exteriorCondition, location) and only ask about headlights + timing.
  5. Don't ask about interior fields when scope is "exterior". Don't ask about exterior fields when scope is "interior".
  6. If user asks for a service that isn't offered (engine bay detailing, ceramic coating, paint correction beyond polish, machine compound), politely say Ellis can talk about that over text — don't make something up. For paint correction specifically, you can mention "Ellis quotes paint restoration by photo over text" (this matches the actual add-on on the site).

You must return ONE JSON object per turn — no markdown, no preamble. Exactly this shape:

{
  "reply": "1–3 short sentences to the user. No markdown.",
  "extracted": { ...only fields you learned or confirmed this turn... },
  "observed_from_photo": "if a photo was attached: one short line on what you saw, omitted if none",
  "next_question": "the next single question, omitted when ready_to_recommend is true",
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
  - Skip quick_replies (return empty array) when free-form input fits better (e.g. car make/model, free-text notes).
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

export default async function handler(req) {
  const origin = req.headers.get("origin") || "";
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, cors);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ error: "missing_api_key" }, 500, cors);
  }

  let body;
  try { body = await req.json(); }
  catch { return json({ error: "bad_json" }, 400, cors); }

  const { messages, image } = body || {};

  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 24) {
    return json({ error: "invalid_messages" }, 400, cors);
  }

  // Image size guard: payload roughly limited via Vercel default; do a sanity check.
  if (image) {
    if (typeof image.data !== "string" || image.data.length > 1_600_000) {
      return json({ error: "image_too_large" }, 413, cors);
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(image.mediaType)) {
      return json({ error: "unsupported_image_type" }, 400, cors);
    }
  }

  // Normalize messages: enforce role + string content, drop anything weird.
  const cleaned = messages.map((m, i) => {
    if (!m || (m.role !== "user" && m.role !== "assistant")) throw new Error("bad role");
    const text = typeof m.content === "string" ? m.content.slice(0, 4000) : "";
    return { role: m.role, content: text };
  }).filter(m => m.content.length > 0 || m.role === "user");

  if (cleaned.length === 0) {
    return json({ error: "empty_messages" }, 400, cors);
  }

  // Attach the image (if any) to the LAST user message only.
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

  // Prefill the assistant turn with "{" to lock JSON output.
  apiMessages.push({ role: "assistant", content: "{" });

  const anthropicBody = {
    model: MODEL,
    max_tokens: 700,
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }
    ],
    messages: apiMessages,
  };

  // 12-second upstream timeout
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 12_000);

  let upstream;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(anthropicBody),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(t);
    return json({ error: "upstream_timeout", detail: String(e && e.message || e) }, 504, cors);
  }
  clearTimeout(t);

  if (!upstream.ok) {
    let detail;
    try { detail = await upstream.text(); } catch { detail = ""; }
    return json({ error: "upstream_error", status: upstream.status, detail: detail.slice(0, 400) }, 502, cors);
  }

  const data = await upstream.json();
  const raw = data?.content?.[0]?.text ?? "";
  // Prefilled "{" was stripped from response — rebuild it.
  const reconstructed = "{" + raw;

  let parsed;
  try {
    parsed = JSON.parse(reconstructed);
  } catch (e) {
    // Best effort: try to find first {...} block
    const m = reconstructed.match(/\{[\s\S]*\}/);
    if (m) {
      try { parsed = JSON.parse(m[0]); } catch { /* still bad */ }
    }
    if (!parsed) {
      return json({ error: "parse_error", raw: reconstructed.slice(0, 500) }, 502, cors);
    }
  }

  // Validate / sanitize
  const out = {
    reply: String(parsed.reply || "").slice(0, 1200),
    extracted: sanitizeExtracted(parsed.extracted),
    next_question: parsed.next_question ? String(parsed.next_question).slice(0, 240) : "",
    quick_replies: Array.isArray(parsed.quick_replies) ? parsed.quick_replies.slice(0, 6).map(s => String(s).slice(0, 60)) : [],
    ready_to_recommend: !!parsed.ready_to_recommend,
    observed_from_photo: parsed.observed_from_photo ? String(parsed.observed_from_photo).slice(0, 280) : "",
    usage: {
      input_tokens: data.usage?.input_tokens ?? null,
      output_tokens: data.usage?.output_tokens ?? null,
      cache_read_input_tokens: data.usage?.cache_read_input_tokens ?? null,
      cache_creation_input_tokens: data.usage?.cache_creation_input_tokens ?? null,
    },
  };

  return json(out, 200, cors);
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
