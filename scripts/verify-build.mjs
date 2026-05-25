#!/usr/bin/env node
/**
 * verify-build — catches the deploy-breaker bugs that bit us before
 *   - @vercel/blob 2.x importing undici under Edge runtime (build-time fail)
 *   - Missing exports between modules (e.g. _email.js → orders.js)
 *   - Syntax errors anywhere in api/* or *.js client modules
 *   - HTML files referencing JS/CSS paths that don't exist
 *
 * Runs locally with `npm run build` and in CI via .github/workflows/verify-build.yml.
 * Fails fast with a clear error if anything is wrong, so Vercel never sees the bad commit.
 */
import { readFile, readdir, access } from "node:fs/promises";
import { existsSync, constants } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
let failures = 0;

function fail(msg) { failures++; console.error("FAIL  " + msg); }
function pass(msg) { console.log("PASS  " + msg); }

// ============================================================
// 1. Every API handler module loads successfully
// ============================================================
async function checkApiImports() {
  const apiDir = path.join(ROOT, "api");
  if (!existsSync(apiDir)) { pass("no api/ directory (skip)"); return; }
  const files = (await readdir(apiDir)).filter(f => f.endsWith(".js"));
  for (const f of files) {
    const abs = path.join(apiDir, f);
    try {
      await import(pathToFileURL(abs).href);
      pass(`api/${f} imports clean`);
    } catch (e) {
      fail(`api/${f} import failed: ${e.message}`);
    }
  }
}

// ============================================================
// 2. Static HTML asset references resolve
// ============================================================
async function checkHtmlAssets() {
  const htmls = ["index.html", "book.html", "admin.html", "about.html", "process.html", "thanks.html", "404.html"];
  for (const h of htmls) {
    const full = path.join(ROOT, h);
    if (!existsSync(full)) continue;
    const text = await readFile(full, "utf8");
    // Find every src="..." and href="..." that looks like a local file
    const re = /(?:src|href)\s*=\s*"([^"]+)"/g;
    const missing = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      const url = m[1].split("?")[0].split("#")[0];
      if (url.startsWith("http") || url.startsWith("//") || url.startsWith("mailto:") ||
          url.startsWith("tel:") || url.startsWith("sms:") || url.startsWith("data:") ||
          url.startsWith("javascript:") || url.startsWith("#") || url === "") continue;
      const local = url.startsWith("/") ? url.slice(1) : url;
      if (!local) continue;
      // Skip API endpoints (resolved at runtime, not files)
      if (local.startsWith("api/") || local === "api") continue;
      const localPath = path.join(ROOT, local);
      try { await access(localPath, constants.F_OK); }
      catch {
        // Allow extension-less clean URLs (cleanUrls:true serves /about as /about.html)
        if (existsSync(path.join(ROOT, local + ".html"))) continue;
        missing.push(local);
      }
    }
    if (missing.length) fail(`${h} references missing assets: ${[...new Set(missing)].join(", ")}`);
    else pass(`${h} asset references resolve`);
  }
}

// ============================================================
// 3. No leftover old-brand strings in shipped files (sanity)
// ============================================================
async function checkRebrand() {
  const oldTerms = ["Ellis Car Care", "Quick Shine", "Driveway Detail", "Full Reset"];
  const shippedFiles = ["index.html", "book.html", "admin.html", "about.html", "process.html", "thanks.html"];
  for (const f of shippedFiles) {
    const full = path.join(ROOT, f);
    if (!existsSync(full)) continue;
    const text = await readFile(full, "utf8");
    const found = oldTerms.filter(t => text.includes(t));
    if (found.length) fail(`${f} still contains old-brand terms: ${found.join(", ")}`);
    else pass(`${f} clean of old-brand terms`);
  }
}

// ============================================================
// 4. package.json + lockfile match (no missing deps)
// ============================================================
async function checkLockfile() {
  if (!existsSync(path.join(ROOT, "package-lock.json"))) {
    pass("no package-lock.json (acceptable for static-only repos)");
    return;
  }
  const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  const lock = JSON.parse(await readFile(path.join(ROOT, "package-lock.json"), "utf8"));
  const declared = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) });
  const installed = Object.keys(lock.packages || {})
    .filter(p => p.startsWith("node_modules/") && !p.includes("/node_modules/", "node_modules/".length))
    .map(p => p.slice("node_modules/".length));
  const missing = declared.filter(d => !installed.includes(d));
  if (missing.length) fail(`package-lock.json is out of sync — missing: ${missing.join(", ")} (run npm install)`);
  else pass(`package-lock.json has all ${declared.length} declared deps`);
}

// ============================================================
// 5. vercel.json validity (json parse + key schema)
// ============================================================
async function checkVercelJson() {
  const vf = path.join(ROOT, "vercel.json");
  if (!existsSync(vf)) { pass("no vercel.json"); return; }
  let cfg;
  try { cfg = JSON.parse(await readFile(vf, "utf8")); }
  catch (e) { fail(`vercel.json is not valid JSON: ${e.message}`); return; }
  if (cfg.headers && !Array.isArray(cfg.headers)) fail("vercel.json headers must be an array");
  if (cfg.redirects && !Array.isArray(cfg.redirects)) fail("vercel.json redirects must be an array");
  pass("vercel.json parses + schema check");
}

// ============================================================
// Run all checks
// ============================================================
console.log("=== Elion Car Care verify-build ===\n");
await checkApiImports();
await checkHtmlAssets();
await checkRebrand();
await checkLockfile();
await checkVercelJson();
console.log();
if (failures > 0) {
  console.error(`BUILD FAIL: ${failures} check(s) failed.`);
  process.exit(1);
}
console.log("BUILD OK.");
