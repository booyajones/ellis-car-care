/* ============================================================
   uat_live.mjs — live UAT / regression smoke against production.
   Network test (hits https://elioncarcare.com). Run manually:
     node scripts/uat_live.mjs
   Covers: page availability + indexability, SEO/AEO artifacts,
   JSON-LD validity + honesty, fact consistency, and the loyalty/
   webhook endpoints. Not a CI unit test (it needs the network).
   ============================================================ */
const BASE = "https://elioncarcare.com";
let pass = 0, fail = 0;
const fails = [];
function ok(name) { pass++; console.log("PASS " + name); }
function bad(name, detail) { fail++; fails.push(name + (detail ? " :: " + detail : "")); console.log("FAIL " + name + (detail ? " :: " + detail : "")); }
function assert(cond, name, detail) { cond ? ok(name) : bad(name, detail); }

async function get(path, opts) {
  const res = await fetch(BASE + path, opts);
  const body = await res.text();
  return { status: res.status, headers: res.headers, body };
}
function ldBlocks(html) {
  const out = []; const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g; let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}
function flatten(o, acc = []) { acc.push(o); if (o && typeof o === "object") for (const k of Object.keys(o)) { const v = o[k]; if (Array.isArray(v)) v.forEach(x => flatten(x, acc)); else if (v && typeof v === "object") flatten(v, acc); } return acc; }

