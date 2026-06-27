# Cal.com Admin Changes Required — Wyatt Restructure 2026-06-27

These are the exact steps Ellis needs to take in the Cal.com dashboard after this code is deployed.

---

## Overview of changes

The tier model changed. Here is what each Cal.com event type should reflect:

| Tier | Price to show | Duration | Interior? | Key change |
|------|--------------|----------|-----------|------------|
| Basic | $38–50 (small $38 / large $50, quoted on site) | 60 min | Yes, vacuum | Was $37 flat. Interior vacuum is now included, not an add-on. |
| Essential | $85–110 (small $85 / large $110) | 90 min | Yes, full detail | Was $60. Full interior included (boar's hair, drill-scrubbed mats). Add "wash" label in title. |
| Premium | $150–200 (quoted on car) | 240 min | Yes, Essential + VRP | Was "from $200". Chemical Guys VRP now included. |

---

## Change 1: Update event type names and descriptions

### Basic event type
1. Log in at [app.cal.com](https://app.cal.com).
2. Click **Event Types** → click **Basic** to edit it.
3. **Title:** Keep as "Basic" or rename to "Basic Detail".
4. **Description:** Replace with:
   > Hand wash + interior vacuum. Small car $38, large car $50 — Ellis quotes on site. Wheel rinse, two-bucket contact wash, hand dry, interior vacuumed. About 45–60 minutes.
5. **Duration:** Set to **60 minutes** (was 45 — the interior vacuum adds time).
6. Save.

### Essential event type
1. Click **Essential** to edit it.
2. **Title:** Rename to "Essential Wash" (adding "Wash" makes the wash label visible in booking).
3. **Description:** Replace with:
   > Full wash + wax + interior detail. Small car $85, large car $110. Everything in Basic, plus wax protectant and tire shine. Interior: boar's hair brushing on all panels, mats and upholstery drill-scrubbed. About 1–1.5 hours.
4. **Duration:** Set to **90 minutes**.
5. Save.

### Premium event type
1. Click **Premium** to edit it.
2. **Title:** Keep "Premium" or rename to "Premium Detail".
3. **Description:** Replace with:
   > Clay bar, machine polish, and ceramic. $150–200, quoted on your car. Interior gets the Essential-level work plus Chemical Guys VRP on all vinyl, rubber, and plastic. Diablo wheel cleaner included. About 4 hours. Book by 12pm.
4. **Duration:** Confirm it is **240 minutes** (4 hours). If not, set it to 240.
5. **Availability:** Set a custom schedule with end time of 12:00 PM (noon) so late-start slots can't be booked.
6. Save.

---

## Change 2: Remove the Diablo wheel cleaner booking question

Diablo is now an **included feature** on all washes. It should no longer appear as a paid add-on checkbox in the booking flow.

**For each event type (Basic, Essential, Premium):**
1. Edit the event type.
2. Find the **Booking Questions** section (or "Additional Inputs").
3. Find any question labeled "Diablo wheel cleaner (+$10)" or similar.
4. Delete it.
5. Save.

---

## Change 3: Update interior handling per tier

Interior is now **included** in all tiers, not a separate checkbox add-on.

- **Basic:** Interior vacuum is included. Remove any "Add interior (+$40)" question from the Basic event type if it exists.
- **Essential:** Full interior detail is included. Remove any "Add interior (+$35)" question from the Essential event type.
- **Premium:** Interior is included. No interior add-on question should exist here.

**Keep these add-on questions (update price labels if needed):**
- Steam clean (+$20) — all tiers
- Deep clean (quoted) — all tiers
- Clay bar (+$20) — Essential only
- Trim and plastic shine (+$30 Essential, +$25 Premium) — Essential + Premium
- Ceramic wheel coat (+$25) — Essential only (included in Premium, remove from Premium)
- Headlight restoration (+$35) — all tiers (note: price was $30, now $35)

---

## Change 4: Duration blocking verification

Once durations are set correctly, Cal.com blocks overlapping slots automatically.

- Basic: 60 min → holds a 1-hour window after booking.
- Essential: 90 min → holds a 1.5-hour window.
- Premium: 240 min → holds a 4-hour window. Combine with the 12pm cutoff to prevent late starts.

**To verify:** Try booking two slots back to back on the same day. The second slot should not be offered during the first slot's window.

---

## Change 5: Cal.com URL slugs (no change needed)

The `calEventBySlug` values in `config.js` are:
- `basic: "basic"`
- `essential: "essential"`
- `premium: "premium"`

These must match the event type slugs in Cal.com. If you rename the event types, update the slugs in `config.js` to match — or rename the Cal.com event type title only, not the slug.

---

## Summary

| What | Where | Status |
|------|-------|--------|
| Update Basic description + duration to 60 min | Cal.com → Basic event | Do this |
| Update Essential to "Essential Wash" + new description + 90 min | Cal.com → Essential event | Do this |
| Update Premium description + confirm 240 min + 12pm cutoff | Cal.com → Premium event | Do this |
| Remove Diablo add-on question from all events | Cal.com → each event → Booking Questions | Do this |
| Remove interior add-on questions (all tiers) | Cal.com → each event → Booking Questions | Do this |
| Update headlight restoration to +$35 (was $30) | Cal.com → each event → Booking Questions | Do this |
