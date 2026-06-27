/* ----------------------------------------------------------
   Wyatt Auto Detailing, app.js
   Reads CONFIG (from config.js) and renders the dynamic bits.
   Static JSON-LD lives in index.html; the OfferCatalog is appended
   here so prices stay in sync with config.
   ---------------------------------------------------------- */

(function () {
  "use strict";

  const cfg = window.CONFIG;
  if (!cfg) {
    console.warn("CONFIG not loaded.");
    return;
  }

  const $  = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const enc = (s) => encodeURIComponent(s || "");

  // HTML-escape for any config string going into innerHTML. Config is
  // operator-controlled, but defense in depth (also used by FAQ tokens).
  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  // Add-on helpers. The add-on data model lives in config.addons; these
  // turn it into per-tier display strings the cards + grid consume.
  function addonPriceForTier(a, tierId) {
    if (a.priceByTier && a.priceByTier[tierId] != null) return a.priceByTier[tierId];
    return a.price;
  }
  function addonIsIncluded(a, tierId) {
    return Array.isArray(a.includedIn) && a.includedIn.includes(tierId);
  }
  function addonIsQuoted(a, tierId) {
    return Array.isArray(a.quotedTiers) && a.quotedTiers.includes(tierId);
  }
  function addonsForTier(tierId) {
    return (cfg.addons || []).filter(a =>
      (Array.isArray(a.tiers) && a.tiers.includes(tierId)) ||
      addonIsIncluded(a, tierId)
    );
  }

  /* 1. Wire SMS / tel / mail links */

  const smsBody = `Hi Ellis, I'd like to book a detail. My car is a ____. I'm in Bay View / Petoskey area. Available: ____.`;
  const smsHref = `sms:${cfg.contact.phoneHref}?&body=${enc(smsBody)}`;
  $$("[data-sms-link]").forEach((a) => a.setAttribute("href", smsHref));
  $$("[data-tel-link]").forEach((a) => a.setAttribute("href", `tel:${cfg.contact.phoneHref}`));
  $$("[data-tel-display]").forEach((a) => a.textContent = cfg.contact.phone);
  $$("[data-mailto-link]").forEach((a) => a.setAttribute("href", `mailto:${cfg.contact.email}`));
  $$("[data-mailto-display]").forEach((a) => a.textContent = cfg.contact.email);

  const avail = $("[data-next-available]");
  if (avail) {
    if (cfg.nextAvailable && cfg.nextAvailable.trim()) {
      avail.textContent = cfg.nextAvailable;
    } else {
      avail.parentElement && avail.parentElement.removeChild(avail);
    }
  }

  /* 2. Render bundle cards (editorial layout, no stickers) */

  const bundlesEl = $("[data-bundles]");
  if (bundlesEl) {
    // Reorder: Essential and Premium first, Starter (basic) last.
    const orderedBundles = [
      ...cfg.bundles.filter(b => b.id !== "basic"),
      ...cfg.bundles.filter(b => b.id === "basic"),
    ];
    orderedBundles.forEach((b) => {
      const card = document.createElement("article");
      // Add modifier class for Starter: bundle--starter drives desktop bar + mobile compact
      const starterClass = b.id === "basic" ? " bundle--starter" : "";
      card.className = "bundle" + (b.popular ? " popular" : "") + starterClass;
      const popularBadge = b.popular ? '<span class="popular-badge">Most popular</span>' : "";
      const calSlug = (cfg.calEventBySlug && cfg.calEventBySlug[b.id]) || b.id;
      const calBase = cfg.calBaseUrl || "https://cal.com/elion";
      const calUrl = `${calBase}/${calSlug}`;
      const summary = b.summary ? `<p class="bundle-summary">${escapeHtml(b.summary)}</p>` : "";

      // Price: all tiers now use price ranges. Quote tiers show "quoted" meta tag.
      const isQuote = !!b.quote;
      const priceDisplay = b.priceLabel || (b.priceMin != null ? `$${b.priceMin}\u2013${b.priceMax}` : `$${b.price || 0}`);
      const priceHtml = isQuote
        ? `<span class="bundle-price bundle-price-quote">${escapeHtml(priceDisplay)}</span>`
        : `<span class="bundle-price">${escapeHtml(priceDisplay)}</span>`;
      const metaRight = isQuote ? "quoted" : "price range";
      // Wash check bullet: Essential and Premium get a green checked-checkbox "wash" item
      // at the top of their includes list. Starter (basic) does not.
      const washCheckItem = b.washIncluded
        ? '<li class="bundle-wash-check"><span class="bundle-wash-check-box" aria-hidden="true">&#10003;</span> wash</li>'
        : "";

      // Per-card add-on list. Included add-ons shown as "included" (accent),
      // optional ones show name + price on their own line.
      // Boxed add-ons (Deep clean) get their own box below, not this list.
      const included = addonsForTier(b.id).filter(a => addonIsIncluded(a, b.id));
      const optional = addonsForTier(b.id).filter(a => !addonIsIncluded(a, b.id) && !a.boxed);
      const listItems = [
        ...included.map(a =>
          `<li><span class="addon-name">${escapeHtml(a.name)}:</span> <span class="addon-included">included</span></li>`
        ),
        ...optional.map(a => {
          const price = addonIsQuoted(a, b.id)
            ? `<span class="addon-price">quoted</span>`
            : `<span class="addon-price">$${addonPriceForTier(a, b.id)}</span>`;
          return `<li><span class="addon-name">${escapeHtml(a.name)}:</span> ${price}</li>`;
        }),
      ];
      const hintHtml = listItems.length
        ? `<ul class="bundle-addons bundle-addons-list">${listItems.join("")}</ul>`
        : "";

      card.innerHTML = `
        <span class="tier-accent" data-tier="${b.id}" aria-hidden="true"></span>
        ${popularBadge}
        <header class="bundle-head">
          <h3 class="bundle-name">${escapeHtml(b.name)}</h3>
          ${priceHtml}
        </header>
        <p class="bundle-meta"><span>${escapeHtml(b.time)}</span><span>${metaRight}</span></p>
        ${summary}
        <ul class="bundle-includes">
          ${washCheckItem}
          ${b.includes.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}
        </ul>
        ${hintHtml}
        <a class="bundle-cta" href="${escapeHtml(calUrl)}" target="_blank" rel="noopener">Pick a time on calendar</a>
      `;
      bundlesEl.appendChild(card);
    });
  }

  /* 3. Add-ons grid */

  const addonsEl = $("[data-addons]");
  if (addonsEl && Array.isArray(cfg.addons)) {
    cfg.addons.filter(a => !a.boxed).forEach((a) => {
      // Price display. priceByTier (interior) shows a compact range in the
      // chip; the per-tier breakdown + $5 Essential incentive goes in the
      // availability line. Flat add-ons show one number.
      let priceLine;
      let perTierNote = "";
      if (a.priceByTier && Object.keys(a.priceByTier).length) {
        const vals = Object.values(a.priceByTier).map(Number).filter(Number.isFinite);
        const min = Math.min(...vals), max = Math.max(...vals);
        priceLine = min === max ? `+$${min}` : `+$${min}–$${max}`;
        perTierNote = Object.keys(a.priceByTier).map(tier => {
          const tierName = (cfg.bundles.find(b => b.id === tier) || {}).name || tier;
          return `$${a.priceByTier[tier]} on ${escapeHtml(tierName)}`;
        }).join(", ");
      } else if (a.price == null) {
        priceLine = "Quoted";
      } else {
        priceLine = "+$" + a.price;
      }

      // Availability line.
      const onTiers = (a.tiers || []).map(t => (cfg.bundles.find(b => b.id === t) || {}).name || t);
      const inc = (a.includedIn || []).map(t => (cfg.bundles.find(b => b.id === t) || {}).name || t);
      let avail = "";
      if (perTierNote) avail += `${perTierNote}. `;
      else if (onTiers.length) avail += `On ${onTiers.map(escapeHtml).join(", ")}. `;
      if (inc.length) avail += `Included in ${inc.map(escapeHtml).join(", ")}.`;
      // Dependent add-ons (steam clean -> interior) get a clear tag.
      if (a.requires) {
        const reqName = (cfg.addons.find(x => x.id === a.requires) || {}).name || a.requires;
        avail += ` Add to ${escapeHtml(reqName.toLowerCase())}.`;
      }

      const card = document.createElement("div");
      card.className = "addon-card" + (a.boxed ? " addon-card--boxed" : "");
      const boxedTag = a.boxed ? `<span class="addon-quoted-tag">Quoted</span>` : "";
      card.innerHTML = `
        <div class="addon-card-top">
          <h4 class="addon-name">${escapeHtml(a.name)}${boxedTag}</h4>
          <span class="addon-price">${priceLine}</span>
        </div>
        <p class="addon-desc">${escapeHtml(a.description)}</p>
        <p class="addon-avail">${avail.trim()}</p>
      `;
      addonsEl.appendChild(card);
    });
  }

  /* 3b. Boxed add-ons (Deep clean) get their own highlighted box, set apart
        from the flat-priced grid, matching the /services page treatment. */
  const boxedEl = $("[data-addon-boxed]");
  if (boxedEl && Array.isArray(cfg.addons)) {
    cfg.addons.filter(a => a.boxed).forEach((a) => {
      const box = document.createElement("div");
      box.className = "svc-deepclean";
      box.innerHTML = `
        <div class="svc-deepclean-head">
          <h3>${escapeHtml(a.name)}</h3>
          <span class="addon-quoted-tag">Quoted</span>
        </div>
        <p>${escapeHtml(a.description)}</p>
        <p class="muted small">Mention it when you book, or send Ellis a photo. He gives you the number before any work starts.</p>
      `;
      boxedEl.appendChild(box);
    });
  }

  /* 4. Process bullet lists */

  const bringEl = $("[data-bring]");
  if (bringEl && cfg.process && cfg.process.iBring) {
    bringEl.innerHTML = cfg.process.iBring.map((i) => `<li>${escapeHtml(i)}</li>`).join("");
  }
  const youEl = $("[data-you]");
  if (youEl && cfg.process && cfg.process.youProvide) {
    youEl.innerHTML = cfg.process.youProvide.map((i) => `<li>${escapeHtml(i)}</li>`).join("");
  }

  /* 5. FAQ */

  // Token substitution for config-driven strings. Keeps the Venmo handle
  // (and any future tokens) in one place at contact.venmo.
  // Single-pass: if a token's value contains another token, it does NOT expand.
  // Replacement values are HTML-escaped (escapeHtml defined near top of IIFE)
  // because the output goes into innerHTML alongside FAQ markup.
  function fillTokens(s) {
    if (!s) return s;
    return s
      .replace(/\{\{VENMO\}\}/g,     escapeHtml((cfg.contact && cfg.contact.venmo)     || "@Ellis-Wyatt-2"))
      .replace(/\{\{VENMO_SLUG\}\}/g,escapeHtml((cfg.contact && cfg.contact.venmoSlug) || "Ellis-Wyatt-2"))
      .replace(/\{\{PHONE\}\}/g,     escapeHtml((cfg.contact && cfg.contact.phone)     || "(628) 252-0740"));
  }

  const faqEl = $("[data-faq]");
  if (faqEl && cfg.faq) {
    cfg.faq.forEach((item) => {
      const d = document.createElement("details");
      d.className = "faq-item";
      d.innerHTML = `
        <summary>${fillTokens(item.q)}</summary>
        <div class="faq-answer">${fillTokens(item.a)}</div>
      `;
      faqEl.appendChild(d);
    });
  }

  /* 6. Referral */

  const refHead = $("[data-referral-headline]");
  const refBody = $("[data-referral-body]");
  const refShare = $("[data-referral-share]");
  if (cfg.referral) {
    if (refHead) refHead.textContent = cfg.referral.headline;
    if (refBody) refBody.textContent = cfg.referral.body;
    if (refShare) {
      const liveUrl = (cfg.referral.shareUrl && cfg.referral.shareUrl.trim()) ||
                      (window.location.origin + "/");
      const sms = `sms:?&body=${enc(cfg.referral.shareText + " " + liveUrl)}`;
      refShare.setAttribute("href", sms);
    }
  }

  /* 7. (removed) The old #bookForm mailto handler is gone — ordering runs
        through Cal.com now (see /book). The dormant form was deleted from
        index.html, so there's nothing to wire here. */

  /* 8. (removed) OfferCatalog is now authored statically inside the home
        @graph JSON-LD (LocalBusiness #business hasOfferCatalog), so crawlers
        and AI answer engines see prices in raw HTML without running JS. We no
        longer mutate the JSON-LD at runtime (that would break the @graph). */

  /* 9. [removed] Sticky CTA was here

  /* 10. Year in footer (also pre-filled in HTML for no-JS) */

  const y = $("#year");
  if (y) y.textContent = String(new Date().getFullYear());

})();
