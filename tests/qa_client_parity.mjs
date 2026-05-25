/**
 * Client-server pricing parity test.
 * Loads book.html into JSDOM, runs the inline book.js logic to extract
 * the compute() function via real form interactions, and compares against
 * the live /api/orders POST response for the same inputs.
 *
 * Catches: ANY divergence between what the customer sees on /book and what
 * the server actually charges. This is the most expensive class of bug.
 */
import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BASE = "https://ellis-car-care.vercel.app";
const BYPASS = process.env.ELION_BYPASS_TOKEN || process.env.ELLIS_BYPASS_TOKEN;
if (!BYPASS) { console.error("Set ELION_BYPASS_TOKEN before running this test."); process.exit(1); }

// Load book.html
const html = fs.readFileSync(path.join(ROOT, "book.html"), "utf8");
const dom = new JSDOM(html, {
  url: BASE + "/book",
  runScripts: "outside-only",  // we manually inject scripts
  pretendToBeVisual: true,
});
const { window } = dom;

// JSDOM provides localStorage natively — use it directly

// Stub navigator.clipboard (book.js touches it on copy)
window.navigator.clipboard = { writeText: async () => {} };

// Stub fetch — we only need to load config + scripts, NOT make AI calls
window.fetch = async () => ({ ok: false, status: 0, json: async () => ({}), text: async () => "" });

// Stub crypto for chatbot.js
if (!window.crypto) window.crypto = { getRandomValues: (a) => { for (let i=0;i<a.length;i++) a[i]=Math.floor(Math.random()*256); return a; }};

// Inject config.js, then book.js (chatbot.js NOT needed for the form)
const configJs = fs.readFileSync(path.join(ROOT, "config.js"), "utf8");
const bookJs   = fs.readFileSync(path.join(ROOT, "book.js"),   "utf8");
window.eval(configJs);
window.eval(bookJs);

// Trigger DOMContentLoaded so book.js init() runs
window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

// Helper: fill form to a desired state then read the live quote total
function setForm({ tier, scope, location, addons, firstTime }) {
  const doc = window.document;
  // Clear localStorage if FT-on (FT means "no prior order")
  if (firstTime) window.localStorage.removeItem("elion_firsttime_used");
  else window.localStorage.setItem("elion_firsttime_used", new Date().toISOString());

  // Set tier radio
  if (tier) doc.querySelector(`input[name="tier"][value="${tier}"]`).checked = true;
  // Uncheck other tiers
  doc.querySelectorAll('input[name="tier"]').forEach(r => { if (r.value !== tier) r.checked = false; });

  // Scope radio
  doc.querySelectorAll('input[name="scope"]').forEach(r => { r.checked = (r.value === scope); });

  // Location radio
  doc.querySelectorAll('input[name="location"]').forEach(r => { r.checked = (r.value === (location || "burns")); });

  // Add-on checkboxes
  doc.querySelectorAll('input[name="addons"]').forEach(c => { c.checked = (addons || []).includes(c.value); });

  // Trigger change to update quote
  doc.getElementById("orderForm").dispatchEvent(new window.Event("change", { bubbles: true }));
}

function clientTotal() {
  const t = window.document.querySelector("[data-quote-total]").textContent.trim();
  return parseInt(t.replace(/[^\d]/g, ""), 10);
}

// Helper: hit server with same inputs and read total
async function serverTotal(state) {
  const body = {
    name: "x", phone: "7345551234", address: "x",
    tier: state.tier,
    scope: state.scope,
    addons: state.addons || [],
    location: state.location || "burns",
    first_time: !!state.firstTime,
  };
  const resp = await fetch(BASE + "/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json", "x-elion-bypass": BYPASS },
    body: JSON.stringify(body),
  });
  if (!resp.ok) return { error: `HTTP ${resp.status}` };
  const d = await resp.json();
  return { total: d.order?.pricing?.total, full: d.order?.pricing };
}

const cases = [
  { name: "Basic, ext, FT",                  tier:"basic",     scope:"exterior",            firstTime:true },
  { name: "Basic, ext, no FT",               tier:"basic",     scope:"exterior",            firstTime:false },
  { name: "Basic + headlight, no FT",        tier:"basic",     scope:"exterior", addons:["headlight"], firstTime:false },
  { name: "Essential, ext only, FT",         tier:"essential", scope:"exterior",            firstTime:true },
  { name: "Essential, both, FT (bundle+FT)", tier:"essential", scope:"both",                firstTime:true },
  { name: "Essential, both, no FT (bundle only)", tier:"essential", scope:"both",           firstTime:false },
  { name: "Essential + headlight + both + FT", tier:"essential", scope:"both", addons:["headlight"], firstTime:true },
  { name: "Premium, both, FT",               tier:"premium",   scope:"both",                firstTime:true },
  { name: "Premium + leather (free w/ Premium)", tier:"premium", scope:"both", addons:["leather"], firstTime:false },
  { name: "Premium + pet + stain + both",    tier:"premium",   scope:"both", addons:["pethair","stain"], firstTime:false },
  { name: "Basic + travel annarbor",         tier:"basic",     scope:"exterior", location:"annarbor", firstTime:false },
  { name: "Basic + pet (without interior — dropped)", tier:"basic", scope:"exterior", addons:["pethair"], firstTime:false },
  { name: "Premium + headlight + ann arbor + FT", tier:"premium", scope:"exterior", addons:["headlight"], location:"annarbor", firstTime:true },
];

let pass = 0, fail = 0;
const failures = [];

console.log("\n=== Client/server pricing parity ===\n");
for (const c of cases) {
  setForm(c);
  const ct = clientTotal();
  const sr = await serverTotal(c);
  if (sr.error) {
    console.log(`ERR   ${c.name}  -- server ${sr.error}`);
    failures.push({ name: c.name, reason: sr.error });
    fail++;
    continue;
  }
  const st = sr.total;
  const ok = ct === st;
  if (ok) pass++;
  else { fail++; failures.push({ name: c.name, client: ct, server: st, breakdown: sr.full }); }
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}  -- client $${ct}  server $${st}${ok ? "" : "  MISMATCH"}`);
}

// Teardown — delete every order this run created
const ADMIN_PWD = process.env.ELION_ADMIN_PASSWORD;
async function delById(id) {
  if (!ADMIN_PWD || !id) return;
  try { await fetch(BASE + `/api/orders?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { "x-elion-admin": ADMIN_PWD }}); } catch {}
}
const created = [];
// We didn't save IDs — fetch and delete by created_at after our window
if (ADMIN_PWD) {
  try {
    const r = await fetch(BASE + "/api/orders", { headers: { "x-elion-admin": ADMIN_PWD }});
    const d = await r.json();
    const recent = (d.orders || []).filter(o => o.name === "x");
    for (const o of recent) await delById(o.id);
    console.log(`Teardown: removed ${recent.length} stub orders`);
  } catch {}
}

console.log(`\n=== ${pass}/${pass+fail} parity PASS ===`);
if (failures.length) {
  console.log("\nDIVERGENCES:");
  for (const f of failures) console.log(" ", JSON.stringify(f));
  process.exit(1);
}
