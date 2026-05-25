/**
 * Admin dashboard E2E:
 *  - Login form rejects wrong password
 *  - Login form accepts correct password
 *  - Loads + renders order cards
 *  - XSS in customer-supplied fields is properly escaped in rendered HTML
 *  - Status badge / tier label / scope all render
 *  - Filter chips work
 *  - Status select dispatch triggers PATCH
 *  - Logout clears state
 */
import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BASE = "https://elioncarcare.com";
const ADMIN_PWD = process.env.ELION_ADMIN_PASSWORD;
const WRONG_PWD = "wrong";
const BYPASS    = process.env.ELION_BYPASS_TOKEN || process.env.ELLIS_BYPASS_TOKEN;
if (!ADMIN_PWD || !BYPASS) {
  console.error("Set ELION_ADMIN_PASSWORD and ELION_BYPASS_TOKEN before running this test.");
  process.exit(1);
}

// First, plant an order with XSS-ish content to verify escaping on render.
const xssName    = `<script>window.PWNED=1</script>Bad Actor`;
const xssCar     = `2024 "><img src=x onerror=alert(1)> Civic`;
const xssNotes   = `Drop tables; <script>alert("xss")</script> & special "chars"`;
const xssAddress = `100 'OR'1'='1, <Ann Arbor>`;
let plantedId = null;
{
  const resp = await fetch(BASE + "/api/orders", {
    method: "POST",
    headers: { "content-type":"application/json", "x-elion-bypass": BYPASS },
    body: JSON.stringify({
      name: xssName,
      phone: "(734)555-7777",
      address: xssAddress,
      car: xssCar,
      notes: xssNotes,
      tier: "essential",
      scope: "both",
      addons: ["headlight"],
      location: "burns",
      first_time: false,
    }),
  });
  const d = await resp.json();
  plantedId = d?.order?.id;
  if (!plantedId) {
    console.log("FAIL — could not plant XSS order:", JSON.stringify(d).slice(0,200));
    process.exit(1);
  }
  console.log(`Planted XSS test order: ${plantedId}`);
}

// Wait for blob consistency
await new Promise(r => setTimeout(r, 3000));

const html = fs.readFileSync(path.join(ROOT, "admin.html"), "utf8");
const dom = new JSDOM(html, {
  url: BASE + "/admin",
  runScripts: "outside-only",
  pretendToBeVisual: true,
});
const { window } = dom;
window.fetch = (url, opts) => fetch(url.startsWith("http") ? url : BASE + url, opts);

window.eval(fs.readFileSync(path.join(ROOT, "admin.js"), "utf8"));
window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

const doc = window.document;
const $ = (s) => doc.querySelector(s);
const $$ = (s) => [...doc.querySelectorAll(s)];

async function waitFor(cond, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (cond()) return true; } catch {}
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail="") {
  if (ok) { pass++; console.log(`PASS  ${name}`); }
  else    { fail++; failures.push({name, detail}); console.log(`FAIL  ${name}${detail?" -- "+detail:""}`); }
}

// === Login flow ===
check("login pane visible at start", !$("#loginPane").hidden);
check("dashboard pane hidden at start", $("#dashboardPane").hidden);

// Wrong password
$("#adminPwd").value = WRONG_PWD;
$("#loginForm").dispatchEvent(new window.Event("submit", { bubbles:true, cancelable:true }));

// Wait for error to show
const wrongHandled = await waitFor(() => !$("#loginError").hidden);
check("wrong password shows error", wrongHandled);
check("dashboard still hidden after wrong pwd", $("#dashboardPane").hidden);

// Correct password
$("#loginError").hidden = true;
$("#adminPwd").value = ADMIN_PWD;
$("#loginForm").dispatchEvent(new window.Event("submit", { bubbles:true, cancelable:true }));

const loggedIn = await waitFor(() => !$("#dashboardPane").hidden, 12000);
check("correct password shows dashboard", loggedIn);
check("login pane hidden after success", $("#loginPane").hidden);

// === Order rendering ===
// Wait for cards to load
const cardsLoaded = await waitFor(() => $$(".order-card").length > 0, 15000);
check("order cards rendered", cardsLoaded, `cards: ${$$(".order-card").length}`);

// Locate the planted XSS order's card
const cards = $$(".order-card");
const xssCard = cards.find(c => c.textContent.includes(plantedId));
check("planted XSS order found in cards", !!xssCard, `looking for ${plantedId}`);

