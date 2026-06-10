# Cal.com Admin Changes Required

## Change 1: Duration Blocking (likely already working — verify)

Cal.com natively blocks overlapping slots when a booking is made. It uses the event type **duration** to know how long to hold the calendar.

**How to verify yours is set correctly:**
1. Go to [app.cal.com](https://app.cal.com)
2. Click **Event Types** in the left sidebar
3. Click **Premium** to edit it
4. Check the **Duration** field — it should say **240 minutes** (4 hours)
5. If it's already 240 min, duration blocking is already live. If not, set it to 240 and save.

That's it. Once a premium booking is made at, say, 10am, Cal.com will show 10am–2pm as occupied and won't offer those slots to the next visitor.

---

## Change 2: Block Premium from the 1pm Slot (requires admin)

The 1pm slot is a problem because 1pm + 4hrs = 5pm, which is end of day. The fix is to set a **custom availability** for the premium event type that only allows bookings to start at 12pm (noon) or earlier.

**Exact steps:**
1. Go to [app.cal.com](https://app.cal.com)
2. Click **Event Types** → click **Premium**
3. Click the **Availability** tab (or scroll to the Availability section)
4. Look for **"Use a different schedule for this event type"** — toggle it ON
5. Set the available time window:
   - Start: whatever your morning start is (e.g., **8:00 AM**)
   - End: **12:00 PM** (noon)
6. Save

This means premium can only be booked starting at 8am, 9am, 10am, 11am, or 12pm — never 1pm or later.

**Why 12pm?** A 12pm premium booking ends at 4pm. A 1pm booking ends at 5pm (or later if it runs over). Setting 12pm as the cutoff gives Ellis a clean end to the day.

---

## Summary

| Change | Where | Status |
|--------|-------|--------|
| Duration blocking (4hr hold after premium booking) | Cal.com admin → Premium event → Duration = 240 min | Verify it's already set |
| Block 1pm slot for premium | Cal.com admin → Premium event → Availability → end at 12pm | Needs to be done |
