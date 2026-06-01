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

diff --git a/chatbot.js b/chatbot.js
index 61a1a57..513c148 100644
--- a/chatbot.js
+++ b/chatbot.js
@@ -22,23 +22,25 @@
 
   const PHONE_HREF = "+16282520740";
 
-  // ---- Pricing & rules (Elion Car Care, v8 tier model) ----
-  // Tiers are PAINT-focused. Interior is a separate add-on, independent
-  // of which tier the customer picked. Bundle discount applies when a
-  // customer pairs interior detail with any exterior tier (since they're
-  // in one visit, not two).
+  // ---- Pricing & rules (Elion Car Care, v9 tier model) ----
+  // Basic = wash, Essential = wash + spray wax, Premium = full
+  // correction + ceramic (quoted from $200). Add-ons are picked in the
+  // Cal.com booking; interior is $5 less on Essential than Basic.
   const PRICES = {
-    basic:     40,    // wash only
-    essential: 90,    // wash + ceramic seal
-    premium:  200,    // wash + ceramic seal + cut and polish
+    basic:     40,    // wheel rinse, contact wash, dry
+    essential: 60,    // basic + spray wax
+    premium:  200,    // full decon, clay, polish, ceramic — QUOTE, this is the floor
   };
 
+  // Per-package interior price ($5 less on Essential to nudge the upgrade).
+  // null = quoted (Premium).
+  const INTERIOR_PRICE = { basic: 40, essential: 35, premium: null };
+
   const ADDONS = {
-    interior:    { id: "interior", name: "Interior detail (vacuum + wipe + glass)", price: 50, included: [] },
-    headlight:   { id: "headlight", name: "Headlight restoration",                  price: 30, included: [] },
-    petHair:     { id: "pethair",   name: "Heavy pet hair removal",                 price: 20, included: [], requires: "interior" },
-    heavyStain:  { id: "stain",     name: "Heavy stain treatment",                  price: 25, included: [], requires: "interior" },
-    leather:     { id: "leather",   name: "Leather conditioning",                   price: 15, included: ["premium"], requires: "interior" },
+    interior:  { id: "interior", name: "Interior (vacuum + wipe + glass + vents)", price: 40, included: [] },
+    headlight: { id: "headlight", name: "Headlight restoration",                  price: 30, included: [] },
+    diablo:    { id: "diablo",   name: "Diablo wheel scrub",                      price: 10, included: ["premium"] },
+    claybar:   { id: "claybar",  name: "Clay bar",                                price: 20, included: ["premium"] },
   };
 
   const PACKAGE_LABEL = {
@@ -49,16 +51,19 @@
 
   const PACKAGE_TIME = {
     basic:     "about 45 minutes",
-    essential: "about 1.5 hours",
+    essential: "about 1 hour",
     premium:   "about 4 hours",
   };
 
   const PACKAGE_DESC = {
     basic:     "hand wash",
-    essential: "wash + ceramic seal",
-    premium:   "wash + seal + cut and polish",
+    essential: "wash + spray wax",
+    premium:   "full decon, clay bar, polish, and ceramic coat",
   };
 
+  // Premium is a quote, not a flat price.
+  const QUOTE_TIERS = { premium: true };
+
   // ---- First-time discount tracking ----
   const FIRSTTIME_KEY = "elion_firsttime_used";
   function isFirstTimeBrowser() {
@@ -132,10 +137,10 @@
       id: "skipToPrices",
       prompt: () => [
         "All good. Here's the lineup:",
-        "• Basic — $40, about 45 min. Hand wash.",
-        "• Essential — $90, about 1.5 hrs. Wash + ceramic seal.",
-        "• Premium — $200, about 4 hrs. Wash + seal + cut and polish.",
-        "• Add-ons: Interior detail $50 · Headlight restoration $30.",
+        "• Basic — $40, about 45 min. Wheel rinse, contact wash, hand dry.",
+        "• Essential — $60, about 1 hr. Basic + spray wax.",
+        "• Premium — from $200, about 4 hrs. Full decon, clay bar, polish, ceramic coat. Quoted on your car.",
+        "• Add-ons: Diablo wheel scrub $10 · Clay bar $20 · Interior $40 ($35 on Essential) · Headlights $30.",
         "• First-time customer: 25% off your first order.",
         "Burns Park is free travel. Greater Ann Arbor (48104/48103/48105) adds $5.",
       ],
@@ -316,8 +321,8 @@
       id: "waxExplain",
       prompt: () => [
         "Quick rundown:",
-        "• Ceramic spray sealant — slicker finish, beads water, lasts 3–4 months.",
-        "Ceramic seal is included in Essential ($90) and Premium ($200).",
+        "• Spray wax — slicker finish, more gloss, a few weeks of protection. Included in Essential.",
+        "• Ceramic coat — the durable, months-long protection. That's the Premium package.",
       ],
       options: [
         { label: "Add wax/sealant — yes", value: "yes", next: () => "headlights" },
@@ -412,10 +417,10 @@
 
     // ---- Tier selection (paint-focused) ----
     // basic     → just wash (default when nothing exterior-y is going on)
-    // essential → wash + ceramic seal (default when user wants protection
-    //             OR has minor swirls/water spots that the seal helps hide)
-    // premium   → wash + seal + cut and polish (required for dull paint
-    //             or contaminants like tree sap; correction territory)
+    // essential → wash + spray wax (default when user wants gloss/protection
+    //             OR has minor swirls/water spots a fresh wax helps hide)
+    // premium   → full decon + machine polish + ceramic coat (required for
+    //             dull paint or bonded contaminants; correction territory)
     let pkg = "basic";
     if (dullPaint || contaminants) {
       pkg = "premium";  // needs the cut + polish (and clay)
@@ -429,12 +434,19 @@
     // ---- Add-ons ----
     const addons = [];
     const reasons = [];
+    const isQuote = !!QUOTE_TIERS[pkg];
 
-    // Interior detail — the big one. Auto-added when scope includes interior,
-    // OR when user explicitly opted in via _addInterior flag.
+    // Interior — price varies by package ($5 less on Essential). On Premium
+    // it's quoted, not flat-priced.
     if (wantsInterior) {
-      addons.push({ ...ADDONS.interior });
-      if (scope === "interior") reasons.push("Interior detail is the focus.");
+      const intPrice = INTERIOR_PRICE[pkg];
+      if (intPrice == null) {
+        addons.push({ id: "interior", name: "Interior (quoted)", price: 0, quoted: true });
+      } else {
+        addons.push({ id: "interior", name: ADDONS.interior.name, price: intPrice });
+      }
+      if (scope === "interior") reasons.push("Interior is the focus.");
+      if (pkg === "essential") reasons.push("Interior is $5 less on Essential than Basic.");
     }
 
     // Headlight restoration — independent of tier
@@ -443,31 +455,23 @@
       reasons.push("Foggy headlights — added the $30 restoration pass.");
     }
 
-    // Interior-dependent add-ons (only if interior is being done)
-    if (wantsInterior && lotsPetHair) {
-      addons.push({ ...ADDONS.petHair });
-      reasons.push("Heavy pet hair takes extra time — added $20.");
-    }
-    if (wantsInterior && heavyStains) {
-      addons.push({ ...ADDONS.heavyStain });
-      reasons.push("Heavy stains need spot treatment — added $25.");
-    }
-    if (wantsInterior && (a.seats === "leather" || a.seats === "mix") && pkg !== "premium") {
-      // Leather conditioning is included in Premium, otherwise it's a $15 add
-      addons.push({ ...ADDONS.leather });
-      reasons.push("Leather seats — added a $15 conditioning pass.");
+    // Clay bar — when paint has bonded contaminants and the tier doesn't
+    // already include it (Premium clays everything).
+    if (contaminants && pkg !== "premium") {
+      addons.push({ ...ADDONS.claybar });
+      reasons.push("Bonded contaminants in the paint — a clay bar (+$20) pulls them out before sealing.");
     }
 
-    // Soft suggestion when interior is rough but not yet disaster
-    if (wantsInterior && disasterInt) {
-      reasons.push("Disaster-zone interior — Ellis will spend extra time, no surcharge unless it's truly hazardous.");
+    // Deep interior signals — no flat upcharge; Ellis quotes these.
+    if (wantsInterior && (lotsPetHair || heavyStains || disasterInt)) {
+      reasons.push("Heavy pet hair, stains, or a rough interior means a deep interior, which Ellis quotes on top.");
     }
 
     // ---- Size note (timing only, no upcharge) ----
     let sizeNote = "";
     if (a.carSize === "fullsize") {
       if (pkg === "basic") sizeNote = " (allow about an hour for full-size)";
-      else if (pkg === "essential") sizeNote = " (about 2 hours on a full-size)";
+      else if (pkg === "essential") sizeNote = " (about 1.5 hours on a full-size)";
       else if (pkg === "premium") sizeNote = " (about 4.5–5 hours on a full-size)";
     }
 
@@ -479,12 +483,11 @@
       ? " (+$5 travel)"
       : (a.location === "nearby" ? " (Ellis will confirm travel after you book)" : "");
 
-    // Bundle discount: applies when the customer pairs interior with any
-    // paint-treating tier (essential or premium) in one visit. Configurable
-    // via CONFIG.bundleDiscount; default $10.
-    const bundleDiscountAmount = (window.CONFIG && Number(window.CONFIG.bundleDiscount)) || 10;
-    const bundleApplied = wantsInterior && (pkg === "essential" || pkg === "premium");
-    const bundleDiscount = bundleApplied ? bundleDiscountAmount : 0;
+    // No bundle discount in the v9 model — the interior incentive is baked
+    // into the lower Essential interior price. Kept as 0 so downstream
+    // display guards (which check > 0) simply never fire.
+    const bundleApplied = false;
+    const bundleDiscount = 0;
 
     // First-time customer discount — % off the subtotal. Tracked in
     // localStorage; once a customer confirms an order, they don't see this
@@ -495,21 +498,17 @@
     const firstTimeDiscount = isFirstTime ? Math.round(preFirstTimeTotal * firstTimeRate) : 0;
     const total = preFirstTimeTotal - firstTimeDiscount;
 
-    // ---- Interior-add upsell (only when exterior-only and customer hasn't already added it) ----
+    // ---- Interior-add upsell (only when exterior-only and not already added) ----
     let bundleOffer = null;
-    if (!wantsInterior && (pkg === "essential" || pkg === "premium" || pkg === "basic")) {
-      // Cost of adding interior post-hoc: interior $50 minus bundle discount
-      // (assuming the tier becomes a "paint+interior" combo, qualifying for the bundle)
-      const intCost = ADDONS.interior.price;
-      // Bundle discount only fires when tier is essential/premium
-      const qualifiesForBundle = pkg === "essential" || pkg === "premium";
-      const effectiveCost = qualifiesForBundle ? intCost - bundleDiscountAmount : intCost;
+    if (!wantsInterior) {
+      const intCost = INTERIOR_PRICE[pkg]; // null on Premium (quoted)
       bundleOffer = {
         addonId: "interior",
         addonName: ADDONS.interior.name,
         addonCost: intCost,
-        effectiveCost,
-        savings: qualifiesForBundle ? bundleDiscountAmount : 0,
+        effectiveCost: intCost,
+        savings: 0,
+        quoted: intCost == null,
       };
     }
 
@@ -524,6 +523,7 @@
       pkgDesc: PACKAGE_DESC[pkg],
       pkgTime: PACKAGE_TIME[pkg] + sizeNote,
       base,
+      isQuote,
       addons,
       addonTotal,
       travel,
@@ -548,7 +548,8 @@
     saveState(state);
 
     const lines = [];
-    lines.push(`Based on your answers, I'd recommend **${rec.pkgLabel}** (${rec.pkgDesc}) — $${rec.base}.`);
+    const baseLabel = rec.isQuote ? `from $${rec.base} (quoted)` : `$${rec.base}`;
+    lines.push(`Based on your answers, I'd recommend **${rec.pkgLabel}** (${rec.pkgDesc}) — ${baseLabel}.`);
     lines.push(`Time: ${rec.pkgTime}.`);
     if (rec.scopeNote) lines.push(rec.scopeNote);
 
@@ -556,7 +557,7 @@
       lines.push("");
       lines.push("Add-ons I'd include:");
       rec.addons.forEach(a => {
-        lines.push(`• ${a.name} — ${a.price ? `$${a.price}` : "quoted by photo"}`);
+        lines.push(`• ${a.name} — ${a.quoted ? "quoted" : (a.price ? `$${a.price}` : "quoted")}`);
       });
     }
 
@@ -585,20 +586,25 @@
     }
 
     lines.push("");
-    lines.push(`Estimated total: **$${rec.total}**`);
+    if (rec.isQuote) {
+      lines.push(`Estimated total: **from $${rec.total}** — Premium is quoted on your car, so Ellis confirms the final number.`);
+    } else {
+      lines.push(`Estimated total: **$${rec.total}**`);
+    }
     lines.push("");
 
     if (rec.bundleOffer) {
       // Exterior-only path — pitch the interior add-on
       const off = rec.bundleOffer;
-      const savingsLine = off.savings > 0
-        ? ` (saves $${off.savings} when bundled with your tier)`
-        : "";
-      lines.push(`Want the inside too? Add interior detail for **+$${off.effectiveCost}**${savingsLine}. Tap the button below.`);
+      if (off.quoted) {
+        lines.push("Want the inside too? Interior on Premium is quoted with the rest of the job. Tap the button below to add it.");
+      } else {
+        lines.push(`Want the inside too? Add interior for **+$${off.effectiveCost}**. Tap the button below.`);
+      }
       lines.push("");
     }
 
-    lines.push("Sound good? Tap below to send the whole plan to Ellis as a text. He'll confirm timing.");
+    lines.push("Sound good? Book your time on the calendar, or tap below to text the plan to Ellis.");
 
     return lines;
   }
@@ -632,7 +638,7 @@
     if (a.scope !== "interior") {
       const extParts = [];
       if (a.exteriorCondition) extParts.push(prettyExteriorCondition(a.exteriorCondition));
-      if (a.wax === "yes") extParts.push("wants ceramic seal");
+      if (a.wax === "yes") extParts.push("wants wax/protection");
       if (a.headlights && a.headlights !== "clear") extParts.push(`headlights: ${prettyHeadlights(a.headlights)}`);
       if (extParts.length) lines.push(`Exterior: ${extParts.join(", ")}`);
     }
@@ -646,20 +652,17 @@
     }
 
     lines.push("");
-    lines.push(`Recommended: ${rec.pkgLabel} (${rec.pkgDesc}) — $${rec.base}`);
+    lines.push(`Recommended: ${rec.pkgLabel} (${rec.pkgDesc}) — ${rec.isQuote ? `from $${rec.base} (quoted)` : `$${rec.base}`}`);
     if (rec.addons.length) {
       rec.addons.forEach(ad => {
-        lines.push(`+ ${ad.name}${ad.price ? ` ($${ad.price})` : ""}`);
+        lines.push(`+ ${ad.name}${ad.quoted ? " (quoted)" : (ad.price ? ` ($${ad.price})` : "")}`);
       });
     }
     if (rec.travel > 0) lines.push(`+ Travel ($${rec.travel})`);
-    if (rec.bundleApplied && rec.bundleDiscount > 0) {
-      lines.push(`- Bundle discount (-$${rec.bundleDiscount})`);
-    }
     if (rec.isFirstTime && rec.firstTimeDiscount > 0) {
       lines.push(`- First-time customer ${rec.firstTimeRatePct}% off (-$${rec.firstTimeDiscount})`);
     }
-    lines.push(`Estimated total: $${rec.total}`);
+    lines.push(`Estimated total: ${rec.isQuote ? `from $${rec.total}` : `$${rec.total}`}`);
     lines.push("");
     lines.push("Address: I'll share over text. Thanks!");
 
@@ -723,6 +726,14 @@
     setTimeout(() => a.remove(), 300);
   }
 
+  // Cal.com booking URL for a recommended package. Mirrors config.js.
+  function calUrlForPkg(pkg) {
+    const cfg = window.CONFIG || {};
+    const base = cfg.calBaseUrl || "https://cal.com/elion";
+    const slug = (cfg.calEventBySlug && cfg.calEventBySlug[pkg]) || pkg || "essential";
+    return `${base}/${slug}`;
+  }
+
   // ---- Rendering ----
   let root, panel, log, controls, fab, openedOnce = false, isOpen = false, state;
 
@@ -885,7 +896,13 @@
         controls.appendChild(bundleBtn);
       }
 
