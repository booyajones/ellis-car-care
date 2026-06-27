/* ============================================================
   /api/loyalty — punch-card read + operator actions + admin
   ------------------------------------------------------------
   GET  ?email=<raw>                  public, read-only card state (rate-limited)
   GET  ?action=markdone&uid&hash&t   operator one-tap: +1 punch (signed link)
   GET  ?action=redeem&hash&t         operator one-tap: burn a free Essential
   PATCH (X-Elion-Admin)              corrections: noshow / undoredeem / reset

   Writes happen ONLY via the signed operator links (token = HMAC with
   LOYALTY_HASH_SECRET) or the admin password. The public ?email= read can
   never mutate state and returns zeroes for unknown emails (no membership
   oracle). Cal.com bookings are written by /api/cal-webhook, not here.
   ============================================================ */

import crypto from "node:crypto";
import {
  normalizeEmail, hashEmail, isValidEmailShape, verifyToken, timingSafeHex,
  recompute, computeCard, readCustomer, writeCustomer, newCustomer,
  JOBS_PER_FREE, CARD_SLOTS,
} from "./_loyalty.js";

export const config = { runtime: "nodejs" };

const ALLOWED_ORIGINS = new Set([
  "https://wyattautodetailing.com",
  "https://www.wyattautodetailing.com",
  "https://ellis-car-care.vercel.app",
  "http://localhost:5180",
  "http://127.0.0.1:5180",
]);

const RATE_LIMIT_MAX = 20;            // generous for a rewards page, blocks enumeration
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const ipBuckets = new Map();
const MAX_BUCKETS = 5000;

export default async function handler(nodeReq, nodeRes) {
  const headers = nodeReq.headers || {};
  const origin = headers["origin"] || "";
  const cors = corsHeaders(origin);
  const url = new URL(nodeReq.url, "http://localhost");

  const sendJson = (status, obj) => {
    nodeRes.statusCode = status;
    Object.entries({ ...cors, "content-type": "application/json", "cache-control": "no-store" }).forEach(([k, v]) => nodeRes.setHeader(k, v));
    nodeRes.end(JSON.stringify(obj));
  };
  const sendHtml = (status, html) => {
    nodeRes.statusCode = status;
    nodeRes.setHeader("content-type", "text/html; charset=utf-8");
    nodeRes.setHeader("cache-control", "no-store");
    nodeRes.end(html);
  };

  try {
    if (nodeReq.method === "OPTIONS") { nodeRes.statusCode = 204; Object.entries(cors).forEach(([k, v]) => nodeRes.setHeader(k, v)); return nodeRes.end(); }

    const blobToken = process.env.BLOB_READ_WRITE_TOKEN || "";
    if (!blobToken) return sendJson(500, { error: "storage_not_configured" });

    const action = url.searchParams.get("action");

    // ---- Operator one-tap actions (signed token; returns an HTML page) ----
    if (nodeReq.method === "GET" && action) {
      return await handleOperatorAction(action, url, blobToken, sendHtml);
    }

    // ---- Public read ----
    if (nodeReq.method === "GET") {
      const ip = getClientIp(headers);
      if (!rateLimitCheck(ip)) return sendJson(429, { error: "rate_limited" });
      const email = url.searchParams.get("email") || "";
      if (!email || !isValidEmailShape(email)) return sendJson(200, blankCard());
      const hash = hashEmail(normalizeEmail(email));
      if (!hash) return sendJson(500, { error: "loyalty_not_configured" });
      const rec = await readCustomer(hash, blobToken);
      return sendJson(200, publicCard(rec));
    }

    // ---- Admin corrections ----
    if (nodeReq.method === "PATCH") {
      if (!isAdmin(headers)) return sendJson(401, { error: "unauthorized" });
      const body = await readBody(nodeReq);
      const { action: act, hash, uid } = body || {};
      if (!hash) return sendJson(400, { error: "missing_hash" });
      const rec = await readCustomer(hash, blobToken);
      if (!rec) return sendJson(404, { error: "not_found" });
      rec.bookings = rec.bookings || {};
      if (act === "noshow" && uid && rec.bookings[uid]) {
        rec.bookings[uid].status = "noshow";
      } else if (act === "undoredeem") {
        rec.freeRedeemed = Math.max(0, (rec.freeRedeemed || 0) - 1);
      } else if (act === "reset") {
        rec.bookings = {}; rec.freeRedeemed = 0; rec.firstTimeDiscountUsed = false;
      } else {
        return sendJson(400, { error: "invalid_action" });
      }
      recompute(rec);
      await writeCustomer(rec, blobToken);
      return sendJson(200, { ok: true, card: computeCard(rec) });
    }

    return sendJson(405, { error: "method_not_allowed" });
  } catch (e) {
    return sendJson(500, { error: "handler_exception", detail: String(e && e.message || e).slice(0, 200) });
  }
}

