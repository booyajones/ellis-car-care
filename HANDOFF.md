<!-- VOICE-GUARD-OFF -->
# Elion Car Care, how to run your site

A one-page reference for Ellis. Bookmark this.

---

## Your URLs

- **Public site**: https://elioncarcare.com
- **Booking page** (where customers go): https://elioncarcare.com/book
- **Your dashboard**: https://elioncarcare.com/admin

## Your login

The dashboard at `/admin` needs your password. It's stored in 1Password (have your dad pull it out and rotate it to something you'll remember). If you ever lose it:

```
vercel env rm  ELION_ADMIN_PASSWORD production
vercel env add ELION_ADMIN_PASSWORD production   # paste new value
```

Then redeploy (just push any commit, or click "Redeploy" in Vercel dashboard).

---

## When a customer books

Ordering goes through **Cal.com** now. The `/book` page leads with the calendar.

1. They pick a tier (Basic / Essential / Premium) on `/book`
2. They pick a time slot in the embedded Cal.com calendar
3. They check off add-ons (Diablo wheel scrub, clay bar, interior, headlights) right in the Cal.com booking
4. **You get a Cal.com email + it shows in your Cal.com dashboard** at app.cal.com. The booking has their name, phone, address, the add-ons they picked, and any notes.
5. **You confirm the total when you arrive** (the site quotes a starting number; you finalize it based on add-ons, deep interior, etc.)

Manage all bookings, availability, and reschedules in your **Cal.com dashboard** (app.cal.com, sign in with elionx24@gmail.com). That's your source of truth now.

> The old custom order form and `/admin` dashboard are retired. `/admin` still exists but no new orders flow into it. Everything lives in Cal.com.

## Add-on prices (these are the menu, and the Cal.com booking questions)

- **Interior** $40 on Basic, $35 on Essential and Premium (a standard interior clean)
- **Steam clean** +$20 (only paired with Interior, it's a steam upgrade to the interior detail)
- **Deep clean** quoted (set-in stains, heavy pet hair, neglected cabin, its own box on the site)
- **Diablo wheel cleaner** +$10 (a compound, not a brush; Basic & Essential; included in Premium)
- **Clay bar** +$20 (Essential; included in Premium)
- **Trim and plastic shine** (Chemical Guys VRP): $30 exterior on Essential, $25 on Premium, $50 inside and out
- **Ceramic on wheels** +$20 (Essential; included in Premium)
- **Headlight restoration** +$30 (any package)

The website (config.js) and the AI planner already reflect all of these. If you change an add-on price, update **two places**: `config.js` (the website) AND the matching Cal.com booking question option label. Keep them matched.

### Cal.com booking checkboxes: 5-minute finish (your account)

The **Add-ons** booking question already exists on all three events with the original five options (Diablo, Clay bar, Interior, Steam clean, Headlight) and they still work. To match the new menu, open each event in app.cal.com -> Event Types -> (event) -> Advanced -> the **Add-ons** question -> Edit, and set the options to exactly this (then Save the question and Save the event):

- **Basic** (interior $40): Interior (+$40), Steam clean (+$20), Deep clean (quoted), Diablo wheel cleaner (+$10), Headlight restoration (+$30). Remove Clay bar (it starts at Essential now).
- **Essential** (interior $35): Interior (+$35), Steam clean (+$20), Deep clean (quoted), Diablo wheel cleaner (+$10), Clay bar (+$20), Trim and plastic shine (+$30 ext, $50 in and out), Ceramic on wheels (+$20), Headlight restoration (+$30).
- **Premium** (interior $35): Interior (+$35), Steam clean (+$20), Deep clean (quoted), Trim and plastic shine (+$25 ext, $50 in and out), Headlight restoration (+$30). Diablo, Clay bar, and Ceramic on wheels are already included in Premium.

Also worth a 10-second tidy: rename the Basic event's Diablo option from "Diablo wheel scrub" to "Diablo wheel cleaner" (it's a compound, not a brush). Nothing breaks until you do these; the website reads whatever labels are on the booking, and the copy already says "add-ons are options in the booking, or just ask Ellis."

