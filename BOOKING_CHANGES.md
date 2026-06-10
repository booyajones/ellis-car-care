# Booking Calendar Changes — 2026-06-10

## What was changed in code

### `book.html` — "Book by 12pm" badge on Premium button
Added a `cal-tier-badge--time` span to the Premium tier button so customers
see "BOOK BY 12PM" before they even click in. This is a UX hint only — the
hard block is enforced inside Cal.com.

### `styles.css` — `.cal-tier-badge--time` CSS
New badge style: muted/neutral pill positioned top-right of the premium button.
Visually distinct from the "Most popular" badge (accent color) so it reads as
an informational note, not a highlight.

---

## What requires Cal.com admin access (Ellis must do this)

See `CAL_CHANGES_NEEDED.md` for exact step-by-step instructions.

**In short:**
1. Log in at app.cal.com
2. **Premium event type → Duration:** Confirm it's set to 240 min (4 hrs).
   This is what makes duration blocking work — Cal.com holds the 4-hr window
   automatically after a booking.
3. **Premium event type → Availability:** Set a custom schedule with end time
   of 12:00 PM. This removes the 1pm (and later) slots from the premium picker.

---

## Restore point

If anything looks wrong, the pre-change state is tagged in git:
`restore-point-2026-06-10`

To restore: `git checkout restore-point-2026-06-10`
