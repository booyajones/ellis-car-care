/* ============================================================
   /api/orders — Elion Car Care booking API
   ------------------------------------------------------------
   POST  /api/orders         create an order, returns { id, ... }
   GET   /api/orders         list orders (admin only — needs auth)
   PATCH /api/orders?id=...  update status (admin only — needs auth)

   Storage: Vercel Blob (private). Each order is one JSON blob at
   path orders/<iso-date>__<id>.json. List + sort by date in dashboard.

   Auth (admin only): X-Elion-Admin: <ELION_ADMIN_PASSWORD env value>.
   The customer-facing POST is open (geo-gated + rate-limited).
   ============================================================ */

import { put, list, get, del } from "@vercel/blob";
import { sendEmail, customerConfirmationEmail, elionNotificationEmail } from "./_email.js";

// Node runtime (not Edge): @vercel/blob 2.x pulls in undici which uses
// node:stream / node:net / etc. that aren't available on Edge. Booking
// latency isn't critical (a form submit), so Node runtime is fine.
export const config = { runtime: "nodejs" };

const ALLOWED_ORIGINS = new Set([
  "https://elioncarcare.com",
  "https://www.elioncarcare.com",
  "https://ellis-car-care.vercel.app",  // legacy alias, redirects to apex eventually
  "http://localhost:5180",
  "http://127.0.0.1:5180",
]);

const ALLOWED_COUNTRIES = new Set(["US"]);

// --- Rate limit (per IP) ---
const RATE_LIMIT_MAX     = 6;   // a real customer needs 1, maybe 2 with a typo retry
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const ipBuckets = new Map();
const MAX_BUCKETS = 5000;

// --- Daily cap (per edge region) ---
const DAILY_CAP = 200;
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
let dailyState = { count: 0, resetAt: Date.now() + DAILY_WINDOW_MS };

// --- Tier + add-on prices (kept in sync with config.js + chatbot.js) ---
// NOTE: this endpoint is dormant — ordering runs through Cal.com now — but
// kept self-consistent with the live menu so nothing here contradicts it.
const PRICES = { basic: 40, essential: 60, premium: 200 };
const ADDON_PRICES = {
  interior: 40,
  steam: 20,      // pairs with interior
  diablo: 10,
  claybar: 20,
  headlight: 30,
};
const TIERS = new Set(["basic", "essential", "premium"]);
const ADDON_IDS = new Set(Object.keys(ADDON_PRICES));

// =========================================================
//  Handler — Node runtime (req: IncomingMessage, res: ServerResponse).
//  We adapt to a Web-Standards-like shape so the inner functions
//  can use req.headers.get(...) and return Response-shaped objects.
// =========================================================
export default async function handler(nodeReq, nodeRes) {
  // Build a thin Web-like req shim
  const headers = nodeReq.headers || {};
  const req = {
    method: nodeReq.method,
    url: nodeReq.url,
    headers: {
      get: (k) => headers[String(k).toLowerCase()] || "",
    },
    json: async () => {
      // Vercel Node runtime auto-parses JSON; nodeReq.body is the object
      if (nodeReq.body && typeof nodeReq.body === "object") return nodeReq.body;
      // Fallback: parse manually
      const chunks = [];
      for await (const chunk of nodeReq) chunks.push(chunk);
      const text = Buffer.concat(chunks).toString("utf8");
      return text ? JSON.parse(text) : {};
    },
  };

  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  // Helper to ship a Web-shaped Response back through nodeRes
  const ship = async (response) => {
    if (response && typeof response.text === "function") {
      // Real Response object (e.g. for 429 we return one)
      nodeRes.statusCode = response.status;
      response.headers.forEach((v, k) => nodeRes.setHeader(k, v));
      const text = await response.text();
      nodeRes.end(text);
      return;
    }
    // Already-shipped via our helper, do nothing
  };

  try {
    let response;
    if (req.method === "OPTIONS") {
      response = new Response(null, { status: 204, headers: cors });
    } else if (req.method === "POST")  response = await handleCreate(req, cors);
    else if (req.method === "GET")     response = await handleList(req, cors);
    else if (req.method === "PATCH") {
      const url = new URL(req.url, "http://localhost");
      response = await handleUpdateStatus(req, url, cors);
    }
    else if (req.method === "DELETE") {
      const url = new URL(req.url, "http://localhost");
      response = await handleDelete(req, url, cors);
    }
    else response = json({ error: "method_not_allowed" }, 405, cors);

    await ship(response);
  } catch (e) {
    nodeRes.statusCode = 500;
    Object.entries(cors).forEach(([k, v]) => nodeRes.setHeader(k, v));
    nodeRes.setHeader("content-type", "application/json");
    nodeRes.end(JSON.stringify({ error: "handler_exception", detail: String(e && e.message || e).slice(0, 300) }));
  }
}

