/* ============================================================
   /api/_loyalty.js — loyalty + punch-card core (shared helpers)
   ------------------------------------------------------------
   Identity: customer EMAIL, normalized then HMAC-SHA256 with a server
   secret (LOYALTY_HASH_SECRET). The Blob store holds ZERO readable PII —
   only the hash. Cal.com's own booking email shows Ellis the real
   name/email, so the loyalty record never needs it.

   Punch card: pre-loaded 5-stamp card (1 courtesy stamp). 4 completed
   jobs earn a free Essential. Punches are awarded ONLY on Ellis-confirmed
   completion (a signed one-tap link), never on booking-created. Counters
   are RECOMPUTED from the per-booking ledger on every write, so duplicate
   or out-of-order webhooks are no-ops by construction.

   This module is imported by api/cal-webhook.js (the only writer) and
   api/loyalty.js (public read + operator one-tap + admin).
   ============================================================ */

import crypto from "node:crypto";
import { put, list, get } from "@vercel/blob";

export const config = { runtime: "nodejs" };

// 4 completed jobs -> 1 free Essential. Card shows 5 slots (1 courtesy).
export const JOBS_PER_FREE = 4;
export const CARD_SLOTS = 5;

const CUST_PREFIX = "loyalty/customers/";
const EVENT_PREFIX = "loyalty/events/";

// ---------- identity ----------
export function normalizeEmail(email) {
  let e = String(email || "").trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1 || at === e.length - 1) return e; // not email-shaped; return as-is
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  // Plus-addressing: drop everything from the first "+"
  const plus = local.indexOf("+");
  if (plus > -1) local = local.slice(0, plus);
  // Gmail also ignores dots in the local part
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
    domain = "gmail.com";
  }
  return `${local}@${domain}`;
}

export function hashEmail(normalized) {
  const secret = process.env.LOYALTY_HASH_SECRET || "";
  if (!secret) return ""; // caller must treat as not-configured
  return crypto.createHmac("sha256", secret).update(String(normalized)).digest("hex");
}

export function isValidEmailShape(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || ""));
}

// ---------- signed one-tap operator tokens ----------
// Token = HMAC(LOYALTY_HASH_SECRET, "action:value"). Lets Ellis tap a link
// from his phone with no password, but the link can't be forged.
export function signToken(payload) {
  const secret = process.env.LOYALTY_HASH_SECRET || "";
  if (!secret) return "";
  return crypto.createHmac("sha256", secret).update(String(payload)).digest("hex");
}
export function verifyToken(payload, token) {
  const want = signToken(payload);
  return want.length > 0 && timingSafeHex(want, String(token || ""));
}

export function timingSafeHex(a, b) {
  const ab = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (ab.length !== bb.length) return false;
  try { return crypto.timingSafeEqual(ab, bb); } catch { return false; }
}

// ---------- record shape + counters ----------
export function newCustomer(hash) {
  const now = new Date().toISOString();
  return {
    v: 1,
    emailHash: hash,
    firstSeenISO: now,
    lastSeenISO: now,
    completedJobs: 0,
    freeEarned: 0,
    freeRedeemed: 0,
    firstTimeDiscountUsed: false,
    activeBookings: [],
    bookings: {}, // uid -> { createdISO, startISO, status, eventType, addons[], steamWithoutInterior }
  };
}

// Always recompute counters from the ledger — never increment. Makes
// duplicate / out-of-order webhooks idempotent.
export function recompute(rec) {
  const bookings = rec.bookings || {};
  let completed = 0;
  const active = [];
  for (const uid of Object.keys(bookings)) {
    const st = bookings[uid].status;
    if (st === "completed") completed++;
    if (st === "booked") active.push(uid);
  }
  rec.completedJobs = completed;
  rec.freeEarned = Math.floor(completed / JOBS_PER_FREE);
  rec.activeBookings = active;
  rec.lastSeenISO = new Date().toISOString();
  return rec;
}

// Customer-facing card state (read-only, derived). Pre-loaded courtesy stamp.
export function computeCard(rec) {
  const completed = rec ? (rec.completedJobs || 0) : 0;
  const freeEarned = Math.floor(completed / JOBS_PER_FREE);
  const freeRedeemed = rec ? (rec.freeRedeemed || 0) : 0;
  const freeAvailable = Math.max(0, freeEarned - freeRedeemed);
  const inCycle = completed % JOBS_PER_FREE;       // 0..3
  const stampsFilled = inCycle + 1;                // +1 courtesy -> 1..4 (5th = the free)
  const nextRewardIn = JOBS_PER_FREE - inCycle;    // jobs until the next free (1..4)
  return {
    completedJobs: completed,
    stampsFilled,
    totalSlots: CARD_SLOTS,
    nextRewardIn,
    freeEarned,
    freeRedeemed,
    freeAvailable,
    firstTimeEligible: rec ? !rec.firstTimeDiscountUsed : true,
    returning: !!(rec && rec.completedJobs > 0),
  };
}

// ---------- Blob helpers (private store; same pattern as orders.js) ----------
export function custPath(hash) { return `${CUST_PREFIX}${hash}.json`; }
export function eventPath(uid, trigger) {
  const safeUid = String(uid).replace(/[^A-Za-z0-9_-]/g, "");
  const safeTrig = String(trigger).replace(/[^A-Za-z0-9_]/g, "");
  return `${EVENT_PREFIX}${safeUid}__${safeTrig}.json`;
}

export async function blobPut(pathname, content, token) {
  return await put(pathname, content, {
    access: "private",
    token,
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function blobGetText(pathname, token) {
  const result = await get(pathname, { access: "private", token });
  if (result && result.stream) {
    const reader = result.stream.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const all = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
    let off = 0;
    for (const c of chunks) { all.set(c, off); off += c.length; }
    return new TextDecoder("utf-8").decode(all);
  }
  if (result && result.blob) return await result.blob.text();
  throw new Error("blob get: no readable body");
}

export async function blobList(prefix, token) {
  const all = [];
  let cursor;
  for (let i = 0; i < 50; i++) {
    const res = await list({ prefix, limit: 1000, cursor, token });
    all.push(...(res.blobs || []));
    if (!res.hasMore || !res.cursor) break;
    cursor = res.cursor;
  }
  return all;
}

export async function readCustomer(hash, token) {
  try { return JSON.parse(await blobGetText(custPath(hash), token)); }
  catch { return null; }
}
export async function writeCustomer(rec, token) {
  await blobPut(custPath(rec.emailHash), JSON.stringify(rec, null, 2), token);
}

// Idempotency: has this (uid, trigger) webhook already been processed?
export async function eventSeen(uid, trigger, token) {
  try { await blobGetText(eventPath(uid, trigger), token); return true; }
  catch { return false; }
}
export async function markEvent(uid, trigger, token) {
  await blobPut(eventPath(uid, trigger), JSON.stringify({ uid, trigger, at: new Date().toISOString() }), token);
}
