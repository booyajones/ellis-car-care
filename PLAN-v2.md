<!-- VOICE-GUARD-OFF -->
# Ellis Car Care, Website Plan v2 (council-locked)

## What changed from v1

| Area | v1 | v2 |
|---|---|---|
| Primary CTA | "Book a Detail" form | "Text Ellis to book" (sms: prefilled) plus form is secondary |
| Pricing | A la carte menu (4 services) | 3 named bundles plus 1 add-on plus season pass |
| Tagline | TBD | "Hand-detailed by a kid from Burns Park." |
| Hero | Photo of Ellis | Hand-drawn illustration (sun + bucket + sponge), small Polaroid of Ellis below fold |
| Visual identity | "Modern, confident, warm" | Neighborhood-zine + summer lemonade-stand, hand-drawn marks, yellow sun signature |
| Imagery | Photos throughout | 5-piece custom SVG illustration kit, photos arrive later as before/afters |
| Type | Bricolage OR Fraunces + Inter | Fraunces (display, optical-sizing) + Inter (body), both self-hosted, subset |
| Section count | 9 | 6 visible, FAQ collapsible. Reviews section hidden until 4+ real before/afters exist |
| Map | Static map image | Cut. Replaced with one-line "Burns Park free, rest of 48104/48103 +$5" |
| Address | TBD | Never on page. Never in JSON-LD. Service-area schema only |
| Pricing source | Inline HTML | config.js only. JS renders cards AND JSON-LD from one object |
| Referral loop | Not in v1 | "Tell a neighbor, get $10 off" box near booking |
| Trust strip | Not in v1 | 3-icon strip below hero (Burns Park kid, Cash or Venmo, Mom can text my mom with Chris's phone) |
| Live availability | Not in v1 | "Next available" line, manually edited in config.js |

## Final positioning

- Name: Ellis Car Care
- Tagline: Hand-detailed by a kid from Burns Park.
- Sub: Wash, detail, wax, and paint restoration. In your driveway. By a real local kid.
- Backup phrase for trust: "I'm Ellis. I'm 14 and I take this seriously."

## Pricing structure (locked)

| Bundle | Price | What's in it | Time |
|---|---|---|---|
| Quick Shine | $40 | Exterior wash, dry, tire shine | ~45 min |
| Driveway Detail | $90 | Wash + interior vacuum + wipe-down + windows + tires | ~2 hrs |
| Full Reset | $150 | Driveway Detail + hand wax | ~3 hrs |
| Paint Restoration add-on | Text for quote | Light compound + polish for swirls and scratches | varies |
| Season Pass | $120 | 4 Quick Shines, use anytime June through August | n/a |

Service area pricing: Burns Park free. 48104 / 48103 +$5. Beyond, by request.

## Information architecture (final)

1. Hero. Cream bg. Big Fraunces headline (2 lines). Hand-drawn illustration cluster. Two CTAs: yellow pill "Text to book" (sms: prefilled), text-link "See the menu" (anchor).
2. Trust strip. 3 hand-drawn icons + tiny copy. Includes "Mom can text my mom" with Chris's first name + phone.
3. The menu (bundles). 3 cards + add-on + season pass. Each card has a yellow hand-drawn price sticker (slightly rotated). "Most popular" sticker on Driveway Detail.
4. How it works. 3-step strip: Text Ellis, He comes to your driveway, You drive a clean car.
5. About Ellis. Polaroid-style snapshot (slight rotation, taped corners), 3-sentence bio, first name only.
6. Service area + Next available. One line of copy. "Next available: Sat May 10, afternoon." Manually edited in config.js.
7. FAQ. 5 questions, collapsed by default. Weather, payment, electrical, what to do with the car keys, what if it rains.
8. Book. Form (secondary). Big "Text Ellis instead" button at top of form section. Below: 5-field form. Form posts to Formspree, falls back to mailto if offline. 
9. Refer a neighbor. Small box: "Send a Burns Park neighbor to Ellis, get $10 off your next wash." Pre-filled share text.
10. Footer. Phone (Chris's parent phone for trust), email, service area, copyright. No address.

## Design system (locked)

Colors:
```
--navy:       #0E2A47   /* primary text, lines */
--cream:      #F4EBD9   /* page bg */
--cream-soft: #FAF4E8   /* card bg */
--sun:        #F5B83A   /* CTA, price stickers, sun mark */
--sun-deep:   #E0A12C   /* CTA hover */
--teal:       #2FA9B8   /* hose-water accent */
--ink:        #1A1A1A   /* body */
--muted:      #6B6358   /* secondary text */
```

Type:
- Display: Fraunces, optical-size axis, weight 600. For h1, h2, large quotes.
- Body: Inter, variable.
- Fallback stack: system-ui, -apple-system, "Segoe UI", sans-serif

Signature element: hand-drawn yellow sun (SVG, ~12 rays, slightly imperfect). Lives top-right of the hero, smaller in section headers. Rotates 1deg per 100px scroll. This is the brand mark.

Motion:
- Sun rotates with scroll (passive listener, throttled).
- Soap bubbles drift up the right edge on scroll (CSS only).
- Cards lift 2px on hover, 150ms ease-out.
- Price stickers wobble 1deg on hover.
- No fade-ins, no entrance animations.

Illustration kit (5 SVGs): sun, bucket, sponge, sedan, drop. Single-color line art (navy stroke), one yellow fill accent per mark, slightly imperfect marker style.

## Tech architecture (locked)

```
ellis-car-care/
├── index.html
├── styles.css
├── app.js
├── config.js
├── thanks.html
├── 404.html
├── robots.txt
├── sitemap.xml
├── favicon.svg
├── apple-touch-icon.png
├── og-image.png
├── images/
│   ├── sun.svg
│   ├── bucket.svg
│   ├── sponge.svg
│   ├── sedan.svg
│   └── drop.svg
├── fonts/                   (loaded from Google Fonts CDN for v1; can self-host later)
└── README.md
```

Form path:
- Primary: form posts to Formspree with hidden _redirect to thanks.html.
- Fallback: if FORMSPREE_ID is empty in config.js, JS rewrites form action to mailto: with prefilled subject + body.
- The form ALWAYS works without JS (submit button is real).

JSON-LD: type AutoDetailing, rendered by app.js from config.js so prices stay in sync. No address. serviceArea as GeoCircle on Burns Park (~2km radius). priceRange "$".

Sticky CTA: position fixed bottom 0, padding-bottom env(safe-area-inset-bottom), hidden 720px+, hidden when book section is in viewport via IntersectionObserver, body padding-bottom 96px on mobile, scroll-padding-bottom 80px on html.

## Privacy + safety guardrails

- No address on page or in JSON-LD.
- First name only ("Ellis").
- Photo of Ellis is optional and swappable via config.js. Day 1 ships illustration only.
- Backup contact is Chris's phone (parent).
- No tracking pixels. No analytics in v1.

## Build sequence

1. Foundations: config.js, README.md, robots.txt, sitemap.xml, 404.html
2. Visual assets: 5 SVG illustrations, favicon, OG image
3. index.html (all sections, semantic, no-JS-friendly)
4. styles.css (tokens, reset, primitives, components, mobile-first)
5. app.js (sticky CTA, scroll-sun, render prices + JSON-LD, form fallback)
6. thanks.html
7. Local QA in browser
8. Lighthouse + axe pass
9. Deploy recipe in README

That is the locked plan. Now build.