// ---------------------------------------------------------
//  POST /api/orders  — customer creates order
// ---------------------------------------------------------
async function handleCreate(req, cors) {
  const bypass = isBypass(req);

  // Geo gate (skipped on bypass)
  if (!bypass) {
    const country = req.headers.get("x-vercel-ip-country") || "";
    if (country && !ALLOWED_COUNTRIES.has(country)) {
      return json({ error: "region_not_supported" }, 403, cors);
    }
  }
  // Rate limit (skipped on bypass)
  const ip = getClientIp(req);
  if (!bypass) {
    const rl = rateLimitCheck(ip);
    if (!rl.allowed) {
      return json({ error: "rate_limited", retry_after_seconds: rl.retryAfterSec }, 429, cors);
    }
  }
  // Daily cap (skipped on bypass)
  if (!bypass) {
    const cap = dailyCapCheck();
    if (!cap.allowed) {
      return json({ error: "daily_cap_reached", message: "We've hit today's booking limit. Text Ellis at (628) 252-0740." }, 503, cors);
    }
  }

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400, cors); }

  // Validate input
  const v = validateOrder(body);
  if (v.error) return json({ error: "invalid_order", detail: v.error }, 400, cors);
  const order = v.order;

  // Server-side pricing (NEVER trust client totals)
  const priced = computePricing(order);
  Object.assign(order, priced);

  // Add server fields
  order.id = generateId();
  order.created_at = new Date().toISOString();
  order.status = "new";

  // Write to Blob
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) return json({ error: "storage_not_configured" }, 500, cors);

  const path = `orders/${order.created_at.replace(/[:.]/g, "-")}__${order.id}.json`;
  try {
    await blobPut(path, JSON.stringify(order, null, 2), blobToken);
  } catch (e) {
    return json({ error: "storage_write_failed", detail: String(e && e.message || e).slice(0, 200) }, 502, cors);
  }

  // Fire-and-forget emails — order success NEVER depends on email delivery.
  // If RESEND_API_KEY isn't set, sendEmail() returns { skipped: true } and we move on.
  try {
    const elionAddr = process.env.ELION_NOTIFY_EMAIL;

    // Customer confirmation (only if they provided a real-looking email — orders POST doesn't
    // currently require email; we'll add it gracefully if the client started sending one)
    if (order.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email)) {
      const cust = customerConfirmationEmail(order);
      sendEmail({
        to: order.email,
        subject: cust.subject,
        html: cust.html,
        text: cust.text,
        replyTo: elionAddr || undefined,
        tags: [{ name: "type", value: "customer_confirmation" }, { name: "order", value: order.id }],
      }).catch(() => {}); // swallow — already logged in module
    }

    // Elion notification (only if address is configured)
    if (elionAddr) {
      const note = elionNotificationEmail(order);
      sendEmail({
        to: elionAddr,
        subject: note.subject,
        html: note.html,
        text: note.text,
        replyTo: order.email || undefined,
        tags: [{ name: "type", value: "elion_notification" }, { name: "order", value: order.id }],
      }).catch(() => {});
    }
  } catch (_) {
    // Email failure must not break order creation
  }

  return json({ ok: true, order }, 200, cors);
}

// ---------------------------------------------------------
//  GET /api/orders  — admin list
// ---------------------------------------------------------
async function handleList(req, cors) {
  if (!isAdmin(req)) return json({ error: "unauthorized" }, 401, cors);

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) return json({ error: "storage_not_configured" }, 500, cors);

  try {
    const blobs = await blobList("orders/", blobToken);
    // Fetch and parse each. Sort newest first.
    const orders = await Promise.all(
      blobs.map(async (b) => {
        try {
          const text = await blobGetTextByPath(b.pathname, blobToken);
          return JSON.parse(text);
        } catch (e) {
          console.error("order read failed:", b.pathname, String(e && e.message || e));
          return null;
        }
      })
    );
    const valid = orders.filter(Boolean);
    valid.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    return json({ ok: true, count: valid.length, orders: valid, listed: blobs.length }, 200, cors);
  } catch (e) {
    return json({ error: "storage_read_failed", detail: String(e && e.message || e).slice(0, 200) }, 502, cors);
  }
}

