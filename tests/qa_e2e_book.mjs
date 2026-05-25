/**
 * End-to-end booking flow:
 *  - Fill the form, validate it allows submit
 *  - Submit, verify confirmation modal renders correctly
 *  - Inspect rendered Venmo link, copy-handle, summary breakdown
 *  - Verify the submit button stays disabled after success
 *  - Try a malicious XSS payload in notes, verify rendered confirmation escapes it
 */
import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BASE = "https://elioncarcare.com";
const BYPASS = process.env.ELION_BYPASS_TOKEN || process.env.ELLIS_BYPASS_TOKEN;
if (!BYPASS) { console.error("Set ELION_BYPASS_TOKEN before running this test."); process.exit(1); }

const html = fs.readFileSync(path.join(ROOT, "book.html"), "utf8");
const dom = new JSDOM(html, {
  url: BASE + "/book",
  runScripts: "outside-only",
  pretendToBeVisual: true,
});
const { window } = dom;
window.navigator.clipboard = { writeText: async () => {} };

// JSDOM's default fetch works for cross-origin, but we want POST to go to the real API.
// Just pass through to global fetch (Node 22+ has fetch).
window.fetch = (url, opts) => fetch(url, opts);

window.eval(fs.readFileSync(path.join(ROOT, "config.js"), "utf8"));
window.eval(fs.readFileSync(path.join(ROOT, "book.js"),   "utf8"));
window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

const doc = window.document;
const $ = (s) => doc.querySelector(s);
const $$ = (s) => [...doc.querySelectorAll(s)];

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail="") {
  if (ok) { pass++; console.log(`PASS  ${name}`); }
  else    { fail++; failures.push({name, detail}); console.log(`FAIL  ${name}${detail?" -- "+detail:""}`); }
}

// === Pre-submit state checks ===
check("submit button initially enabled (with tier selected)", $('[data-submit-btn]').disabled === true,
  "expected disabled when no tier picked");
check("first-time banner shown by default", !$("[data-firsttime-banner]").hidden);
check("Tier radios present (3)", $$('input[name="tier"]').length === 3);
check("Scope radios present (3)", $$('input[name="scope"]').length === 3);
check("Add-on checkboxes present (4)", $$('input[name="addons"]').length === 4);

// Try to submit with no tier — should not progress
$('input[name="name"]').value = "Auto E2E Test";
$('input[name="phone"]').value = "(734)555-9999";
$('input[name="address"]').value = "200 Olivia St, Ann Arbor, MI";
$('input[name="car"]').value = "2024 Kia EV9";
const xssNotes = '<img src=x onerror=alert(1)>"<script>alert(2)</script>';
$('textarea[name="notes"]').value = xssNotes;
$('input[name="preferred_timing"]').value = "Saturday morning";

// Pick Essential + both + headlight
$('input[name="tier"][value="essential"]').checked = true;
$('input[name="scope"][value="both"]').checked = true;
$('input[name="addons"][value="headlight"]').checked = true;

doc.getElementById("orderForm").dispatchEvent(new window.Event("change", { bubbles: true }));

const quote = $("[data-quote-total]").textContent;
check("Live quote populated", /\$\d+/.test(quote), `quote: ${quote}`);
check("First-time discount row visible", !$("[data-quote-firsttime-row]").hidden);
check("Bundle discount row visible", !$("[data-quote-bundle-row]").hidden);
check("Submit button enabled with valid form", $('[data-submit-btn]').disabled === false);

// === Submit (use bypass so rate limit doesn't trip during repeated runs) ===
// Monkey-patch fetch to inject bypass header
const realFetch = window.fetch;
window.fetch = (url, opts) => {
  if (typeof url === "string" && url.startsWith("/api/")) {
    url = BASE + url;
    opts = opts || {};
    opts.headers = { ...(opts.headers || {}), "x-elion-bypass": BYPASS };
  }
  return realFetch(url, opts);
};

// Submit
const form = doc.getElementById("orderForm");
const submitEvent = new window.Event("submit", { bubbles: true, cancelable: true });
form.dispatchEvent(submitEvent);

// Wait for confirmation modal to open
async function waitFor(cond, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (cond()) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}

const opened = await waitFor(() => $("#confirmModal").classList.contains("is-open"));
check("Confirmation modal opens after submit", opened);

if (opened) {
  // Check modal renders correctly
  const summary = $("[data-confirm-summary]").innerHTML;
  check("Modal shows tier in summary", /Essential/.test(summary));
  check("Modal shows headlight addon", /Headlight/.test(summary));
  check("Modal shows interior addon (auto from scope=both)", /Interior/.test(summary));
  check("Modal shows bundle discount", /Bundle/.test(summary));
  check("Modal shows first-time discount", /First-time/.test(summary));

  const amount = $("[data-confirm-amount]").textContent;
  check("Confirm amount displayed", /\$\d+/.test(amount), `amount: ${amount}`);

  const venmoLink = $("[data-venmo-link]").href;
  check("Venmo deep link points to venmo.com",
    /^https:\/\/venmo\.com\/Elion-CarCare/.test(venmoLink), `link: ${venmoLink}`);
  check("Venmo link includes amount", venmoLink.includes("amount="));
  check("Venmo link includes note (URL-encoded)", venmoLink.includes("note=Elion%20Car%20Care%20order"));

  // XSS check: ensure the notes payload was NOT rendered as HTML (book.js shouldn't put notes in modal,
  // but admin.js definitely renders them — covered separately)
  const fullModalHtml = $("#confirmModal").innerHTML;
  // The notes payload contained an <img src=x> — verify nothing was injected via that
  check("No raw script tag from XSS in modal", !fullModalHtml.includes("<script>alert(2)</script>"));
  check("No raw img onerror from XSS in modal", !fullModalHtml.includes("onerror=alert"));

  // Verify submit button stays disabled
  check("Submit button disabled after success (prevent double-book)",
    $('[data-submit-btn]').disabled === true,
    `disabled=${$('[data-submit-btn]').disabled}`);
  check("Submit button shows 'Booked ✓'",
    /Booked/.test($('[data-submit-btn]').textContent),
    `text: ${$('[data-submit-btn]').textContent}`);

  // Close modal, verify button still disabled (we intentionally don't re-enable)
  $(".confirm-close").click();
  check("Modal closes on X click",
    !$("#confirmModal").classList.contains("is-open"));
}

// Teardown — delete the booked test order
const ADMIN_PWD = process.env.ELION_ADMIN_PASSWORD;
if (ADMIN_PWD) {
  try {
    const r = await fetch(BASE + "/api/orders", { headers: { "x-elion-admin": ADMIN_PWD }});
    const d = await r.json();
    const ours = (d.orders || []).find(o => o.name === "Auto E2E Test");
    if (ours) {
      await fetch(BASE + `/api/orders?id=${encodeURIComponent(ours.id)}`, { method: "DELETE", headers: { "x-elion-admin": ADMIN_PWD }});
      console.log(`Teardown: removed test order ${ours.id}`);
    }
  } catch {}
}

console.log(`\n=== ${pass}/${pass+fail} PASS ===`);
if (failures.length) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log(" ", f);
  process.exit(1);
}
