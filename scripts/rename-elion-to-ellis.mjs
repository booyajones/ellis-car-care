#!/usr/bin/env node
/*
  rename-elion-to-ellis.mjs

  Fixes a copy bug. "Ellis" is the person; "Elion" is the brand.
  We were treating Elion as if it were the person's name.

  Strategy: targeted string replacement. We only rewrite contexts that are
  unambiguously about the person. We never touch:
    - the literal "Elion Car Care" brand string
    - the Venmo handle "@Elion-CarCare" / "Elion-CarCare"
    - the brand-name span (<span class="brand-name">Elion</span>)
    - environment variable names (ELION_*) or class names with Elion in them
    - URLs, filenames, brand-name in JSON-LD / meta tags

  We run this once, inspect the diff, then commit.
*/
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.argv[2] || ".";

// Files to scan. Skip node_modules, .git, .planning, archive, etc.
const SCAN_EXT = new Set([".html", ".js", ".mjs", ".css", ".md"]);
const SKIP_DIR = new Set(["node_modules", ".git", ".vercel", ".planning", "archive", "audits"]);

// Targeted replacements. Each entry is [pattern, replacement, label].
// Patterns are global, multi-line, applied in order.
// We bias toward exact phrases the person-name appears in to avoid eating the brand.
const REPLACEMENTS = [
  // Direct person addressing
  [/Text Ellis\b/g,                "Text Ellis",                "Text Ellis -> Text Ellis"],
  [/text Ellis\b(?! Car Care)/g,   "text Ellis",                "text Ellis -> text Ellis (lowercase)"],
  [/Hi Ellis,/g,                   "Hi Ellis,",                 "Hi Ellis -> Hi Ellis (greeting)"],
  [/Hi Ellis!/g,                   "Hi Ellis!",                 "Hi Ellis! -> Hi Ellis!"],
  [/Pay Ellis\b/g,                 "Pay Ellis",                 "Pay Ellis -> Pay Ellis"],
  [/ask Ellis\b/g,                 "ask Ellis",                 "ask Ellis -> ask Ellis"],
  [/call or text Ellis\b/g,        "call or text Ellis",        "call or text Ellis -> call or text Ellis"],

  // Subject verbs (Elion does X)
  [/Ellis will\b/g,                "Ellis will",                "Ellis will -> Ellis will"],
  [/Ellis sees\b/g,                "Ellis sees",                "Ellis sees -> Ellis sees"],
  [/Ellis can(?! Care)/g,          "Ellis can",                 "Ellis can -> Ellis can"],
  [/Ellis confirms\b/g,            "Ellis confirms",            "Ellis confirms -> Ellis confirms"],
  [/Ellis doesn't\b/g,             "Ellis doesn't",             "Ellis doesn't -> Ellis doesn't"],
  [/Ellis only sees\b/g,           "Ellis only sees",           "Ellis only sees -> Ellis only sees"],
  [/Ellis would talk\b/g,          "Ellis would talk",          "Ellis would talk -> Ellis would talk"],
  [/Ellis is an 18-year-old\b/g,   "Ellis is an 18-year-old",   "Ellis is an 18-year-old -> Ellis is an 18-year-old"],

  // Object phrases (to/for/with the person)
  [/to Ellis(?! Car Care)\b/g,     "to Ellis",                  "to Ellis -> to Ellis"],
  [/for Ellis(?! Car Care)\b/g,    "for Ellis",                 "for Ellis -> for Ellis"],
  [/Anything Ellis\b/g,            "Anything Ellis",            "Anything Ellis -> Anything Ellis"],
  [/So Ellis\b/g,                  "So Ellis",                  "So Ellis -> So Ellis"],
  [/Whenever Ellis\b/g,            "Whenever Ellis",            "Whenever Ellis -> Whenever Ellis"],
  [/whenever Ellis\b/g,            "whenever Ellis",            "whenever Ellis -> whenever Ellis"],
  [/Built by Ellis\b/g,            "Built by Ellis",            "Built by Ellis -> Built by Ellis"],
  [/by Ellis(?! Car Care)/g,       "by Ellis",                  "by Ellis -> by Ellis"],

  // Possessive
  [/Ellis's\b(?! wash)/g,          "Ellis's",                   "Ellis's -> Ellis's (skip 'wash-planning' for separate handle)"],
  [/Ellis's wash-planning\b/g,     "Ellis's wash-planning",     "Ellis's wash-planning -> Ellis's wash-planning"],

  // Captions/identity (the literal photo caption "Elion · Owner")
  [/>Ellis · Owner</g,             ">Ellis · Owner<",           "Elion · Owner -> Ellis · Owner"],
  [/"Ellis, founder of/g,          '"Ellis, founder of',        "alt='Elion, founder...' -> 'Ellis, founder...'"],
  [/alt="Ellis,/g,                 'alt="Ellis,',               "alt=\"Elion, -> alt=\"Ellis,"],

  // Introductions
  [/I'm Ellis\b/g,                 "I'm Ellis",                 "I'm Ellis -> I'm Ellis"],
  [/I am Ellis\b/g,                "I am Ellis",                "I am Ellis -> I am Ellis"],
  [/Hey! I'm Ellis's\b/g,          "Hey! I'm Ellis's",          "Hey! I'm Ellis's -> Hey! I'm Ellis's"],

  // Section headline
  [/Elion\. Burns Park kid/g,      "Ellis. Burns Park kid",     "Ellis. Burns Park kid -> Ellis. Burns Park kid"],

  // SMS prefilled body openers (Hi Ellis)
  [/Hi Ellis\b/g,                  "Hi Ellis",                  "Hi Ellis (fallback for any 'Hi Ellis' missed above)"],

  // Misc residual phrases
  [/Ellis's call\b/g,              "Ellis's call",              "Ellis's call -> Ellis's call"],
];

let totalEdits = 0;
const fileHits = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIR.has(entry)) continue;
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walk(full);
    else if ([...SCAN_EXT].some((ext) => entry.endsWith(ext))) processFile(full);
  }
}

function processFile(path) {
  let text = readFileSync(path, "utf8");
  const original = text;
  const perFileHits = [];

  for (const [pattern, replacement, label] of REPLACEMENTS) {
    let count = 0;
    text = text.replace(pattern, () => { count++; return replacement; });
    if (count > 0) perFileHits.push(`  ${count}x  ${label}`);
  }

  if (text !== original) {
    writeFileSync(path, text, "utf8");
    fileHits.push({ path, hits: perFileHits });
    totalEdits += perFileHits.reduce((a, h) => a + parseInt(h.trim().split("x")[0], 10), 0);
  }
}

walk(ROOT);

console.log("\nEDITS:\n");
for (const { path, hits } of fileHits) {
  console.log(path);
  for (const h of hits) console.log(h);
  console.log("");
}
console.log(`Total replacements: ${totalEdits} across ${fileHits.length} files`);
