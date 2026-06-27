# Booking Changes — Wyatt Restructure 2026-06-27

## What changed in code (this commit)

### `config.js` — new tier model
- **Basic:** $38–50 (small car $38 / large car $50). Includes interior vacuum.
- **Essential:** $85–110 (small $85 / large $110). Includes full interior detail (boar's hair brushing, drill-scrubbed mats). Carries a visible "wash" marker on all tier listings.
- **Premium:** $150–200 (quoted). Includes Essential-level interior plus Chemical Guys VRP on all vinyl, rubber, and plastic.
- Diablo wheel cleaner: removed from add-ons entirely. Now listed as an included FEATURE in the Premium bundle and called out in the process copy.
- Interior: removed as an add-on. Interior work is included in every tier.
- Old add-ons removed: Diablo (+$10), Interior (flat price).
- Remaining add-ons: Steam clean, Deep clean, Clay bar, Trim/plastic shine, Ceramic wheel coat, Headlight restoration.
- Headlight restoration price: updated from $30 to $35.
- `calDurationLabel` updated to reflect new times.

### `book.html` — booking page tier buttons
- Prices updated to ranges ($38–50, $85–110, $150–200).
- Essential button shows a "wash" badge.
- Descriptions updated.

### `index.html` — home page
- "What is a detail?" button added near the top of the hero, linking to `/detailing`.
- Pricing copy updated throughout.
- Schema.org JSON-LD updated.

### `services.html` + `services.js` — services page
- Interior section rewritten to reflect included-in-all-tiers model.
- Pricing updated throughout.
- Schema updated.

### `chatbot.js` — wash planner
- Removed interior add-on upsell flow.
- Diablo removed from ADDONS table.
- Price ranges used in recommendations.
- SMS body updated.

### `api/chat.js` — AI planner system prompt
- New tier descriptions with interior included.
- Diablo presented as a feature, not an add-on.
- Correct price ranges.

### `detailing.html` — new education page
- New page at `/detailing`.
- Content: wash vs detail, what happens if you skip it, signs your car needs one.
- Wired into nav.js, sitemap.xml, llms.txt, schema.org.

### `nav.js` — navigation
- Added "What is a detail?" link pointing to `/detailing`.

### `sitemap.xml`
- Added `/detailing` URL.

### `llms.txt`
- Updated all pricing.
- Removed Diablo as add-on, noted as included feature.
- Added `/detailing` page to Pages section.

---

## What requires Cal.com admin access (Ellis must do this)

See `CAL_CHANGES_NEEDED.md` for exact step-by-step instructions.

**In short:**
1. Log in at app.cal.com.
2. **Basic event type:** Update description + duration to 60 min. Remove interior add-on question.
3. **Essential event type:** Rename to "Essential Wash". Update description + duration to 90 min. Remove interior add-on question.
4. **Premium event type:** Update description. Confirm 240 min duration. Set 12pm availability cutoff. Remove interior add-on question.
5. **All event types:** Remove the "Diablo wheel cleaner (+$10)" booking question. Update headlight restoration to +$35.

---

## Restore point

If anything looks wrong, the pre-change state is tagged in git:
`restore-point-20260627-174047`

To restore: `git checkout restore-point-20260627-174047`

The feature branch is: `feature/wyatt-restructure-20260627`