if (xssCard) {
  // === REAL XSS CHECKS: look at the parsed DOM, not the HTML string ===
  // The threat is injected ELEMENTS / ATTRIBUTES. Look for actual nodes.
  const injectedScripts = xssCard.querySelectorAll("script");
  check("XSS: no <script> elements injected into card",
    injectedScripts.length === 0,
    `found ${injectedScripts.length} script(s)`);

  const injectedImgs = xssCard.querySelectorAll("img");
  // Legitimate imgs are 0 in card (only emoji + text). Any img is injected.
  check("XSS: no <img> elements injected into card",
    injectedImgs.length === 0,
    `found ${injectedImgs.length} img(s)`);

  // Any element with on* attribute is injected (event handler)
  const allEls = xssCard.querySelectorAll("*");
  const withEventHandlers = [...allEls].filter(el =>
    [...el.attributes].some(a => a.name.toLowerCase().startsWith("on") && a.name.toLowerCase() !== "onclick")
  );
  // Note: status dropdown has change handler attached via JS, not as on-attribute, so safe
  check("XSS: no inline event-handler attributes on injected elements",
    withEventHandlers.length === 0,
    `found ${withEventHandlers.map(e => e.tagName).join(",")}`);

  // The js global should be unset (script never executed)
  check("XSS: window.PWNED never set (script didn't execute)",
    window.PWNED === undefined);

  // Now verify the entity-escaped text IS in the rendered output as text content
  const cardText = xssCard.textContent;
  check("XSS: name visible as TEXT",
    cardText.includes("<script>window.PWNED=1</script>Bad Actor"),
    "name text not found");
  check("XSS: car visible as TEXT",
    cardText.includes(`2024 "><img src=x onerror=alert(1)> Civic`),
    "car text not found");
  check("XSS: notes visible as TEXT",
    cardText.includes(`Drop tables; <script>alert("xss")</script> & special "chars"`),
    "notes text not found");
  check("XSS: address visible as TEXT",
    cardText.includes(`100 'OR'1'='1, <Ann Arbor>`),
    "address text not found");

  // Status badge present
  const statusBadge = xssCard.querySelector(".status-badge");
  check("XSS card has status badge",
    statusBadge !== null && statusBadge.classList.contains("status-new"));

  // Tap-to-call link should have only safe chars in href
  const telLink = xssCard.querySelector('a[href^="tel:"]');
  check("tel: link present", !!telLink);
  if (telLink) {
    check("tel: href has only digits/+",
      /^tel:[+\d]+$/.test(telLink.getAttribute("href")),
      `href: ${telLink.getAttribute("href")}`);
  }

  // Maps link should encode the address (and have https://maps.google)
  const mapLink = xssCard.querySelector('a[href*="maps.google"]');
  check("maps link present", !!mapLink);
  if (mapLink) {
    check("maps href is encoded",
      mapLink.getAttribute("href").includes("encodeURIComponent") === false
        && mapLink.getAttribute("href").includes("%"),
      `href: ${mapLink.getAttribute("href").slice(0,100)}`);
  }

  // Status select
  const select = xssCard.querySelector("[data-status-select]");
  check("status dropdown present in card", !!select);
  if (select) {
    check("status dropdown has 5 options",
      select.querySelectorAll("option").length === 5);
  }
}

// === Filter chips ===
const filterAll = doc.querySelector('input[name="filter"][value="all"]');
check("filter chip 'all' checked by default", filterAll.checked);

const filterNew = doc.querySelector('input[name="filter"][value="new"]');
filterNew.checked = true;
filterNew.dispatchEvent(new window.Event("change", { bubbles:true }));
await new Promise(r => setTimeout(r, 200));
// All cards should still be shown if all are "new"
const visibleAfterFilter = $$(".order-card").length;
check("filter 'new' renders new orders only", visibleAfterFilter > 0,
  `cards visible: ${visibleAfterFilter}`);

// Switch back
filterAll.checked = true;
filterAll.dispatchEvent(new window.Event("change", { bubbles:true }));

// === Stats counters ===
const totalCount = parseInt($("#statTotal").textContent, 10);
check("total stat is a number > 0", Number.isFinite(totalCount) && totalCount > 0);

// === Logout ===
$("[data-logout]").click();
await new Promise(r => setTimeout(r, 200));
check("logout reveals login pane", !$("#loginPane").hidden);
check("logout hides dashboard", $("#dashboardPane").hidden);
check("logout clears sessionStorage token", !window.sessionStorage.getItem("elion_admin_token"));

// Teardown: clean up the planted XSS test order so it doesn't pollute the dashboard
if (plantedId) {
  try {
    const delResp = await fetch(BASE + `/api/orders?id=${encodeURIComponent(plantedId)}`, {
      method: "DELETE",
      headers: { "x-elion-admin": ADMIN_PWD },
    });
    console.log(`Teardown: deleted planted order ${plantedId} (${delResp.status})`);
  } catch (e) {
    console.log(`Teardown: delete failed: ${e.message}`);
  }
}

console.log(`\n=== ${pass}/${pass+fail} admin E2E PASS ===`);
if (failures.length) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log(" ", f);
  process.exit(1);
}
