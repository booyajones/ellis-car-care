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

## Add-on prices (these are also the Cal.com booking questions)

- **Diablo wheel scrub** +$10 (Basic & Essential; included in Premium)
- **Clay bar** +$20 (Basic & Essential; included in Premium)
- **Interior** $40 on Basic, $35 on Essential (deep interior quoted; Premium interior quoted)
- **Headlight restoration** +$30 (any package)

If you change an add-on price, update it in **two places**: `config.js` (the website) AND the Cal.com event-type booking question label (the booking form). Keep them matched.

## Getting paid

They pay AFTER the job, when they're happy, by Venmo or cash. Your Venmo handle is `@Ellis-Wyatt-2` (shown on the site and the booking). It's set in `config.js` → `contact.venmo` and `contact.venmoSlug`, plus `VENMO_HANDLE` / `VENMO_SLUG` at the top of `api/_email.js`. If you change your Venmo handle, change BOTH places, then push.

## When you finish a job

1. Take a before/after photo with your phone
2. Text them the after photo
3. Mark the booking done in your Cal.com dashboard
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

- Lower the daily cap so you don't get spammed: search for `DAILY_CAP` in `api/orders.js`, change `200` to `5`.
- Or just remove the booking form entirely by editing `index.html`'s topnav (`href="/book"` => remove).
- Or hand the dashboard password to whoever takes over.

---

That's it. The site does the busywork. You do the cars.