// ---------------------------------------------------------
//  PATCH /api/orders?id=ord_xxxx — admin updates status
// ---------------------------------------------------------
async function handleUpdateStatus(req, url, cors) {
  if (!isAdmin(req)) return json({ error: "unauthorized" }, 401, cors);

  const id = url.searchParams.get("id");
  if (!id || !/^ord_[A-Za-z0-9]+$/.test(id)) return json({ error: "invalid_id" }, 400, cors);

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400, cors); }
  const allowedStatuses = ["new", "scheduled", "in_progress", "done", "cancelled"];
  if (!allowedStatuses.includes(body.status)) return json({ error: "invalid_status" }, 400, cors);

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) return json({ error: "storage_not_configured" }, 500, cors);

  // Find the blob for this order
  try {
    const list = await blobList("orders/", blobToken);
    const target = list.find(b => b.pathname.endsWith(`__${id}.json`));
    if (!target) return json({ error: "not_found" }, 404, cors);
    const text = await blobGetTextByPath(target.pathname, blobToken);
    const order = JSON.parse(text);
    order.status = body.status;
    if (body.scheduled_for) order.scheduled_for = String(body.scheduled_for).slice(0, 100);
    if (body.notes_admin)   order.notes_admin = String(body.notes_admin).slice(0, 1000);
    order.updated_at = new Date().toISOString();
    await blobPut(target.pathname, JSON.stringify(order, null, 2), blobToken);
    return json({ ok: true, order }, 200, cors);
  } catch (e) {
    return json({ error: "update_failed", detail: String(e && e.message || e).slice(0, 200) }, 502, cors);
  }
}

// ---------------------------------------------------------
//  DELETE /api/orders?id=ord_xxxx — admin removes an order
// ---------------------------------------------------------
async function handleDelete(req, url, cors) {
  if (!isAdmin(req)) return json({ error: "unauthorized" }, 401, cors);

  const id = url.searchParams.get("id");
  if (!id || !/^ord_[A-Za-z0-9]+$/.test(id)) return json({ error: "invalid_id" }, 400, cors);

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) return json({ error: "storage_not_configured" }, 500, cors);

  try {
    const list = await blobList("orders/", blobToken);
    const target = list.find(b => b.pathname.endsWith(`__${id}.json`));
    if (!target) return json({ error: "not_found" }, 404, cors);
    await del(target.url, { token: blobToken });
    return json({ ok: true, id }, 200, cors);
  } catch (e) {
    return json({ error: "delete_failed", detail: String(e && e.message || e).slice(0, 200) }, 502, cors);
  }
}

// =========================================================
//  Validation + pricing
// =========================================================
// Strip control characters (CR, LF, tab, etc.) that could enable header
// injection in plaintext email bodies or generally muck up rendering.
function clean(s, max) {
  return String(s ?? "").replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, max);
}

function validateOrder(b) {
  if (!b || typeof b !== "object") return { error: "missing_body" };

  const order = {};

  // Customer
  const name = clean(b.name, 80);
  const phone = clean(b.phone, 30);
  const address = clean(b.address, 200);
  if (!name)    return { error: "missing_name" };
  if (!phone)   return { error: "missing_phone" };
  if (!address) return { error: "missing_address" };
  if (!/^[+\d\s\-().]{7,30}$/.test(phone)) return { error: "invalid_phone" };
  order.name = name;
  order.phone = phone;
  order.address = address;

  // Email (optional). clean() already stripped control chars.
  const emailRaw = clean(b.email, 120);
  if (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailRaw)) return { error: "invalid_email" };
  if (emailRaw) order.email = emailRaw;

  // Car
  order.car = clean(b.car, 120);

  // Tier (required)
  const tier = clean(b.tier, 20);
  if (!TIERS.has(tier)) return { error: "invalid_tier" };
  order.tier = tier;

  // Scope (drives interior add-on)
  const scope = clean(b.scope || "exterior", 20);
  if (!["exterior", "interior", "both"].includes(scope)) return { error: "invalid_scope" };
  order.scope = scope;

  // Add-ons (array of ids)
  const addons = Array.isArray(b.addons) ? b.addons.filter(a => ADDON_IDS.has(a)) : [];
  order.addons = [...new Set(addons)]; // dedupe

  // Notes
  order.notes = clean(b.notes, 600);

  // Preferred timing
  const timing = clean(b.preferred_timing, 80);
  order.preferred_timing = timing;

  // Location (for travel fee)
  const location = clean(b.location || "burns", 20);
  if (!["burns", "annarbor", "nearby"].includes(location)) return { error: "invalid_location" };
  order.location = location;

  // First-time flag — DORMANT endpoint only. The live first-time 15% is now
  // server-decided in the loyalty store (api/_loyalty.js, keyed by email
  // hash), not trusted from the client. If this POST path is ever
  // re-enabled, route first-time eligibility through the loyalty record
  // instead of this client-supplied flag (otherwise it's farmable again).
  order.first_time = !!b.first_time;

  return { order };
}

