# Wyatt Auto Detailing — Preview Edits Round 2 (2026-06-27)

Work on the existing branch `feature/wyatt-restructure-20260627`. Do NOT touch restore-point-20260627-174047. Commit when done. Do NOT push or merge (parent handles deploy).

Ellis reviewed the preview. Make these edits to the preview:

## 1. Remove the MCard thing entirely
People in Bay View don't know what an MCard is. Remove every MCard mention site-wide:
- index.html bottom (~line 423): the `<p class="muted small">$5 off with any purchase when you show your MCard.</p>` line — delete it.
- book.html line 42: the `<strong>MCard special:</strong> ...` paragraph — delete the whole MCard `<p class="book-firsttime">` block.
- book.html line 13 og:description: remove the ", plus $5 off with any purchase when you show your MCard" clause.
- Search the whole repo for "MCard"/"mcard" and remove every remaining instance in user-facing copy.

## 2. Slogan / service-area geography → Bay View first, Petoskey second
Most hero/meta copy is already Bay View/Petoskey. Finish the rest:
- index.html SERVICE AREA section (~line 364): change `<h2 class="display">Burns Park first. Greater Ann Arbor second.</h2>` to "Bay View first. Greater Petoskey area second."
- The area-list under it currently says "Burns Park. Free travel, fastest scheduling." / "48104, 48103, 48105. Plus $5 for travel." / "Anywhere else..." → Rewrite to Bay View / greater Petoskey framing. Bay View = free/fastest. Greater Petoskey area = covered (NO $5 travel fee, see item 5). Keep an "anywhere else, text and ask" line.
- Sweep the ENTIRE repo for remaining Ann Arbor geography and update to Bay View / Petoskey, MI: search and fix in about.html, services.html, process.html, gallery.html, detailing.html, book.html, llms.txt, config.js (serviceArea block + FAQ answers + business description), chatbot.js, api/chat.js, nav.js, app.js, and the alt text in index.html hero image ("...detailing in Ann Arbor..." → Petoskey). Replace "Burns Park" with "Bay View", "Ann Arbor"/"Greater Ann Arbor" with "Petoskey"/"greater Petoskey area", and remove the 48104/48103/48105 zip references (those are Ann Arbor zips) — replace with Petoskey-area framing or just "the greater Petoskey area".
- config.js serviceArea: set primary to "Bay View, Petoskey" (primaryFree true), extended to "Greater Petoskey area", and since travel fee is removed (item 5) set extendedFee to "" or $0. Update lat/lng to Petoskey, MI: latitude 45.3733, longitude -84.9550. Update the schema.org geo coords in index.html (lines ~59 and ~69, currently 42.2628/-83.7281) to the same Petoskey coords.

## 3. Discount wording: "first time 15% off" → "second time 15% off"
Ellis wants the 15% off to apply to the SECOND wash, not the first. Update the DISPLAY copy everywhere:
- index.html hero (~line 149): "15% off your first wash, taken off your total." → "15% off your second wash, taken off your total."
- index.html book card (~line 421): "First wash is 15% off." → "Second wash is 15% off."
- book.html (~line 38-39): "First wash? 15% off." block → "Second wash? 15% off." and adjust the sentence.
- book.html meta description + og:description: "15% off your first wash" → "15% off your second wash".
- config.js / any FAQ copy mentioning first-wash discount → second wash.
- llms.txt, services.html, chatbot.js, api/chat.js: update any "first wash 15%" wording to "second wash".
- NOTE: leave the server-side discount MECHANISM (api/cal-webhook.js first-booking flag, firstTimeDiscount value) functioning; this is a COPY change only. Just change the customer-facing words from "first" to "second". Do not break the discount logic.

## 4. (covered above) — geography lingo sweep. Make sure nothing still says Ann Arbor or Burns Park in visible copy.

## 5. Remove the "+$5 for travel" on the homepage
- Remove the "Plus $5 for travel" from the area-list (item 2).
- config.js: extendedFee → "" (or 0) and update the area copy so no $5 travel surfaces on the homepage.
- Remove/disable $5 travel mentions in homepage-facing copy. (Server api/orders.js travel calc can stay but the homepage must not advertise a $5 fee.)
- Update any FAQ answer that says "adds $5" for the extended area.

## 6. Make the add-on list under each package more readable and clear
Currently in app.js (~line 96-106) the per-card add-on hint renders as one cramped sentence: `<p class="bundle-addons">...Add interior +$35, clay bar +$20 in booking.</p>`.
Rebuild this so the add-ons under each package read as a clean, scannable LIST (e.g. a small `<ul>` with each add-on + its price on its own line, and "included" items clearly marked). Add matching CSS in styles.css (`.bundle-addons` / new list classes) so it looks clear and readable, consistent with the site's design system. Each line should clearly show the add-on name and its price (e.g. "Interior — $35", "Clay bar — $20") and included ones marked "included". Keep it tight and clean, not a cramped run-on sentence.

## 7. Make the "What is a detail?" button more noticeable
index.html hero (~line 156): the button `<a class="btn btn-ghost" href="/detailing">What is a detail? →</a>`.
Make it stand out: give it an OUTLINE in the orange accent color used elsewhere on the site (find the accent color in styles.css — it's the orange/amber used for buttons/accents, e.g. var(--accent) ~ #E5A235 or similar). Add a new style (e.g. `.btn-detail-cta` or restyle the ghost button in this context) with a visible orange outline/border, accent-colored text, and a subtle hover fill. It should read as a clear, inviting call to action, more prominent than a plain ghost link, without being louder than the primary "Book online" button.

## Verify before finishing
- grep -rin "mcard\|burns park\|ann arbor\|48104\|48103\|48105\|first wash" --include='*.html' --include='*.js' --include='*.txt' --include='*.css' . | grep -v node_modules  → every remaining hit must be intentional (e.g. server-side var names, not user copy). Report each.
- Confirm Petoskey coords (45.3733, -84.9550) are in config.js and index.html schema.
- Confirm no "$5 travel" appears in homepage copy.
- Follow stop-slop: NO em dashes in prose (use the en-dash only inside price ranges like $38–50, or a colon/comma in sentences). The add-on list "Interior — $35" style should use a hyphen or colon, not an em dash, OR a clean separator; just be consistent and avoid em dashes in sentences.
- Report: files changed, the new area-list/slogan text, confirmation MCard + $5 travel gone, the new add-on list markup approach, and the new button styling.
