commit 72982cbbded38faae44da55562b6ce60fc76782b
Author: booyajones <chris.a.wyatt@gmail.com>
Date:   Sun May 31 21:55:25 2026 -0400

    Restructure packages + route all ordering through Cal.com
    
    New pricing model (per Ellis's service breakdown + Chris's call):
    - Basic $40: wheel rinse, two-bucket contact wash, hand dry (no wax)
    - Essential $60: Basic + spray wax (was $90 ceramic seal; ceramic moved
      to Premium, base dropped to match the lighter service)
    - Premium: QUOTE from $200 — full decon, Diablo, clay bar, machine
      polish, ceramic coat, hydro sealant
    
    Add-ons now live as Cal.com booking questions (and are described on the
    site from config.addons):
    - Diablo wheel scrub +$10 (Basic/Essential; included in Premium)
    - Clay bar +$20 (Basic/Essential; included in Premium)
    - Interior $40 Basic / $35 Essential ($5 incentive to upgrade); deep
      interior quoted; Premium interior quoted
    - Headlight restoration +$30 (any tier)
    
    Ordering: the custom order form, quote engine, confirmation modal, and
    slot picker are removed from /book. Cal.com is the sole order path. The
    fast-path tier picker + embedded calendar stays; book.js is now a lean
    tier-switcher + add-ons renderer. /admin + api/orders are dormant
    (left in place, unlinked).
    
    config.js: new bundles (quote flag + priceLabel on Premium), new addons
    model (tiers/includedIn/priceByTier/quotedTiers), calDurationLabel updated.
    
    app.js: bundle cards handle quote pricing + per-card add-on hints; new
    add-ons grid renders from config; escapeHtml lifted to top, reused.
    
    index.html: pricing section reworked ("Three packages. Add what you
    want.") with an add-ons grid below the cards.
    
    chatbot.js: v9 model — prices, descriptions, add-ons (Diablo/clay bar,
    interior-by-tier, deep-interior-quoted), Premium-as-quote, bundle
    discount removed, and a "Book {tier} on the calendar" button added
    alongside the text-Ellis hand-off.
    
    api/chat.js: system prompt rewritten to the new tiers, add-ons, quote
    model, and Cal.com ordering. Rule 6 updated (Premium now includes
    ceramic coat).
    
    Photos: 3 new wheel-detail shots (Diablo scrub) added as wash-13/14/15,
    wired into the gallery.
    
    HANDOFF.md: documents Cal.com as the order system, new add-on prices,
    and the two-place add-on price rule.
    
    Asset cache versions bumped (styles v22, config v20, chatbot v11,
    book v4, gallery v3, app v13). verify-build: 19/19 PASS.

diff --git a/config.js b/config.js
index 364b4b6..3ae20b5 100644
--- a/config.js
+++ b/config.js
@@ -63,36 +63,41 @@ const CONFIG = {
   // confirmation modal. Keep keys aligned with bundle ids + calEventBySlug.
   calDurationLabel: {
     basic: "45 min",
-    essential: "1.5 hr",
-    premium: "4 hr",
+    essential: "1 hr",
+    premium: "from 4 hr",
   },
 
+  // ----------------------------------------------------------
+  // PACKAGES
+  // Base price is the exterior wash. Add-ons (below) are selected
+  // inside the Cal.com booking and priced on top. Premium is a quote
+  // (set quote: true) — the price field is the starting number.
+  // ----------------------------------------------------------
   bundles: [
     {
       id: "basic",
       name: "Basic",
       price: 40,
       time: "about 45 minutes",
-      summary: "Hand wash, done right.",
+      summary: "A real hand wash, wheels to dry.",
       includes: [
-        "Two-bucket exterior hand wash, grit guards in both",
-        "Hand dry with fresh microfiber, no water spots",
-        "Tire dressing and wheel wells wiped",
-        "Door jambs and gas door cleaned",
+        "Wheel pressure rinse",
+        "Wheel wash",
+        "Pressure rinse the body",
+        "Two-bucket contact wash",
+        "Hand dry, no water spots",
       ],
       popular: false,
     },
     {
       id: "essential",
       name: "Essential",
-      price: 90,
-      time: "about 1.5 hours",
-      summary: "Wash + ceramic seal. Paint stays protected for months.",
+      price: 60,
+      time: "about 1 hour",
+      summary: "Everything in Basic, finished with spray wax.",
       includes: [
         "Everything in Basic",
-        "Iron decontamination prep on the paint",
-        "Ceramic spray sealant — beads water, lasts 3-4 months",
-        "Plastic trim refreshed",
+        "Spray wax for gloss and a few weeks of protection",
       ],
       popular: true,
     },
@@ -100,25 +105,62 @@ const CONFIG = {
       id: "premium",
       name: "Premium",
       price: 200,
+      quote: true,
+      priceLabel: "from $200",
       time: "about 4 hours",
-      summary: "Wash + ceramic seal + cut and polish. Brings paint back.",
+      summary: "Full correction and ceramic. Quoted on your car.",
       includes: [
-        "Everything in Essential",
-        "Clay bar pass to remove embedded contaminants",
-        "Single-stage cut and polish for swirls, light scratches, oxidation",
-        "Interior deep clean: vacuum, wipe-down, glass, vents",
-        "Leather conditioner or fabric protectant on seats",
+        "Diablo wheel and tire scrub",
+        "Pre-wash, two contact washes, full rinse-downs",
+        "Clay bar the whole car",
+        "Machine polish to cut swirls and oxidation",
+        "Ceramic coat every panel",
+        "Tire shine and hydro sealant",
       ],
       popular: false,
     },
   ],
 
+  // ----------------------------------------------------------
+  // ADD-ONS
+  // tiers:       which packages can add this (shown as a checkbox in booking)
+  // includedIn:  packages where it's already part of the job (shown as "included")
+  // price:       flat add-on price
+  // priceByTier: per-package price (used for Interior — $5 less on Essential)
+  // quotedTiers: packages where this add-on is quoted, not flat-priced
+  // These mirror the Cal.com booking questions on each event type.
+  // ----------------------------------------------------------
   addons: [
     {
-      id: "headlight-restoration",
-      name: "Headlight Restoration",
+      id: "diablo",
+      name: "Diablo wheel scrub",
+      price: 10,
+      tiers: ["basic", "essential"],
+      includedIn: ["premium"],
+      description: "Deep scrub of the wheels and tires with the Diablo brush, past what a rinse gets. Brake dust gone.",
+    },
+    {
+      id: "claybar",
+      name: "Clay bar",
+      price: 20,
+      tiers: ["basic", "essential"],
+      includedIn: ["premium"],
+      description: "Clay the paint to pull out embedded grit a wash can't reach. Glass-smooth after.",
+    },
+    {
+      id: "interior",
+      name: "Interior",
+      priceByTier: { basic: 40, essential: 35 },
+      tiers: ["basic", "essential", "premium"],
+      quotedTiers: ["premium"],
+      description: "Vacuum, wipe-down, glass, and vents. Deep interior (heavy pet hair or stains) is quoted.",
+    },
+    {
+      id: "headlight",
+      name: "Headlight restoration",
       price: 30,
-      description: "Sand + polish + UV pass to bring yellowed or foggy headlights back to clear. Adds about 30 minutes.",
+      tiers: ["basic", "essential", "premium"],
+      description: "Sand, polish, and a UV seal to bring foggy headlights back to clear.",
     },
   ],
 