function computePricing(order) {
  const base = PRICES[order.tier];

  // Build add-ons list (auto-include interior when scope says so)
  const addonSet = new Set(order.addons || []);
  if (order.scope === "interior" || order.scope === "both") addonSet.add("interior");

  // Steam clean only pairs with interior — drop it if interior isn't included.
  if (!addonSet.has("interior")) {
    addonSet.delete("steam");
  }

  const addons = [...addonSet].map(id => ({ id, price: ADDON_PRICES[id] || 0 }));
  const addonTotal = addons.reduce((s, a) => s + a.price, 0);

  const travel = order.location === "annarbor" ? 5 : 0;

  // Bundle discount: interior paired with essential or premium
  const hasInterior = addonSet.has("interior");
  const bundleEligible = hasInterior && (order.tier === "essential" || order.tier === "premium");
  const bundleDiscount = bundleEligible ? 10 : 0;

  // First-time discount: 15% off subtotal (after bundle)
  const subtotalPreFirstTime = base + addonTotal + travel - bundleDiscount;
  const firstTimeDiscount = order.first_time ? Math.round(subtotalPreFirstTime * 0.15) : 0;
  const total = subtotalPreFirstTime - firstTimeDiscount;

  return {
    pricing: {
      base,
      addons,
      addon_total: addonTotal,
      travel,
      bundle_discount: bundleDiscount,
      first_time_discount: firstTimeDiscount,
      first_time_rate_pct: order.first_time ? 25 : 0,
      total,
    },
  };
}

// =========================================================
//  Auth
// =========================================================
function isAdmin(req) {
  const want = process.env.ELION_ADMIN_PASSWORD;
  if (!want) return false; // fail-closed if not configured
  const got = req.headers.get("x-elion-admin") || "";
  return got && timingSafeEqual(got, want);
}

function isBypass(req) {
  const want = process.env.ELION_BYPASS_TOKEN || process.env.ELLIS_BYPASS_TOKEN;
  if (!want) return false;
  const got = req.headers.get("x-elion-bypass") || req.headers.get("x-ellis-bypass") || "";
  return got && timingSafeEqual(got, want);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// =========================================================
//  Blob helpers — wrapping @vercel/blob SDK
// =========================================================
async function blobPut(pathname, content, token) {
  // The store is configured as private. Reads must use the signed
  // downloadUrl returned by list()/head(), not the raw url.
  return await put(pathname, content, {
    access: "private",
    token,
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

async function blobList(prefix, token) {
  const all = [];
  let cursor = undefined;
  for (let i = 0; i < 50; i++) {
    const res = await list({ prefix, limit: 1000, cursor, token });
    all.push(...(res.blobs || []));
    if (!res.hasMore || !res.cursor) break;
    cursor = res.cursor;
  }
  return all;
}

async function blobGetTextByPath(pathname, token) {
  // Private blobs require SDK get() — fetching downloadUrl directly
  // returns a 401 without auth. SDK get() handles the signing.
  const result = await get(pathname, { access: "private", token });
  // result has { stream, headers, blob } — convert stream to text
  if (result.stream) {
    const reader = result.stream.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const all = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
    let offset = 0;
    for (const c of chunks) { all.set(c, offset); offset += c.length; }
    return new TextDecoder("utf-8").decode(all);
  }
  if (result.blob) return await result.blob.text();
  throw new Error("blob get: no readable body");
}

// =========================================================
//  Rate limit + daily cap (same shape as /api/chat)
// =========================================================
function getClientIp(req) {
  const xff = req.headers.get("x-forwarded-for") || "";
  const first = xff.split(",")[0].trim();
  return first || req.headers.get("x-real-ip") || "unknown";
}

function rateLimitCheck(ip) {
  const now = Date.now();
  let b = ipBuckets.get(ip);
  if (!b || b.resetAt <= now) {
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
  return {
    allowed: b.count <= RATE_LIMIT_MAX,
    retryAfterSec: Math.ceil((b.resetAt - now) / 1000),
  };
}

function dailyCapCheck() {
  const now = Date.now();
  if (dailyState.resetAt <= now) dailyState = { count: 0, resetAt: now + DAILY_WINDOW_MS };
  dailyState.count += 1;
  return { allowed: dailyState.count <= DAILY_CAP };
}

// =========================================================
//  Helpers
// =========================================================
function generateId() {
  // 16 chars, URL-safe
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return "ord_" + btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "0").replace(/\//g, "1").replace(/=/g, "").slice(0, 16);
}

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://elioncarcare.com";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-elion-admin, x-elion-bypass, x-ellis-bypass",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}
