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

diff --git a/app.js b/app.js
index 20cca0f..4762f4f 100644
--- a/app.js
+++ b/app.js
@@ -18,6 +18,33 @@
   const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
   const enc = (s) => encodeURIComponent(s || "");
 
+  // HTML-escape for any config string going into innerHTML. Config is
+  // operator-controlled, but defense in depth (also used by FAQ tokens).
+  function escapeHtml(s) {
+    return String(s ?? "").replace(/[&<>"']/g, c => ({
+      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
+    })[c]);
+  }
+
+  // Add-on helpers. The add-on data model lives in config.addons; these
+  // turn it into per-tier display strings the cards + grid consume.
+  function addonPriceForTier(a, tierId) {
+    if (a.priceByTier && a.priceByTier[tierId] != null) return a.priceByTier[tierId];
+    return a.price;
+  }
+  function addonIsIncluded(a, tierId) {
+    return Array.isArray(a.includedIn) && a.includedIn.includes(tierId);
+  }
+  function addonIsQuoted(a, tierId) {
+    return Array.isArray(a.quotedTiers) && a.quotedTiers.includes(tierId);
+  }
+  function addonsForTier(tierId) {
+    return (cfg.addons || []).filter(a =>
+      (Array.isArray(a.tiers) && a.tiers.includes(tierId)) ||
+      addonIsIncluded(a, tierId)
+    );
+  }
+
   /* 1. Wire SMS / tel / mail links */
 
   const smsBody = `Hi Ellis, I'd like to book a detail. My car is a ____. I'm in Burns Park / 48104. Available: ____.`;
@@ -45,43 +72,99 @@
       const card = document.createElement("article");
       card.className = "bundle" + (b.popular ? " popular" : "");
       const popularBadge = b.popular ? '<span class="popular-badge">Most popular</span>' : "";
-      const bundleSmsBody = `Hi Ellis, I'd like to book the ${b.name} ($${b.price}). My car is a ____. I'm in ____.`;
-      const bundleSms = `sms:${cfg.contact.phoneHref}?&body=${enc(bundleSmsBody)}`;
       const calSlug = (cfg.calEventBySlug && cfg.calEventBySlug[b.id]) || b.id;
       const calBase = cfg.calBaseUrl || "https://cal.com/elion";
       const calUrl = `${calBase}/${calSlug}`;
-      const summary = b.summary ? `<p class="bundle-summary">${b.summary}</p>` : "";
+      const summary = b.summary ? `<p class="bundle-summary">${escapeHtml(b.summary)}</p>` : "";
+
+      // Price: quote tiers (Premium) show "from $200" + a "quoted" meta tag.
+      const isQuote = !!b.quote;
+      const priceHtml = isQuote
+        ? `<span class="bundle-price bundle-price-quote">${escapeHtml(b.priceLabel || ("from $" + b.price))}</span>`
+        : `<span class="bundle-price"><span class="dollar">$</span>${b.price}</span>`;
+      const metaRight = isQuote ? "quoted" : "flat";
+
+      // Per-card add-on hint. Included add-ons (Premium) listed as "included",
+      // optional ones as "+ name $price", interior as a quoted note on Premium.
+      const included = addonsForTier(b.id).filter(a => addonIsIncluded(a, b.id));
+      const optional = addonsForTier(b.id).filter(a => !addonIsIncluded(a, b.id));
+      const optBits = optional.map(a => {
+        if (addonIsQuoted(a, b.id)) return `${escapeHtml(a.name.toLowerCase())} quoted`;
+        return `${escapeHtml(a.name.toLowerCase())} +$${addonPriceForTier(a, b.id)}`;
+      });
+      let hint = "";
+      if (included.length) {
+        hint += `<span class="bundle-addon-inc">${included.map(a => escapeHtml(a.name)).join(" + ")} included.</span> `;
+      }
+      if (optBits.length) {
+        hint += `<span class="bundle-addon-opt">Add ${optBits.join(", ")} in booking.</span>`;
+      }
+      const hintHtml = hint ? `<p class="bundle-addons">${hint}</p>` : "";
+
       card.innerHTML = `
         <span class="tier-accent" data-tier="${b.id}" aria-hidden="true"></span>
         ${popularBadge}
         <header class="bundle-head">
-          <h3 class="bundle-name">${b.name}</h3>
-          <span class="bundle-price"><span class="dollar">$</span>${b.price}</span>
+          <h3 class="bundle-name">${escapeHtml(b.name)}</h3>
+          ${priceHtml}
         </header>
-        <p class="bundle-meta"><span>${b.time}</span><span>flat</span></p>
+        <p class="bundle-meta"><span>${escapeHtml(b.time)}</span><span>${metaRight}</span></p>
         ${summary}
         <ul class="bundle-includes">
-          ${b.includes.map((i) => `<li>${i}</li>`).join("")}
+          ${b.includes.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}
         </ul>
-        <a class="bundle-cta" href="${calUrl}" target="_blank" rel="noopener">Pick a time on calendar</a>
-        <a class="bundle-cta-alt" href="${bundleSms}">or text Ellis</a>
+        ${hintHtml}
+        <a class="bundle-cta" href="${escapeHtml(calUrl)}" target="_blank" rel="noopener">Pick a time on calendar</a>
       `;
       bundlesEl.appendChild(card);
     });
   }
 