// ---------------------------------------------------------
async function handleOperatorAction(action, url, blobToken, sendHtml) {
  const hash = (url.searchParams.get("hash") || "").trim();
  const uid = (url.searchParams.get("uid") || "").trim();
  const token = (url.searchParams.get("t") || "").trim();
  const day = (url.searchParams.get("d") || "").trim();

  if (!/^[a-f0-9]{64}$/.test(hash)) return sendHtml(400, page("Bad link", "That link looks malformed."));

  // Token freshness: one-tap links expire so a forwarded email can't be
  // replayed forever. The webhook stamps the issue-day; reject if missing,
  // future-dated, or older than the window.
  const MAX_TOKEN_AGE_DAYS = 60;
  const today = Math.floor(Date.now() / 86400000);
  const dayNum = Number(day);
  if (!/^\d+$/.test(day) || dayNum > today || (today - dayNum) > MAX_TOKEN_AGE_DAYS) {
    return sendHtml(401, page("Link expired", "This link has expired. Open the latest booking email, or use the dashboard."));
  }
  // uid was encodeURIComponent'd when the token was signed — re-encode to match.
  const uidEnc = encodeURIComponent(uid);

  if (action === "markdone") {
    if (!uid || !verifyToken(`markdone:${uidEnc}:${hash}:${day}`, token)) {
      return sendHtml(401, page("Link expired or invalid", "This mark-done link could not be verified."));
    }
    let rec = await readCustomer(hash, blobToken);
    if (!rec) rec = newCustomer(hash);
    rec.bookings = rec.bookings || {};
    const already = rec.bookings[uid] && rec.bookings[uid].status === "completed";
    if (!rec.bookings[uid]) {
      rec.bookings[uid] = { createdISO: new Date().toISOString(), startISO: "", status: "completed", eventType: "unknown", addons: [], steamWithoutInterior: false };
    } else {
      rec.bookings[uid].status = "completed";
    }
    recompute(rec);
    await writeCustomer(rec, blobToken);
    const card = computeCard(rec);
    const freeMsg = card.freeAvailable > 0
      ? `<p style="color:#3CB286;font-weight:700;">A FREE Essential is now available for this customer. Tap the "Redeem free Essential" link in the booking email when you give it.</p>`
      : "";
    const progress = card.freeAvailable > 0
      ? `<p>Card's full — ${card.stampsFilled} of ${card.totalSlots}.</p>`
      : `<p>Punch ${card.stampsFilled} of ${card.totalSlots}. ${card.nextRewardIn} more for a free Essential.</p>`;
    return sendHtml(200, page(
      already ? "Already marked done" : "Job marked done (+1 punch)",
      `${cardStrip(card)}${progress}${freeMsg}`
    ));
  }

  if (action === "redeem") {
    if (!verifyToken(`redeem:${hash}:${day}`, token)) {
      return sendHtml(401, page("Link expired or invalid", "This redeem link could not be verified."));
    }
    const rec = await readCustomer(hash, blobToken);
    if (!rec) return sendHtml(404, page("No card found", "No punch card exists for this customer yet."));
    const before = computeCard(rec);
    if (before.freeAvailable <= 0) {
      return sendHtml(200, page("No free wash available", `${cardStrip(before)}<p>This customer has no free Essential to redeem right now.</p>`));
    }
    rec.freeRedeemed = (rec.freeRedeemed || 0) + 1;
    recompute(rec);
    await writeCustomer(rec, blobToken);
    const card = computeCard(rec);
    return sendHtml(200, page("Free Essential redeemed", `${cardStrip(card)}<p>Marked one free Essential as used. ${card.freeAvailable} free wash(es) left on the card.</p>`));
  }

  return sendHtml(400, page("Unknown action", "That action is not recognized."));
}

