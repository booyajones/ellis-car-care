# Ellis Car Care, Website Plan v1

## Business context
- **Owner:** Ellis (Chris Wyatt's son), local Burns Park kid running a summer car detailing business.
- **Service area:** Burns Park first, broader Ann Arbor second.
- **Services:**
  1. Exterior wash and dry (entry point)
  2. Full detail (interior + exterior, vacuum, wipe-down, windows, tires)
  3. Wax add-on (hand wax, paint protection)
  4. Paint restoration add-on (light compound and polish for swirls and scratches)
- **Customer:** Parents in Burns Park. Affluent neighborhood, two cars in the driveway, prefer hiring a neighborhood kid over a chain. Booking decision is made on a phone, often by mom, often in 30 seconds.
- **Why this wins:** A real local kid, hand-done work at the customer's house, no driving to a chain, supports a neighborhood teenager.

## Brand working name
**Ellis Car Care.** Clean, name-forward, alliterative, fits a yard sign as easily as a website. Tagline candidates:
- "Hand-detailed by your Burns Park neighbor."
- "Burns Park's summer detail crew."
- "Driveway detail, done by a local kid."

## Positioning principles
1. **Hyper-local trust beats polish.** This isn't trying to look like a national franchise. The strongest hook is "Ellis is a kid in your neighborhood."
2. **Parents convert on safety and ease.** No driving anywhere, knows the family, photo of Ellis on the page so they can match a face.
3. **Pricing must be visible.** Hidden pricing kills small-job conversion. Show the menu.
4. **Phone-first.** Mom is on her phone in carpool. Mobile layout is the primary layout.
5. **A kid-run business should feel like one, but a sharp one.** Earnest, friendly copy. Not corporate. Not cutesy either.

## Information architecture (single page, anchor-nav)
1. **Hero.** Headline + sub + primary CTA (Book a Detail) + photo of Ellis with a clean car.
2. **Services and pricing.** Card grid: Wash, Full Detail, Wax Add-On, Paint Restoration Add-On. Each card has price, what's included, time estimate.
3. **How it works.** 3-step strip: (1) Book online, (2) Ellis comes to your driveway, (3) You drive a clean car. Sets expectations.
4. **About Ellis.** Short bio, photo, neighborhood credibility ("Burns Park, Tappan/Pioneer student"). Honest, kid-voice.
5. **Service area.** Map or simple text. Burns Park core, $5 travel fee outside (or whatever Ellis decides). Set expectations early.
6. **Reviews / Recent jobs.** Photo grid of before/after (placeholders to start, real photos as Ellis builds the book).
7. **FAQ.** Weather, payment (Venmo/cash), what Ellis brings vs what he needs from the customer (water spigot, electrical outlet for vacuum).
8. **Booking.** Form: name, address, phone, car (year/make/model), services, preferred date(s), notes. Submits to email (mailto: fallback, Formspree for live).
9. **Footer.** Phone, email, service area, copyright.

## Design direction
- **Aesthetic:** Modern, confident, warm. Think "neighborhood pride" not "corporate detailer."
- **Color palette working set:**
  - Deep blue `#0F2A44` (trust, clean water, Ann Arbor sky)
  - Warm cream / off-white `#F7F1E8` (bg, summer feel)
  - Sun yellow accent `#F5B544` (CTA, summer pop)
  - Charcoal `#1A1A1A` (body text)
- **Typography:**
  - Headings: a sturdy display, **Bricolage Grotesque** or **Fraunces** for warmth
  - Body: **Inter** for legibility
- **Photography vibe:** Bright, daylit, slightly warm. Driveway and garage shots, not studio.
- **Motion:** Subtle. Card hover lifts. No autoplay video. No scroll-jacking.
- **Mobile:** Sticky bottom CTA on mobile ("Book a Detail").

## Technical choices
- **Stack:** Static HTML + CSS + a tiny bit of vanilla JS. No build tools. Ellis (or a parent) can open it in any text editor.
- **Hosting target:** Whatever's easiest. Netlify drop, Vercel, GitHub Pages, or even a Squarespace import. The site needs to deploy anywhere.
- **Form handling:** Two-mode. Live mode posts to Formspree (or similar) and shows confirmation. Fallback mode uses a `mailto:` link so it always works even unhosted.
- **SEO:** Local SEO basics. Title tag with "Car Detailing Ann Arbor / Burns Park," meta description, JSON-LD `LocalBusiness` schema with service area, OG tags for sharing in neighborhood Facebook group.
- **Performance budget:** <100 KB CSS, <50 KB JS, images lazy-loaded, hero image preloaded. Should hit Lighthouse 95+.
- **Accessibility:** WCAG 2.1 AA. Alt text, contrast ratios checked, keyboard navigable, focus styles, form labels.
- **Privacy:** No tracking pixels by default. Optional Plausible/Umami if Chris wants analytics later.

## Out of scope (for v1)
- Online payments (Venmo handle is enough for a teen business)
- Real-time booking calendar (static form is fine, Ellis confirms by text)
- Multi-page CMS (overkill)
- Blog (overkill)

## Success criteria
- A parent in Burns Park can land on the page on their phone, understand the service, see the price, and book in under 60 seconds.
- The site looks legit enough that a parent who's never met Ellis would still book.
- Ellis can update prices and add testimonials by editing a single file.
- Lighthouse mobile score 95+ across the board.
- Loads in under 1 second on 4G.
