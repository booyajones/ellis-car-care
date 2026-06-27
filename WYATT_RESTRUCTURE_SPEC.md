# Wyatt Auto Detailing — Service Restructure Spec (2026-06-27)

Restore point already created: git tag/branch `restore-point-20260627-174047` (pushed to origin).

## Context / framing
- Business is now **Wyatt Auto Detailing** (no "Elion" anywhere — already mostly done, verify).
- Location audience: **Bay View / Petoskey, MI** area now (not just Ann Arbor). People here want INTERIOR details too.
- Strategic emphasis: **lead with DETAILING, not "wash."** Most people don't know what "detailing" means. Educate them.

## 1. New tier structure (replaces current Basic/Essential/Premium in config.js `bundles`)

### Basic — $38–50 (quoted on site)
- This is the existing basic EXTERIOR wash PLUS an interior vacuum added in.
- Price range by car size: **small car $38, large car $50** → display as `$38–50`, "quoted on site".
- Includes: the basic exterior wash that already exists + interior vacuum.
- This is a ~$45 job conceptually.

### Essential — $85–110 (small $85, large $110) → display `$85–110`
- This tier is **a wash** — it MUST carry a visible "wash" label/checkbox marker next to it in bullet/tier descriptions on the homepage AND booking page AND anywhere else tiers are listed. (Chris: "got a checkbox with wash next to it on the bullet description on the homepage and any other places on the site ex the booking page.")
- Essential = wash and wax + interior.
- Interior on Essential = **boar's hair brushing on all panels and interior parts of the car; mats and upholstery drill-scrubbed.**
- ~$100 operation.

### Premium — $150–200 (display `$150–200`)
- Includes everything: clay bar, polish, etc. (the existing premium exterior work).
- Interior add for premium: **throw in the Chemical Guys vinyl/rubber/plastic shine + protectant on the surfaces** (the VRP/protectant), on top of the Essential-level interior work.
- ~$150–200 job.

### Price display rules
- Everywhere a price is listed for these tiers, use the RANGE format:
  - Basic: `$38–50` (small $38 / large $50), "quoted on site"
  - Essential: `$85–110`
  - Premium: `$150–200`

## 2. Add-ons
- **Keep all add-ons in the system** (booking + config), but **update their descriptions** to match the new wash/tier descriptions above.
- **Remove "Diablo wheel cleaner" as an ADD-ON.** Re-label it as a **FEATURE** of the service instead (it's part of the offering, not an upsell line item). Do NOT delete the capability — just move it out of the add-on list and present it as an included feature where appropriate.

## 3. "What is a detail?" education page (NEW)
- Add a **noticeable button near the top of the launch/home page** that says **"What is a detail?"**
- It leads to a NEW page that teaches people about detailing:
  - What detailing actually means (vs a wash).
  - What happens if you DON'T get it detailed and let damage build up.
  - A section: **"Signs your car needs to be detailed"** — examples:
    - Paint losing its shine
    - No mirror-like reflection in your paint
    - (add a few more sensible real signs: swirl marks, water spotting, embedded contaminants/rough-feeling paint, faded trim, etc.)
- Match the existing site design system (styles.css, nav, fonts). Wire it into nav like the other pages (about/process/gallery/rewards/services).

## 4. Cal.com (cal.com) updates
- Update the Cal.com config references in `config.js` (`calEventBySlug`, `calDurationLabel`, prices surfaced in booking) AND the CAL_CHANGES_NEEDED.md / BOOKING_CHANGES.md docs to reflect ALL the new specs above:
  - New tier names/contents, new price ranges, the "wash" label on Essential, interior-included structure, Diablo moved from add-on to feature.
- Cal.com itself is admin-managed by Ellis; produce updated step-by-step doc instructions (in the existing CAL doc) telling Ellis exactly what to change in his Cal.com dashboard (event names, descriptions, durations, prices/notes, removing Diablo add-on question, adding the interior-included framing).

## 5. Verify everywhere
After editing config.js, propagate/verify every surface that renders tiers/prices/add-ons:
- index.html (homepage tiers + new "What is a detail?" button)
- services.html / services.js
- book.html / book.js (booking page — Essential "wash" checkbox/label, prices, add-ons)
- about.html, process.html
- chatbot.js / config.js chat recommendation logic (uses tier + price + add-on copy)
- api/_email.js, api/cal-webhook.js, api/chat.js (server-side copies of price/tier/Diablo references — keep in sync)
- llms.txt, sitemap.xml (add new page), schema.org JSON-LD in index.html (update service offerings + prices)
- FAQ entries in config.js that quote old prices ($37/$60/$200) — rewrite to new ranges.

## Done criteria
- New page renders and is linked from a prominent top-of-home button.
- All three tiers show correct contents + price RANGES everywhere.
- Essential carries a visible "wash" marker on home + booking.
- Diablo is a feature, not an add-on; other add-ons retained with updated copy.
- No "$37 / $60 / $200" or stale single-price strings remain for these tiers.
- Commit on a feature branch; do NOT touch the restore-point branch/tag.
