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

1. They fill out the form at `/book` (or chat with the AI helper)
2. Their order saves and pops up in your `/admin` dashboard
3. They get a confirmation email
4. **You get an email** at elionx24@gmail.com (the notification address). To change it: `vercel env rm ELION_NOTIFY_EMAIL production` then `vercel env add ELION_NOTIFY_EMAIL production` and paste the new address.
5. **You text them within an hour** to lock in a time

The site already tells them you'll text. They expect it.

## Reading the dashboard

Each order is a card. The fields:

- **Name + total** at the top
- **Status badge** (new, scheduled, in_progress, done, cancelled)
- **Tier**: Basic, Essential, or Premium, plus what they want cleaned
- **Add-ons**: headlight, pet hair, etc.
- **Phone / address / car / preferred timing**: tap-to-call, tap-to-text, tap-for-map
- **First-time star**: if you see this they got 25% off automatically
- **Status dropdown**: change as you go (new, then scheduled, then in_progress, then done)
- **Delete**: for spam or test orders. Confirms first.

Refresh in the top right pulls latest orders.

## Getting paid

Customer's confirmation email has a Venmo deep link with the right amount pre-filled. They pay AFTER the job, when they're happy. Your Venmo handle is `@Ellis-Wyatt-2` (controlled by `config.js` → `contact.venmo` and `contact.venmoSlug` for the client side, plus `VENMO_HANDLE` / `VENMO_SLUG` at the top of `api/_email.js` for the email templates). If you change your Venmo handle, change BOTH places, then push.

## When you finish a job

1. Take a before/after photo with your phone
2. Text them the after photo
3. Mark the dashboard card "done"
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
