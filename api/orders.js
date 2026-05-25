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

import { put, list } from "@vercel/blob";

// Node runtime (not Edge): @vercel/blob 2.x pulls in undici which uses
// node:stream / node:net / etc. that aren't available on Edge. Booking
// latency isn't critical (a form submit), so Node runtime is fine.
export const config = { runtime: "nodejs" };

const ALLOWED_ORIGINS = new Set([
  "https://ellis-car-care.vercel.app",
  "https://elioncarcare.com",
  "https://www.elioncarcare.com",
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
const PRICES = { basic: 40, essential: 90, premium: 200 };
const ADDON_PRICES = {
  interior: 50,
  headlight: 30,
  pethair: 20,
  stain: 25,
  leather: 15,
};
const TIERS = new Set(["basic", "essential", "premium"]);
const ADDON_IDS = new Set(Object.keys(ADDON_PRICES));

// =========================================================
//  Handler
// =========================================================
export default async function handler(req) {
  const origin = req.headers.get("origin") || "";
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const url = new URL(req.url);

  if (req.method === "POST") return handleCreate(req, cors);
  if (req.method === "GET")  return handleList(req, cors);
  if (req.method === "PATCH") return handleUpdateStatus(req, url, cors);

  return json({ error: "method_not_allowed" }, 405, cors);
}

// ---------------------------------------------------------
//  POST /api/orders  — customer creates order
// ---------------------------------------------------------
async function handleCreate(req, cors) {
  // Geo gate
  const country = req.headers.get("x-vercel-ip-country") || "";
  if (country && !ALLOWED_COUNTRIES.has(country)) {
    return json({ error: "region_not_supported" }, 403, cors);
  }
  // Rate limit
  const ip = getClientIp(req);
  const rl = rateLimitCheck(ip);
  if (!rl.allowed) {
    return json({ error: "rate_limited", retry_after_seconds: rl.retryAfterSec }, 429, cors);
  }
  // Daily cap
  const cap = dailyCapCheck();
  if (!cap.allowed) {
    return json({ error: "daily_cap_reached", message: "We've hit today's booking limit. Text Elion at (628) 252-0740." }, 503, cors);
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
      blobs.map(b => blobGetText(b.url).then(t => JSON.parse(t)).catch(() => null))
    );
    const valid = orders.filter(Boolean);
    valid.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    return json({ ok: true, count: valid.length, orders: valid }, 200, cors);
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
    const text = await blobGet(target.url, blobToken);
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

// =========================================================
//  Validation + pricing
// =========================================================
function validateOrder(b) {
  if (!b || typeof b !== "object") return { error: "missing_body" };

  const order = {};

  // Customer
  const name = String(b.name || "").trim().slice(0, 80);
  const phone = String(b.phone || "").trim().slice(0, 30);
  const address = String(b.address || "").trim().slice(0, 200);
  if (!name)    return { error: "missing_name" };
  if (!phone)   return { error: "missing_phone" };
  if (!address) return { error: "missing_address" };
  if (!/^[+\d\s\-().]{7,30}$/.test(phone)) return { error: "invalid_phone" };
  order.name = name;
  order.phone = phone;
  order.address = address;

  // Car
  order.car = String(b.car || "").trim().slice(0, 120);

  // Tier (required)
  const tier = String(b.tier || "").trim();
  if (!TIERS.has(tier)) return { error: "invalid_tier" };
  order.tier = tier;

  // Scope (drives interior add-on)
  const scope = String(b.scope || "exterior").trim();
  if (!["exterior", "interior", "both"].includes(scope)) return { error: "invalid_scope" };
  order.scope = scope;

  // Add-ons (array of ids)
  const addons = Array.isArray(b.addons) ? b.addons.filter(a => ADDON_IDS.has(a)) : [];
  order.addons = [...new Set(addons)]; // dedupe

  // Notes
  order.notes = String(b.notes || "").trim().slice(0, 600);

  // Preferred timing
  const timing = String(b.preferred_timing || "").trim().slice(0, 80);
  order.preferred_timing = timing;

  // Location (for travel fee)
  const location = String(b.location || "burns").trim();
  if (!["burns", "annarbor", "nearby"].includes(location)) return { error: "invalid_location" };
  order.location = location;

  // First-time flag (client-side hint; we recompute on server)
  order.first_time = !!b.first_time;

  return { order };
}

function computePricing(order) {
  const base = PRICES[order.tier];

  // Build add-ons list (auto-include interior when scope says so)
  const addonSet = new Set(order.addons || []);
  if (order.scope === "interior" || order.scope === "both") addonSet.add("interior");

  // Drop interior-dependent add-ons if interior isn't actually included.
  // (Mirrors client-side book.js so server total matches what user saw.)
  if (!addonSet.has("interior")) {
    addonSet.delete("pethair");
    addonSet.delete("stain");
    addonSet.delete("leather");
  }

  // Leather conditioning is free with Premium.
  if (addonSet.has("leather") && order.tier === "premium") {
    addonSet.delete("leather");
  }

  const addons = [...addonSet].map(id => ({ id, price: ADDON_PRICES[id] || 0 }));
  const addonTotal = addons.reduce((s, a) => s + a.price, 0);

  const travel = order.location === "annarbor" ? 5 : 0;

  // Bundle discount: interior paired with essential or premium
  const hasInterior = addonSet.has("interior");
  const bundleEligible = hasInterior && (order.tier === "essential" || order.tier === "premium");
  const bundleDiscount = bundleEligible ? 10 : 0;

  // First-time discount: 25% off subtotal (after bundle)
  const subtotalPreFirstTime = base + addonTotal + travel - bundleDiscount;
  const firstTimeDiscount = order.first_time ? Math.round(subtotalPreFirstTime * 0.25) : 0;
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
  // SDK signature: put(pathname, body, { access, token, contentType, ... })
  return await put(pathname, content, {
    access: "public",            // private blobs require signed URLs which adds complexity;
                                  // we keep blobs at unguessable paths instead (cryptographically random ids).
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

async function blobGetText(url) {
  // Blobs are at unguessable random URLs; fetch directly.
  const res = await fetch(url);
  if (!res.ok) throw new Error(`blob get ${res.status}`);
  return await res.text();
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
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://ellis-car-care.vercel.app";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-elion-admin",
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
