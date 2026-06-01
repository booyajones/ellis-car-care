/* ============================================================
   /api/cal-webhook — Cal.com webhook receiver (the ONLY writer of
   loyalty state).
   ------------------------------------------------------------
   Security: verifies X-Cal-Signature-256 = HMAC-SHA256(rawBody,
   CAL_WEBHOOK_SECRET) over the EXACT raw bytes, timing-safe. No secret
   or bad signature -> 401. Fail closed.

   Idempotency: each (uid, triggerEvent) is processed once (Blob marker).
   Counters are recomputed from the ledger, so even a duplicate that
   slips through is a no-op.

   Triggers handled:
     BOOKING_CREATED   -> register identity, set firstTimeDiscountUsed,
                          add ledger entry (status: booked), email Ellis
     BOOKING_CANCELLED -> flip that uid to cancelled, recompute
     MEETING_ENDED     -> secondary auto-complete (booked -> completed)
                          (authoritative completion is Ellis's one-tap link)
   ============================================================ */

import crypto from "node:crypto";
import {
  normalizeEmail, hashEmail, signToken, timingSafeHex,
  newCustomer, recompute, computeCard,
  readCustomer, writeCustomer, eventSeen, markEvent,
} from "./_loyalty.js";
import { sendEmail, ellisLoyaltyNotificationEmail } from "./_email.js";

export const config = { runtime: "nodejs" };

const SITE = "https://elioncarcare.com";