**Maintenance rule (important):** keep the word "interior" OUT of the Steam clean, Deep clean, and Trim option labels (use "Steam clean (+$20)", "Deep clean (quoted)", "Trim and plastic shine ... in and out", never "...with interior" or "interior and exterior"). The site detects add-ons by keyword, so "interior" inside another option would make that booking also read as a flat interior job. The "pick Interior too" hint lives in the question's main label, which is safe. Same idea: don't add a separate yes/no "Interior?" question with a "No interior" option, it always trips the interior keyword. Interior is just one of the checkboxes. And keep "ceramic" only in the "Ceramic on wheels" option (the detector looks for "ceramic ... wheel").

## Punch card + first-time discount (automatic)

Customers earn a free Essential after **4 completed washes** (buy four, get one free). It runs itself, you don't track anything on paper.

How it works:

1. When a customer books, Cal.com pings the site and you get a **notification email** with their punch-card status (e.g. "punch 2 of 5") and two one-tap buttons.
2. After you finish their wash, tap **"Mark this wash done"** in that email. That adds their punch. (That's the only step you do.)
3. When their card fills up, your booking email shows a **FREE ESSENTIAL** banner and a **"Redeem free wash"** button. Tap it when you give them the free one.
4. **First-time customers**: the email flags **"first-timer, take 25% off"** automatically, you just knock 25% off their total. It's tied to their email, so they can't farm it by re-booking under a cleared browser.

Customers can check their own card at **https://elioncarcare.com/rewards** (they type their email, it shows the punches). It's read-only, only your email buttons can change anything.

Nothing here charges a card. You still settle up in person by Venmo or cash.

> Behind the scenes: the Cal.com webhook is live (fires on booking created, canceled, and meeting ended) and the links in your email are signed and time-limited, so a forwarded email can't redeem a free wash months later.

## Getting paid

They pay AFTER the job, when they're happy, by Venmo or cash. Your Venmo handle is `@Ellis-Wyatt-2` (shown on the site and the booking). It's set in `config.js` → `contact.venmo` and `contact.venmoSlug`, plus `VENMO_HANDLE` / `VENMO_SLUG` at the top of `api/_email.js`. If you change your Venmo handle, change BOTH places, then push.

## When you finish a job

1. Take a before/after photo with your phone
2. Text them the after photo
3. Tap **"Mark this wash done"** in the booking notification email (this adds their punch card credit), and mark the booking done in your Cal.com dashboard
4. If you took good photos, save the `.jpg` files to `images/jobs/` in the repo with names like:
   - `job-01-before.jpg`
   - `job-01-after.jpg`
   - Then update `JOBS_COUNT: 1` in `config.js` (then 2, 3, etc.)
   - Push to GitHub. Photos appear on `/gallery` automatically.

## Changing prices or services

All in `config.js` at the repo root. Open it in any text editor:

```js
bundles: [
  {
    id: "basic",
    name: "Basic",
    price: 40,       // change number here
    time: "about 45 minutes",
    ...
  },
  ...
],

addons: [
  {
    id: "headlight-restoration",
    name: "Headlight Restoration",
    price: 30,       // change number here
    ...
  }
],

firstTimeDiscount: 0.25,  // 0.25 = 25 percent. Set to 0 to disable.
bundleDiscount: 10,       // dollars off when bundling interior plus exterior
```

Save the file, commit, push. Live in 30 seconds.

## When you need to stop taking orders

Two ways:

1. **Soft pause**: change `nextAvailable` in `config.js` to `"Booked solid through next week"`. People can still book but they see the warning.
2. **Hard pause**: in Vercel dashboard, set `ELION_ADMIN_PASSWORD` to nothing, that turns off the booking API.

## If something breaks

1. Check https://elioncarcare.com, does the front page load?
2. If yes but `/admin` is empty, refresh, then check your password.
3. If no, the AI is the most fragile piece. The site will still take orders even with AI off.
4. Worst case: text customers `(628) 252-0740` and tell them to text you directly.

Your dad and Claude built this together. If you need code help, paste the error into Claude and it'll walk you through it.

## Going to college

When you're at U of M and Elion is on pause for the summer, you can:

- Soft pause: set `nextAvailable` in `config.js` to something like `"Back in the fall"`.
- Or pull the **Book** link from the nav: edit the `PAGES` list at the top of `nav.js` (the nav is shared across every page now, so one edit hides it everywhere).
- Or hand the dashboard password to whoever takes over.

---

That's it. The site does the busywork. You do the cars.