// ---------------------------------------------------------
function blankCard() {
  return { stampsFilled: 1, totalSlots: CARD_SLOTS, nextRewardIn: JOBS_PER_FREE, freeAvailable: 0, returning: false, completedJobs: 0 };
}
function publicCard(rec) {
  const c = computeCard(rec);
  return {
    stampsFilled: c.stampsFilled,
    totalSlots: c.totalSlots,
    nextRewardIn: c.nextRewardIn,
    cardComplete: c.cardComplete,
    freeAvailable: c.freeAvailable,
    returning: c.returning,
    completedJobs: c.completedJobs,
  };
}

function cardStrip(card) {
  let dots = "";
  for (let i = 1; i <= card.totalSlots; i++) {
    const filled = i <= card.stampsFilled;
    const isFree = i === card.totalSlots;
    dots += `<span style="display:inline-block;width:26px;height:26px;border-radius:50%;margin:2px;border:2px solid ${isFree ? '#3CB286' : '#E89B3A'};background:${filled ? (isFree ? '#3CB286' : '#E89B3A') : 'transparent'};"></span>`;
  }
  return `<div style="margin:12px 0;">${dots}</div>`;
}

function page(title, bodyHtml) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)} — Wyatt Auto Detailing</title>
<style>body{margin:0;background:#2A2D33;color:#F4ECD8;font-family:-apple-system,Inter,Helvetica,Arial,sans-serif;line-height:1.5;}
.wrap{max-width:480px;margin:0 auto;padding:48px 24px;text-align:center;}
.bar{height:6px;display:flex;}.bar i{flex:1;}
h1{font-family:Georgia,serif;font-size:1.6rem;margin:24px 0 8px;}
a.btn{display:inline-block;margin-top:24px;padding:12px 22px;background:#E89B3A;color:#0E1014;border-radius:999px;text-decoration:none;font-weight:700;}</style></head>
<body><div class="bar"><i style="background:#D94436"></i><i style="background:#E89B3A"></i><i style="background:#E4CB42"></i><i style="background:#3CB286"></i></div>
<div class="wrap"><h1>${escapeHtml(title)}</h1>${bodyHtml}<a class="btn" href="https://wyattautodetailing.com/admin">Open dashboard</a></div></body></html>`;
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------------------------------------------------------
function isAdmin(headers) {
  const want = process.env.ELION_ADMIN_PASSWORD;
  if (!want) return false;
  const got = headers["x-elion-admin"] || "";
  // HMAC both sides to fixed-length (64-char) hex digests before comparing.
  // This makes the compare constant-time regardless of input and leaks
  // neither the password length nor a per-character timing signal (the old
  // length-mismatch early-return did both). Key off LOYALTY_HASH_SECRET when
  // present so the admin secret is never used as its own comparison key.
  const key = process.env.LOYALTY_HASH_SECRET || want;
  const digest = (v) => crypto.createHmac("sha256", key).update(String(v)).digest("hex");
  return timingSafeHex(digest(got), digest(want));
}

async function readBody(nodeReq) {
  if (nodeReq.body && typeof nodeReq.body === "object") return nodeReq.body;
  const chunks = [];
  for await (const c of nodeReq) chunks.push(c);
  const t = Buffer.concat(chunks).toString("utf8");
  try { return t ? JSON.parse(t) : {}; } catch { return {}; }
}

function getClientIp(headers) {
  const xff = headers["x-forwarded-for"] || "";
  return (xff.split(",")[0].trim()) || headers["x-real-ip"] || "unknown";
}
function rateLimitCheck(ip) {
  const now = Date.now();
  let b = ipBuckets.get(ip);
  if (!b || b.resetAt <= now) {
    if (ipBuckets.size >= MAX_BUCKETS) { for (const [k, v] of ipBuckets) { if (v.resetAt <= now) ipBuckets.delete(k); } }
    b = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    ipBuckets.set(ip, b);
  }
  b.count += 1;
  return b.count <= RATE_LIMIT_MAX;
}

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://wyattautodetailing.com";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-elion-admin",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