-  /* 3. Add-on */
-
-  const addonEl = $("[data-addon]");
-  if (addonEl && cfg.addons && cfg.addons[0]) {
-    const a = cfg.addons[0];
-    const priceLine = a.price == null ? "Quoted" : "$" + a.price;
-    addonEl.innerHTML = `
-      <p class="eyebrow">Add-on</p>
-      <h3 class="extra-name">${a.name}</h3>
-      <span class="extra-price">${priceLine}</span>
-      <p class="extra-desc">${a.description}</p>
-    `;
+  /* 3. Add-ons grid */
+
+  const addonsEl = $("[data-addons]");
+  if (addonsEl && Array.isArray(cfg.addons)) {
+    cfg.addons.forEach((a) => {
+      // Price display. priceByTier (interior) shows a compact range in the
+      // chip; the per-tier breakdown + $5 Essential incentive goes in the
+      // availability line. Flat add-ons show one number.
+      let priceLine;
+      let perTierNote = "";
+      if (a.priceByTier) {
+        const vals = Object.values(a.priceByTier).map(Number);
+        const min = Math.min(...vals), max = Math.max(...vals);
+        priceLine = min === max ? `+$${min}` : `+$${min}–$${max}`;
+        perTierNote = Object.keys(a.priceByTier).map(tier => {
+          const tierName = (cfg.bundles.find(b => b.id === tier) || {}).name || tier;
+          return `$${a.priceByTier[tier]} on ${escapeHtml(tierName)}`;
+        }).join(", ");
+      } else if (a.price == null) {
+        priceLine = "Quoted";
+      } else {
+        priceLine = "+$" + a.price;
+      }
+
+      // Availability line.
+      const onTiers = (a.tiers || []).map(t => (cfg.bundles.find(b => b.id === t) || {}).name || t);
+      const inc = (a.includedIn || []).map(t => (cfg.bundles.find(b => b.id === t) || {}).name || t);
+      let avail = "";
+      if (perTierNote) avail += `${perTierNote}. `;
+      else if (onTiers.length) avail += `On ${onTiers.map(escapeHtml).join(", ")}. `;
+      if (inc.length) avail += `Included in ${inc.map(escapeHtml).join(", ")}.`;
+      const deepNote = (a.id === "interior") ? " Deep interior quoted." : "";
+
+      const card = document.createElement("div");
+      card.className = "addon-card";
+      card.innerHTML = `
+        <div class="addon-card-top">
+          <h4 class="addon-name">${escapeHtml(a.name)}</h4>
+          <span class="addon-price">${priceLine}</span>
+        </div>
+        <p class="addon-desc">${escapeHtml(a.description)}${deepNote}</p>
+        <p class="addon-avail">${avail}</p>
+      `;
+      addonsEl.appendChild(card);
+    });
   }
 
   /* 4. Process bullet lists */
@@ -100,13 +183,8 @@
   // Token substitution for config-driven strings. Keeps the Venmo handle
   // (and any future tokens) in one place at contact.venmo.
   // Single-pass: if a token's value contains another token, it does NOT expand.
-  // Replacement values are HTML-escaped because the output goes into innerHTML
-  // alongside FAQ markup. Config is operator-controlled, but defense in depth.
-  function escapeHtml(s) {
-    return String(s ?? "").replace(/[&<>"']/g, c => ({
-      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
-    })[c]);
-  }
+  // Replacement values are HTML-escaped (escapeHtml defined near top of IIFE)
+  // because the output goes into innerHTML alongside FAQ markup.
   function fillTokens(s) {
     if (!s) return s;
     return s