export default async function handler(nodeReq, nodeRes) {
  const send = (status, obj) => {
    nodeRes.statusCode = status;
    nodeRes.setHeader("content-type", "application/json");
    nodeRes.setHeader("cache-control", "no-store");
    nodeRes.end(JSON.stringify(obj));
  };

  if (nodeReq.method !== "POST") return send(405, { error: "method_not_allowed" });

  const secret = process.env.CAL_WEBHOOK_SECRET || "";
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN || "";
  if (!secret) return send(500, { error: "webhook_secret_not_configured" }); // fail closed
  if (!blobToken) return send(500, { error: "storage_not_configured" });

  // --- read RAW body bytes (must precede any parsing for a valid HMAC) ---
  let raw;
  try {
    const chunks = [];
    for await (const chunk of nodeReq) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    raw = Buffer.concat(chunks);
  } catch (e) {
    return send(400, { error: "body_read_failed" });
  }
  if (!raw || raw.length === 0) {
    // Some platforms pre-buffer to req.body; reconstruct as a fallback.
    if (nodeReq.body) {
      raw = Buffer.from(typeof nodeReq.body === "string" ? nodeReq.body : JSON.stringify(nodeReq.body), "utf8");
    } else {
      return send(400, { error: "empty_body" });
    }
  }

  // --- verify signature (timing-safe) ---
  const headers = nodeReq.headers || {};
  const sigHeader = String(
    headers["x-cal-signature-256"] || headers["X-Cal-Signature-256"] || ""
  ).trim();
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  if (!sigHeader || !timingSafeHex(expected, sigHeader)) {
    return send(401, { error: "invalid_signature" });
  }

  // --- parse ---
  let evt;
  try { evt = JSON.parse(raw.toString("utf8")); }
  catch { return send(400, { error: "bad_json" }); }

  const trigger = String(evt.triggerEvent || evt.trigger || "").toUpperCase();
  const payload = evt.payload || {};
  const uid = String(payload.uid || payload.bookingUid || (payload.booking && payload.booking.uid) || "").trim();

  // We only act on triggers we understand + that carry a uid.
  const HANDLED = new Set(["BOOKING_CREATED", "BOOKING_CANCELLED", "MEETING_ENDED"]);
  if (!HANDLED.has(trigger) || !uid) {
    return send(200, { ok: true, ignored: true, trigger });
  }

  // --- identity ---
  const email = extractEmail(payload);
  const hash = email ? hashEmail(normalizeEmail(email)) : "";
  if (!hash) {
    // No email or no hash secret -> can't attribute. Ack so Cal stops retrying.
    return send(200, { ok: true, skipped: "no_identity" });
  }

  // --- idempotency ---
  try {
    if (await eventSeen(uid, trigger, blobToken)) {
      return send(200, { ok: true, duplicate: true });
    }
  } catch { /* if the check fails, fall through; recompute keeps us safe */ }

  // --- load or create customer ---
  let rec = await readCustomer(hash, blobToken);
  const isNewCustomer = !rec;
  if (!rec) rec = newCustomer(hash);
  rec.bookings = rec.bookings || {};

  const tier = detectTier(payload);
  const { addons, hasInterior, hasSteam, steamWithoutInterior } = detectAddons(payload);

  let notify = null;

  if (trigger === "BOOKING_CREATED") {
    const firstTimeEligible = !rec.firstTimeDiscountUsed; // before we flip it
    // If a terminal status already exists for this uid (e.g. Ellis tapped
    // "mark done" before the CREATED webhook landed, or it was cancelled),
    // preserve it — never demote completed/cancelled/noshow back to booked.
    const prev = rec.bookings[uid];
    const terminal = prev && ["completed", "cancelled", "noshow"].includes(prev.status);
    rec.bookings[uid] = {
      createdISO: (prev && prev.createdISO) || new Date().toISOString(),
      startISO: String(payload.startTime || payload.start || (prev && prev.startISO) || ""),
      status: terminal ? prev.status : "booked",
      eventType: tier !== "unknown" ? tier : (prev && prev.eventType) || tier,
      addons: addons.length ? addons : (prev && prev.addons) || [],
      steamWithoutInterior,
    };
    rec.firstTimeDiscountUsed = true; // farming guard: flips on first ever booking
    recompute(rec);
    notify = { firstTimeEligible, isNewCustomer };
  } else if (trigger === "BOOKING_CANCELLED") {
    if (rec.bookings[uid]) rec.bookings[uid].status = "cancelled";
    recompute(rec);
  } else if (trigger === "MEETING_ENDED") {
    // Secondary auto-complete. Authoritative completion is Ellis's tap,
    // but if the meeting end fires and the booking is still "booked",
    // count it. If the uid was never seen (missed CREATED webhook), upsert.
    if (!rec.bookings[uid]) {
      rec.bookings[uid] = {
        createdISO: new Date().toISOString(),
        startISO: String(payload.startTime || payload.start || ""),
        status: "completed",
        eventType: tier,
        addons,
        steamWithoutInterior,
      };
    } else if (rec.bookings[uid].status === "booked") {
      rec.bookings[uid].status = "completed";
    }
    recompute(rec);
  }

  // --- persist + mark processed ---
  try {
    await writeCustomer(rec, blobToken);
    await markEvent(uid, trigger, blobToken);
  } catch (e) {
    console.error("[cal-webhook] persist failed:", String(e && e.message || e).slice(0, 200));
    // Still 200 so Cal doesn't spin; the next event recomputes from ledger.
    return send(200, { ok: true, persistWarning: true });
  }

  // --- notify Ellis on new bookings (with loyalty context + one-tap links) ---
  if (trigger === "BOOKING_CREATED" && process.env.ELION_NOTIFY_EMAIL) {
    try {
      const card = computeCard(rec);
      // Day-bucket in the signed payload so a leaked/forwarded one-tap link
      // can't be replayed forever (loyalty.js rejects tokens older than its
      // freshness window). encodeURIComponent the uid in BOTH the query and
      // the signed payload so they always match on verify.
      const day = Math.floor(Date.now() / 86400000);
      const uidEnc = encodeURIComponent(uid);
      const markDoneUrl = `${SITE}/api/loyalty?action=markdone&uid=${uidEnc}&hash=${hash}&d=${day}&t=${signToken(`markdone:${uidEnc}:${hash}:${day}`)}`;
      const redeemUrl   = `${SITE}/api/loyalty?action=redeem&hash=${hash}&d=${day}&t=${signToken(`redeem:${hash}:${day}`)}`;
      const mail = ellisLoyaltyNotificationEmail({
        name: extractName(payload),
        email,
        tier,
        startISO: String(payload.startTime || payload.start || ""),
        addons,
        hasInterior,
        hasSteam,
        steamWithoutInterior,
        firstTimeEligible: notify ? notify.firstTimeEligible : false,
        isNewCustomer: notify ? notify.isNewCustomer : false,
        card,
        markDoneUrl,
        redeemUrl,
      });
      await sendEmail({
        to: process.env.ELION_NOTIFY_EMAIL,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        replyTo: email || undefined,
        tags: [{ name: "type", value: "loyalty_booking" }],
      }).catch(() => {});
    } catch (e) {
      console.error("[cal-webhook] notify failed:", String(e && e.message || e).slice(0, 200));
    }
  }

  return send(200, { ok: true, trigger });
}

