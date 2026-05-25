/* ============================================================
   /api/_email.js — multi-provider email sender
   ------------------------------------------------------------
   Provider priority (first available wins):
     1. RESEND_API_KEY                → Resend REST API
     2. GMAIL_USER + GMAIL_APP_PASSWORD → Gmail SMTP via nodemailer
     3. (nothing set)                 → soft no-op, order still succeeds

   Sends:
     - Booking confirmation to the customer (if order.email present)
     - New-order notification to Elion (if ELION_NOTIFY_EMAIL set)

   To swap to Resend later (better deliverability, branded domain):
     1. Sign up at https://resend.com (free tier 3K/mo)
     2. Generate API key
     3. vercel env add RESEND_API_KEY production
     4. Verify elioncarcare.com as a Resend domain
     5. vercel env add EMAIL_FROM "Elion Car Care <book@elioncarcare.com>"
   The code automatically prefers Resend over Gmail once the key is set.
   ============================================================ */

import nodemailer from "nodemailer";

const RESEND_URL = "https://api.resend.com/emails";

let _gmailTransporter = null;
function getGmailTransporter() {
  if (_gmailTransporter) return _gmailTransporter;
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null;
  _gmailTransporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
  return _gmailTransporter;
}

export async function sendEmail({ to, subject, html, text, replyTo, from, cc, tags }) {
  // Resend is only fully active once a verified domain is set via EMAIL_FROM.
  // Without EMAIL_FROM, Resend would route through the onboarding@resend.dev
  // sandbox which can only deliver to the Resend account owner. So we gate on
  // both the API key AND a configured EMAIL_FROM.
  const resendReady = !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
  const gmail = getGmailTransporter();

  // 1. Prefer Resend when fully configured. Fall through to Gmail on failure.
  if (resendReady) {
    const r = await sendViaResend({ to, subject, html, text, replyTo, from, cc, tags });
    if (r.ok) return r;
    if (gmail) {
      console.warn("[email] resend failed, falling back to gmail:", JSON.stringify(r).slice(0, 300));
      const g = await sendViaGmail({ to, subject, html, text, replyTo, from, cc, transporter: gmail });
      if (g.ok) return { ...g, fallback: true, resend_error: r };
      return g;
    }
    console.error("[email] resend failed, no gmail fallback configured:", JSON.stringify(r).slice(0, 300));
    return r;
  }

  // 2. Gmail SMTP if configured
  if (gmail) {
    return sendViaGmail({ to, subject, html, text, replyTo, from, cc, transporter: gmail });
  }

  // 3. No provider configured — soft no-op
  return { ok: false, skipped: true, reason: "No email provider configured (set EMAIL_FROM + RESEND_API_KEY, or GMAIL_USER + GMAIL_APP_PASSWORD)" };
}