const run = async () => {
  // A. Availability + indexability
  for (const [p, idx] of [["/", true], ["/services", true], ["/process", true], ["/about", true], ["/gallery", true], ["/book", false], ["/rewards", false]]) {
    const r = await get(p + "?cb=" + Date.now());
    assert(r.status === 200, "200 " + p, "got " + r.status);
    const noindex = /<meta name="robots" content="[^"]*noindex/i.test(r.body);
    assert(idx ? !noindex : noindex, (idx ? "indexable " : "noindex ") + p, "noindex=" + noindex);
    assert(new RegExp('rel="canonical" href="' + BASE + (p === "/" ? "/" : p) + '"').test(r.body), "canonical " + p);
  }
  // 404 behavior
  const nf = await get("/this-page-does-not-exist-" + Date.now());
  assert(nf.status === 404, "404 on bogus route", "got " + nf.status);

  // B. SEO/AEO artifacts
  const llms = await get("/llms.txt");
  assert(llms.status === 200, "llms.txt 200");
  assert(/text\/plain/i.test(llms.headers.get("content-type") || ""), "llms.txt text/plain", llms.headers.get("content-type"));
  for (const s of ["Elion Car Care", "$40", "$60", "from $200", "48104", "@Ellis-Wyatt-2", "(628) 252-0740", "no customer reviews yet", "$40 on Basic, or $35 with Essential or Premium"])
    assert(llms.body.includes(s), "llms.txt has: " + s);

  const sm = await get("/sitemap.xml");
  assert(sm.status === 200 && sm.body.includes("/services"), "sitemap includes /services");
  assert(!sm.body.includes("/book"), "sitemap excludes /book");
  assert((sm.body.match(/<lastmod>/g) || []).length === 5, "sitemap 5 lastmod entries");

  const rb = await get("/robots.txt");
  assert(/Disallow: \/admin/.test(rb.body) && !/Disallow: \/book/.test(rb.body), "robots blocks admin not book");
  assert(/Sitemap: https:\/\/elioncarcare\.com\/sitemap\.xml/.test(rb.body), "robots has sitemap line");

  // C. Per-page title + OG + JSON-LD validity
  const home = await get("/?cb=" + Date.now());
  assert(/<title>Mobile Car Detailing in Ann Arbor/.test(home.body), "home geo title");
  assert(/property="og:title"/.test(home.body) && /property="og:description"/.test(home.body), "home OG tags");
  const svc = await get("/services?cb=" + Date.now());
  assert(/<title>Car Detailing Packages &amp; Prices in Ann Arbor/.test(svc.body), "services geo title");
  assert(/property="og:title"/.test(svc.body), "services OG tags");
  for (const [p, name] of [["/", "home"], ["/services", "services"], ["/process", "process"], ["/about", "about"], ["/gallery", "gallery"]]) {
    const r = (p === "/" ? home : (p === "/services" ? svc : await get(p + "?cb=" + Date.now())));
    const blocks = ldBlocks(r.body);
    assert(blocks.length >= 1, "JSON-LD present " + name, "blocks=" + blocks.length);
    let allParse = true; const nodes = [];
    for (const b of blocks) { try { const o = JSON.parse(b); flatten(o, nodes); } catch (e) { allParse = false; bad("JSON-LD parses " + name, e.message); } }
    if (allParse) ok("JSON-LD parses " + name);
    const types = nodes.map(n => n && n["@type"]).flat().filter(Boolean);
    assert(!types.includes("PostalCode"), "no invalid PostalCode type " + name);
    assert(!nodes.some(n => n && (n.aggregateRating || n.review || n["@type"] === "Review")), "no fake reviews " + name);
  }
  // home schema specifics
  const homeNodes = ldBlocks(home.body).flatMap(b => { try { return flatten(JSON.parse(b)); } catch { return []; } });
  const homeTypes = homeNodes.map(n => n && n["@type"]).flat().filter(Boolean);
  assert(homeTypes.includes("LocalBusiness") || homeTypes.includes("AutoDetailing"), "home LocalBusiness/AutoDetailing");
  assert(homeTypes.includes("FAQPage"), "home FAQPage");
  assert(homeTypes.includes("WebSite") && homeTypes.includes("Organization"), "home WebSite + Organization");
  assert(homeNodes.some(n => n && n["@type"] === "OfferCatalog"), "home OfferCatalog");
  assert(!home.body.includes("openingHoursSpecification"), "home no fabricated hours");
  // prices in raw HTML (AI crawler gate)
  for (const pr of ["$40", "$60", "from $200"]) assert(home.body.includes(pr), "home raw-HTML price " + pr);
  for (const pr of ["$40", "$60", "from $200"]) assert(svc.body.includes(pr), "services raw-HTML price " + pr);
  // services Service nodes
  const svcNodes = ldBlocks(svc.body).flatMap(b => { try { return flatten(JSON.parse(b)); } catch { return []; } });
  assert(svcNodes.filter(n => n && n["@type"] === "Service").length === 3, "services has 3 Service nodes");
  assert(svcNodes.some(n => n && n["@type"] === "FAQPage"), "services FAQPage");
  assert(svcNodes.some(n => n && n["@type"] === "BreadcrumbList"), "services BreadcrumbList");

  // D. Fact consistency
  assert(home.body.includes("(628) 252-0740"), "home phone NAP");
  assert(home.body.includes("48104") && home.body.includes("48103") && home.body.includes("48105"), "home ZIPs");
  // interior tiered string never a flat-only price in llms
  assert(!/Interior[^\n]*\$35\./.test(llms.body) || /\$40 on Basic, or \$35/.test(llms.body), "llms interior tiered (no flat $35)");

  // E. Endpoints
  const loy = await get("/api/loyalty?email=nobody-" + Date.now() + "@example.com");
  let loyJson = {}; try { loyJson = JSON.parse(loy.body); } catch {}
  assert(loy.status === 200 && loyJson.completedJobs === 0 && loyJson.returning === false, "loyalty unknown email = zeroed (no oracle)", loy.body.slice(0, 80));
  const wh = await get("/api/cal-webhook", { method: "POST", headers: { "content-type": "application/json", "x-cal-signature-256": "deadbeef" }, body: "{}" });
  assert(wh.status === 401, "webhook bad signature 401", "got " + wh.status);
  const whNo = await get("/api/cal-webhook", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert(whNo.status === 401 || whNo.status === 500, "webhook missing signature rejected", "got " + whNo.status);

  console.log("\n================ UAT SUMMARY ================");
  console.log(pass + " passed, " + fail + " failed");
  if (fail) { console.log("\nFAILURES:"); fails.forEach(f => console.log("  - " + f)); process.exit(1); }
  else console.log("ALL GREEN");
};
run().catch(e => { console.error("UAT crashed:", e); process.exit(2); });