// ============================================================
//  Defensive payload parsing (Cal.com response shapes vary:
//  responses{key:{label,value}}, userFieldsResponses, value as
//  array | string | boolean | object). We keyword-match a haystack.
// ============================================================
function collectResponseStrings(payload) {
  const out = [];
  const eat = (v) => {
    if (v == null) return;
    if (Array.isArray(v)) { v.forEach(eat); return; }
    if (typeof v === "object") {
      // {label,value} or {optionValue,label} etc.
      if ("value" in v) eat(v.value);
      if ("label" in v) eat(v.label);
      if ("optionValue" in v) eat(v.optionValue);
      return;
    }
    out.push(String(v));
  };
  const _b = payload.booking || {};
  for (const src of [payload.responses, payload.userFieldsResponses, payload.bookingFieldsResponses, _b.responses, _b.userFieldsResponses]) {
    if (src && typeof src === "object") {
      for (const k of Object.keys(src)) { out.push(k); eat(src[k]); }
    }
  }
  return out.join("  ").toLowerCase();
}

function detectAddons(payload) {
  const hay = collectResponseStrings(payload);
  const has = (re) => re.test(hay);
  const addons = [];
  if (has(/diablo/)) addons.push("diablo");
  if (has(/clay\s*bar|claybar/)) addons.push("claybar");
  // Deep clean before interior so "deep clean" doesn't also count as a flat
  // interior. Steam/Trim option labels deliberately avoid the word "interior".
  const hasDeep = has(/deep\s*clean|deepclean/);
  if (hasDeep) addons.push("deepclean");
  const hasInterior = has(/interior/);
  if (hasInterior) addons.push("interior");
  const hasSteam = has(/steam/);
  if (hasSteam) addons.push("steam");
  if (has(/\btrim\b|vrp/)) addons.push("trim");
  // Narrow: only the "Ceramic on wheels" option, not a stray "ceramic" in a
  // free-text field (and Premium already includes it, so it is not an option there).
  if (has(/ceramic\s*(?:on\s*)?wheel/)) addons.push("ceramicwheels");
  if (has(/headlight/)) addons.push("headlight");
  return {
    addons: [...new Set(addons)],
    hasInterior,
    hasSteam,
    // Steam pairs with any interior work (standard interior OR a deep clean).
    steamWithoutInterior: hasSteam && !hasInterior && !hasDeep,
  };
}

function detectTier(payload) {
  const cand = [
    payload.eventTypeSlug,
    payload.eventType && payload.eventType.slug,
    payload.type,
    payload.eventType && payload.eventType.title,
    payload.title,
  ].filter(Boolean).join(" ").toLowerCase();
  if (/premium/.test(cand)) return "premium";
  if (/essential/.test(cand)) return "essential";
  if (/basic/.test(cand)) return "basic";
  return "unknown";
}

// Attendees can live at payload.attendees OR payload.booking.attendees
// depending on the trigger (MEETING_ENDED sometimes nests under booking).
function attendees(payload) {
  if (Array.isArray(payload.attendees)) return payload.attendees;
  if (payload.booking && Array.isArray(payload.booking.attendees)) return payload.booking.attendees;
  return [];
}

function extractEmail(payload) {
  const att = attendees(payload);
  if (att[0] && att[0].email) return String(att[0].email);
  for (const r of [payload.responses, payload.booking && payload.booking.responses]) {
    if (r && r.email) {
      const v = r.email.value != null ? r.email.value : r.email;
      if (typeof v === "string") return v;
    }
  }
  return "";
}

function extractName(payload) {
  const att = attendees(payload);
  if (att[0] && att[0].name) return String(att[0].name).slice(0, 80);
  for (const r of [payload.responses, payload.booking && payload.booking.responses]) {
    if (r && r.name) {
      const v = r.name.value != null ? r.name.value : r.name;
      if (typeof v === "string") return v.slice(0, 80);
    }
  }
  return "Customer";
}