-      const sendBtn = makeButton("Text the plan to Ellis", rec && rec.bundleOffer ? "is-ghost" : "is-primary", () => {
+      const bookBtn = makeButton(`Book ${rec.pkgLabel} on the calendar`, "is-primary", () => {
+        const url = calUrlForPkg(rec.pkg);
+        window.open(url, "_blank", "noopener");
+        appendUserMessage(`Opened the calendar for ${rec.pkgLabel} ✓`);
+        renderTerminal();
+      });
+      const sendBtn = makeButton("Or text the plan to Ellis", "is-ghost", () => {
         const body = buildSmsBody(state);
         openSms(body);
         appendUserMessage("Sent the plan to Ellis ✓");
@@ -896,6 +913,7 @@
         renderAlternative();
       });
       const restartBtn = makeButton("Start over", "is-ghost is-small", () => restartChat());
+      controls.appendChild(bookBtn);
       controls.appendChild(sendBtn);
       controls.appendChild(altBtn);
       controls.appendChild(restartBtn);
@@ -981,14 +999,15 @@
     const altBase = PRICES[altPkg];
     const altTime = PACKAGE_TIME[altPkg];
     const altDesc = PACKAGE_DESC[altPkg];
+    const altPriceLabel = QUOTE_TIERS[altPkg] ? `from $${altBase} (quoted)` : `$${altBase}`;
     const lines = [
       `Here's another option:`,
-      `**${PACKAGE_LABEL[altPkg]}** (${altDesc}) — $${altBase}, ${altTime}.`,
+      `**${PACKAGE_LABEL[altPkg]}** (${altDesc}) — ${altPriceLabel}, ${altTime}.`,
       altPkg === "premium"
-        ? "Premium adds the cut and polish on top of the ceramic seal — the right call for dull paint or visible swirls."
+        ? "Premium is the full job: Diablo wheels, clay bar, machine polish, and a ceramic coat. The right call for dull or swirled paint. Quoted on your car."
         : altPkg === "essential"
-          ? "Essential adds a ceramic seal — beads water, protects for 3–4 months. Big jump over just a wash."
-          : "Basic is a thorough hand wash without the seal — quick and clean.",
+          ? "Essential is the Basic wash finished with spray wax — more gloss and a few weeks of protection."
+          : "Basic is a thorough hand wash, wheels to dry. Quick and clean.",
       "Want this one instead, or stick with the original?",
     ];
     appendBotMessage(lines);
@@ -1000,23 +1019,29 @@
       state.recommendation = recommend(state.answers, altPkg);
       appendUserMessage(`Switch to ${PACKAGE_LABEL[altPkg]}`);
       const r = state.recommendation;
-      const summary = [`Switched to **${r.pkgLabel}** — $${r.base}.`];
+      const baseLabel = r.isQuote ? `from $${r.base} (quoted)` : `$${r.base}`;
+      const summary = [`Switched to **${r.pkgLabel}** — ${baseLabel}.`];
       if (r.addons.length) {
         summary.push("Add-ons that still apply:");
-        r.addons.forEach(a => summary.push(`• ${a.name} — ${a.price ? `$${a.price}` : "quoted"}`));
+        r.addons.forEach(a => summary.push(`• ${a.name} — ${a.quoted ? "quoted" : (a.price ? `$${a.price}` : "quoted")}`));
       }
       if (r.travel > 0) summary.push(`Travel: +$${r.travel}`);
-      if (r.bundleApplied && r.bundleDiscount > 0) summary.push(`Bundle: −$${r.bundleDiscount}`);
       if (r.isFirstTime && r.firstTimeDiscount > 0) summary.push(`First-time ${r.firstTimeRatePct}% off: −$${r.firstTimeDiscount}`);
-      summary.push(`Estimated total: **$${r.total}**`);
+      summary.push(r.isQuote ? `Estimated total: **from $${r.total}** (Ellis quotes Premium)` : `Estimated total: **$${r.total}**`);
       appendBotMessage(summary);
-      const sendBtn = makeButton("Text the plan to Ellis", "is-primary", () => {
+      const bookBtn = makeButton(`Book ${r.pkgLabel} on the calendar`, "is-primary", () => {
+        window.open(calUrlForPkg(r.pkg), "_blank", "noopener");
+        appendUserMessage(`Opened the calendar for ${r.pkgLabel} ✓`);
+        renderTerminal();
+      });
+      const sendBtn = makeButton("Or text the plan to Ellis", "is-ghost", () => {
         const body = buildSmsBody(state);
         openSms(body);
         appendUserMessage("Sent the plan to Ellis ✓");
         renderTerminal();
       });
       controls.innerHTML = "";
+      controls.appendChild(bookBtn);
       controls.appendChild(sendBtn);
       controls.appendChild(makeButton("Start over", "is-ghost", () => restartChat()));
     });
