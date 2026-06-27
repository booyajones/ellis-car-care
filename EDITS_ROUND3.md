# Wyatt Auto Detailing — Preview Edits Round 3 (2026-06-27)

Work on existing branch `feature/wyatt-restructure-20260627`. Do NOT touch restore-point-20260627-174047. Commit when done. Do NOT push/merge (parent deploys).

Green accent var is `--stripe-green: #3CB286`. Orange accent is `--accent: #E89B3A`. Keep tier IDs `basic`/`essential`/`premium` unchanged in config + code; only the DISPLAY name of "basic" changes to "Starter".

## 1. Rename "Basic" → "Starter" (display only)
- config.js bundle id "basic": change `name: "Basic"` to `name: "Starter"`. Keep `id: "basic"`.
- Update every USER-FACING "Basic" reference to "Starter": index.html (meta/og/schema/copy), book.html (cal-tier-name + meta), services.html, llms.txt, chatbot.js, api/chat.js, detailing.html, FAQ answers in config.js, anywhere the tier is named to the customer.
- Keep internal ids, slugs, calEventBySlug keys, and tier KEYS as "basic" — do not rename those. This is a label change only. (e.g. price logic keyed on "basic" stays.)
- "Starter" implies working your way up. Where copy says "Basic starts at $38" make it "Starter starts at $38" etc.

## 2. Replace the standalone green "wash" badge with an in-bullet checked checkbox
Currently Essential shows a standalone green "wash" pill next to the tier name (`washBadge` in app.js using `.bundle-wash-marker`, and `.cal-tier-wash-badge` in book.html).
- REMOVE the standalone green "wash" text/pill next to the Essential name on the homepage tier card (remove the `washBadge` from the `.bundle-name` header in app.js render) AND next to Essential in book.html (remove the `<span class="cal-tier-wash-badge">wash</span>` from the cal-tier-name).
- INSTEAD: inside the bullet `includes` list of BOTH Essential AND Premium, add a bullet item that is a CHECKED checkbox followed by the word "wash", styled in the SAME green (`--stripe-green`). It should read as a ticked green checkbox with "wash" next to it.
  - Implementation: add a first bullet (or a clearly marked bullet) in the Essential and Premium `.bundle-includes` lists that renders a green checked-checkbox glyph + "wash". You can drive this from config.js (e.g. a `washIncluded: true` flag on essential + premium bundles) and have app.js render that bullet specially with a class like `.bundle-wash-check` (green checkmark/checkbox + the word wash in green). Do the same on the booking page (book.html / book.js) wherever those tiers list what's included, if such a list exists there; at minimum make sure the homepage cards show it. Use a real checked-checkbox look (e.g. a ✓ in a green box, or a green ☑) — checked, in green #3CB286.
  - Starter (basic) does NOT get the wash checkbox (it's the in-depth wash tier itself; only Essential and Premium carry the green "wash" check to show wash is part of the bigger detail). Keep Starter as-is.
- Remove now-unused `.bundle-wash-marker` / `.cal-tier-wash-badge` CSS only if nothing else uses them; otherwise leave but unused is fine. Add new `.bundle-wash-check` CSS (green checkbox + green "wash" text).

## 3. Desktop layout: 2 feature cards (Essential + Premium) on top, Starter as a bottom bar
On DESKTOP (>=760px) change the `.bundles` pricing layout:
- Essential and Premium render as the two main side-by-side blocks (the prominent options we want to push).
- Starter (basic) renders as a full-width horizontal BAR across the BOTTOM, spanning under both cards — a slimmer, less prominent row that still clearly shows the Starter name, price range ($38–50), a short descriptor, the includes/CTA in a condensed horizontal form. Goal: incentivize Essential/Premium while still offering Starter for people who just want an in-depth wash.
- Implement via CSS grid: e.g. make `.bundles` a 2-column grid where Essential+Premium sit in row 1 (one each), and the Starter card gets `grid-column: 1 / -1` to become the bottom bar, with a modifier class (e.g. `.bundle--bar` / `.bundle--starter`) giving it a horizontal layout (name + price + summary + CTA in a row instead of stacked). app.js should add that modifier class when `b.id === "basic"`. Make sure DOM order or grid placement puts Essential and Premium first and Starter last on desktop.
- Keep the "Most popular" treatment on Essential (it's `popular: true`).

## 4. Mobile layout: Starter stays a normal card but more compact
On mobile (<760px) a bottom bar is awkward, so:
- Starter renders as a normal stacked card like the others (NOT the bar), but MORE COMPACT — less vertical space than Essential/Premium. e.g. on mobile the `.bundle--bar`/starter modifier should fall back to a normal-but-condensed card: smaller padding, tighter includes list (can trim/condense the bullet list or reduce spacing) so it's visibly the smaller/lighter option.
- Order on mobile: Essential and Premium should appear before Starter (push the upsell), with Starter compact at the bottom. Confirm the mobile order matches.

## Verify before finishing
- grep for user-facing "Basic" — should be gone from customer copy (internal id "basic" stays). Report remaining hits.
- Confirm no standalone green "wash" pill next to Essential name on home or book page.
- Confirm Essential AND Premium bullet lists each show a green CHECKED checkbox + "wash".
- Confirm desktop: Essential+Premium as two cards, Starter as a bottom bar spanning full width. Confirm mobile: Starter is a compact normal card, ordered last.
- stop-slop: no em dashes in any prose you write.
- Test that app.js still renders without JS errors (the render loop must handle the new flags/classes and the reordering).

## Report
files changed, the rename approach (id kept, label changed), how the wash checkbox renders + its CSS, the desktop grid approach for the Starter bottom bar, the mobile compact treatment, and the verification grep results.