async function sendViaResend({ to, subject, html, text, replyTo, from, cc, tags }) {
  const apiKey = process.env.RESEND_API_KEY;
  // EMAIL_FROM is required. The resendReady gate in sendEmail guarantees it is
  // set; if a future caller bypasses that gate, fail loudly rather than route
  // through the resend.dev sandbox (which only delivers to the account owner).
  const defaultFrom = process.env.EMAIL_FROM;
  if (!from && !defaultFrom) {
    return { ok: false, provider: "resend", error: "EMAIL_FROM not set" };
  }

  const body = {
    from: from || defaultFrom,
    to: Array.isArray(to) ? to : [to],
    subject,
    ...(html ? { html } : {}),
    ...(text ? { text } : {}),
    ...(replyTo ? { reply_to: replyTo } : {}),
    ...(cc ? { cc: Array.isArray(cc) ? cc : [cc] } : {}),
    ...(tags ? { tags: tags.map(t => ({ name: t.name, value: t.value })) } : {}),
  };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(RESEND_URL, {
      method: "POST",
      headers: { "authorization": `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!resp.ok) {
      let detail = "";
      try { detail = await resp.text(); } catch {}
      return { ok: false, provider: "resend", status: resp.status, detail: detail.slice(0, 400) };
    }
    const data = await resp.json();
    return { ok: true, provider: "resend", id: data.id };
  } catch (e) {
    clearTimeout(t);
    return { ok: false, provider: "resend", error: String(e && e.message || e).slice(0, 200) };
  }
}

async function sendViaGmail({ to, subject, html, text, replyTo, from, cc, transporter }) {
  // For Gmail SMTP, the From header must match the authenticated account.
  // We can set a display name only, but the actual address is the Gmail user.
  const fromAddr = process.env.GMAIL_USER;
  const displayName = (process.env.EMAIL_FROM_NAME || "Elion Car Care").replace(/[<>"]/g, "");
  const fromHeader = from || `${displayName} <${fromAddr}>`;

  const message = {
    from: fromHeader,
    to: Array.isArray(to) ? to.join(", ") : to,
    subject,
    ...(html ? { html } : {}),
    ...(text ? { text } : {}),
    ...(replyTo ? { replyTo } : {}),
    ...(cc ? { cc: Array.isArray(cc) ? cc.join(", ") : cc } : {}),
  };

  try {
    const info = await transporter.sendMail(message);
    return { ok: true, provider: "gmail", id: info.messageId };
  } catch (e) {
    return { ok: false, provider: "gmail", error: String(e && e.message || e).slice(0, 300) };
  }
}

// ============================================================
//  Templates — keep simple HTML inline (no template engine).
//  All customer/order data is interpolated via escapeHtml().
// ============================================================
export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

const TIER_LABEL  = { basic: "Basic", essential: "Essential", premium: "Premium" };
const ADDON_LABEL = {
  interior: "Interior detail",
  headlight: "Headlight restoration",
  pethair: "Heavy pet hair removal",
  stain: "Heavy stain treatment",
  leather: "Leather conditioning",
};
const SCOPE_LABEL = { exterior: "Exterior only", interior: "Interior focus", both: "Inside and out" };

function renderSummaryHtml(o) {
  const p = o.pricing || {};
  const addonRows = (p.addons || [])
    .map(a => `<tr><td style="padding:4px 0;">+ ${escapeHtml(ADDON_LABEL[a.id] || a.id)}</td><td style="text-align:right;padding:4px 0;">$${a.price}</td></tr>`)
    .join("");
  return `
    <table style="width:100%;border-collapse:collapse;font-family:Inter,system-ui,sans-serif;font-size:14px;color:#1a1a1a;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #ddd;"><strong>${escapeHtml(TIER_LABEL[o.tier] || o.tier)}</strong></td><td style="text-align:right;padding:8px 0;border-bottom:1px solid #ddd;">$${p.base}</td></tr>
      ${addonRows}
      ${p.travel ? `<tr><td style="padding:4px 0;">+ Travel</td><td style="text-align:right;padding:4px 0;">$${p.travel}</td></tr>` : ""}
      ${p.bundle_discount ? `<tr><td style="padding:4px 0;color:#888;">- Bundle discount</td><td style="text-align:right;padding:4px 0;color:#888;">- $${p.bundle_discount}</td></tr>` : ""}
      ${p.first_time_discount ? `<tr><td style="padding:4px 0;color:#888;">- First-time 25% off</td><td style="text-align:right;padding:4px 0;color:#888;">- $${p.first_time_discount}</td></tr>` : ""}
      <tr><td style="padding:10px 0 4px;border-top:2px solid #1a1a1a;"><strong>Total</strong></td><td style="text-align:right;padding:10px 0 4px;border-top:2px solid #1a1a1a;font-size:18px;"><strong>$${p.total}</strong></td></tr>
    </table>
  `;
}

// ============================================================
//  Customer confirmation email
// ============================================================
export function customerConfirmationEmail(order) {
  const p = order.pricing || {};
  const venmoNote = `Elion Car Care order ${String(order.id).replace(/^ord_/, "")}`;
  const venmoUrl = `https://venmo.com/Elion-CarCare?txn=pay&amount=${p.total}&note=${encodeURIComponent(venmoNote)}`;

  const html = `
    <!doctype html><html><body style="margin:0;padding:32px 16px;background:#f4f1ea;font-family:Inter,system-ui,sans-serif;color:#1a1a1a;">
      <div style="max-width:560px;margin:auto;background:#fff;padding:32px 28px;border-radius:8px;">
        <h1 style="font-family:Fraunces,Georgia,serif;font-size:28px;margin:0 0 8px;color:#0E1014;">Booked. Thanks, ${escapeHtml(order.name)}.</h1>
        <p style="margin:0 0 16px;color:#666;font-size:13px;">Order ${escapeHtml(order.id)}</p>

        <p style="margin:16px 0;">I'll text you at <strong>${escapeHtml(order.phone)}</strong> within an hour to lock in a time. ${order.preferred_timing ? `You mentioned: <em>${escapeHtml(order.preferred_timing)}</em>.` : ""}</p>

        <h2 style="font-family:Fraunces,Georgia,serif;font-size:18px;color:#0E1014;margin:24px 0 8px;">Your order</h2>
        ${renderSummaryHtml(order)}

        <h2 style="font-family:Fraunces,Georgia,serif;font-size:18px;color:#0E1014;margin:24px 0 8px;">Pay after the job</h2>
        <p style="margin:0 0 12px;">When you're happy with how the car looks, send <strong>$${p.total}</strong> to <strong>@Elion-CarCare</strong> on Venmo with the note "${escapeHtml(venmoNote)}".</p>
        <p style="margin:0 0 16px;"><a href="${venmoUrl}" style="display:inline-block;background:#E5A235;color:#0E1014;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600;">Open Venmo (when ready to pay)</a></p>

        <h2 style="font-family:Fraunces,Georgia,serif;font-size:18px;color:#0E1014;margin:24px 0 8px;">Where</h2>
        <p style="margin:0 0 16px;">${escapeHtml(order.address)}${order.car ? `<br/>Car: ${escapeHtml(order.car)}` : ""}</p>

        <p style="margin:24px 0 0;color:#666;font-size:13px;">Questions? Text <a href="tel:+16282520740" style="color:#E5A235;">(628) 252-0740</a>.<br/>— Elion</p>
      </div>
    </body></html>
  `;
  const text = `Booked, thanks ${order.name}!\n\nOrder ${order.id}\n${TIER_LABEL[order.tier]} - $${p.base}\nTotal: $${p.total}\n\nI'll text you at ${order.phone} within an hour to lock in a time.\n\nPay via Venmo @Elion-CarCare after the job: ${venmoUrl}\n\nWhere: ${order.address}\n${order.car ? "Car: " + order.car + "\n" : ""}\nQuestions? Text (628) 252-0740.\n- Elion`;

  return { subject: `Booked: ${TIER_LABEL[order.tier]} - $${p.total} (order ${order.id})`, html, text };
}

// ============================================================
//  Elion notification email
// ============================================================
export function elionNotificationEmail(order) {
  const p = order.pricing || {};
  const phoneHref = String(order.phone || "").replace(/[^\d+]/g, "");
  const mapHref = `https://maps.google.com/?q=${encodeURIComponent(order.address || "")}`;

  const html = `
    <!doctype html><html><body style="margin:0;padding:24px 16px;background:#f4f1ea;font-family:Inter,system-ui,sans-serif;color:#1a1a1a;">
      <div style="max-width:560px;margin:auto;background:#fff;padding:24px;border-radius:8px;">
        <p style="margin:0 0 4px;color:#666;font-size:12px;">NEW ORDER ${escapeHtml(order.id)}</p>
        <h1 style="font-family:Fraunces,Georgia,serif;font-size:24px;margin:0 0 16px;color:#0E1014;">${escapeHtml(order.name)} - <span style="color:#E5A235;">$${p.total}</span></h1>

        ${renderSummaryHtml(order)}

        <h2 style="font-family:Fraunces,Georgia,serif;font-size:16px;color:#0E1014;margin:24px 0 8px;">Contact + location</h2>
        <p style="margin:4px 0;">📞 <a href="tel:${escapeHtml(phoneHref)}" style="color:#E5A235;">${escapeHtml(order.phone)}</a> · <a href="sms:${escapeHtml(phoneHref)}" style="color:#E5A235;">text</a></p>
        <p style="margin:4px 0;">📍 <a href="${escapeHtml(mapHref)}" style="color:#E5A235;">${escapeHtml(order.address)}</a></p>
        ${order.car ? `<p style="margin:4px 0;">🚗 ${escapeHtml(order.car)}</p>` : ""}
        ${order.preferred_timing ? `<p style="margin:4px 0;">🕐 ${escapeHtml(order.preferred_timing)}</p>` : ""}
        ${order.scheduled_for ? `<p style="margin:4px 0;">📅 ${escapeHtml(order.scheduled_for)}</p>` : ""}

        ${order.notes ? `<h2 style="font-family:Fraunces,Georgia,serif;font-size:16px;color:#0E1014;margin:24px 0 8px;">Customer notes</h2><p style="background:#f4f1ea;padding:12px;border-radius:6px;margin:0;font-style:italic;">"${escapeHtml(order.notes)}"</p>` : ""}

        ${order.first_time ? `<p style="margin:16px 0 0;color:#E5A235;">⭐ First-time customer (25% off applied automatically)</p>` : ""}

        <p style="margin:24px 0 0;font-size:13px;color:#666;">Dashboard: <a href="https://elioncarcare.com/admin" style="color:#E5A235;">elioncarcare.com/admin</a></p>
      </div>
    </body></html>
  `;
  const text = `NEW ORDER ${order.id}\n${order.name} - $${p.total}\n\n${TIER_LABEL[order.tier]} (${SCOPE_LABEL[order.scope] || order.scope}) - $${p.base}\n${(p.addons || []).map(a => `+ ${ADDON_LABEL[a.id] || a.id} ($${a.price})`).join("\n")}\nTotal: $${p.total}\n\nContact: ${order.phone} - ${order.address}\n${order.car ? "Car: " + order.car + "\n" : ""}${order.preferred_timing ? "Timing: " + order.preferred_timing + "\n" : ""}${order.notes ? "Notes: " + order.notes + "\n" : ""}${order.first_time ? "* First-time customer\n" : ""}\nDashboard: https://elioncarcare.com/admin`;

  return { subject: `New order: ${order.name} - $${p.total} (${TIER_LABEL[order.tier]})`, html, text };
}
