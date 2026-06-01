/* ============================================================
   services.js — /services "What's included" page
   ------------------------------------------------------------
   Renders the packages accordion + the add-ons grid from CONFIG
   so prices never drift from the booking page. Deep clean has its
   own static box in the HTML (it is always quoted), so it is
   filtered out of the add-on grid here.
   ============================================================ */
(function () {
  "use strict";

  const cfg = window.CONFIG;
  if (!cfg) { console.warn("CONFIG not loaded."); return; }

  const $ = (sel) => document.querySelector(sel);

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  const tierName = (id) => (cfg.bundles.find(b => b.id === id) || {}).name || id;
  const addonIsIncluded = (a, t) => Array.isArray(a.includedIn) && a.includedIn.includes(t);
  const addonIsQuoted   = (a, t) => Array.isArray(a.quotedTiers) && a.quotedTiers.includes(t);
  const addonPriceForTier = (a, t) =>
    (a.priceByTier && a.priceByTier[t] != null) ? a.priceByTier[t] : a.price;

  function addonsForTier(tierId) {
    return (cfg.addons || []).filter(a =>
      (Array.isArray(a.tiers) && a.tiers.includes(tierId)) || addonIsIncluded(a, tierId)
    );
  }

  /* ---- Packages accordion ---- */
  const pkgEl = $("[data-svc-packages]");
  if (pkgEl) {
    cfg.bundles.forEach((b, i) => {
      const priceLabel = b.quote ? escapeHtml(b.priceLabel || ("from $" + b.price)) : ("$" + b.price);
      const includes = (b.includes || []).map(x => `<li>${escapeHtml(x)}</li>`).join("");

      // Add-on lines for this tier: included vs optional.
      const tierAddons = addonsForTier(b.id);
      const incl = tierAddons.filter(a => addonIsIncluded(a, b.id))
        .map(a => escapeHtml(a.name));
      const opt = tierAddons.filter(a => !addonIsIncluded(a, b.id) && !a.boxed).map(a => {
        if (addonIsQuoted(a, b.id) || a.boxed) return `${escapeHtml(a.name)} (quoted)`;
        const p = addonPriceForTier(a, b.id);
        const req = a.requires ? ` (with ${escapeHtml((cfg.addons.find(x => x.id === a.requires) || {}).name || a.requires).toLowerCase()})` : "";
        return `${escapeHtml(a.name)} +$${p}${req}`;
      });

      let addonHtml = "";
      if (incl.length) addonHtml += `<p class="svc-addon-line"><strong>Included:</strong> ${incl.join(", ")}.</p>`;
      if (opt.length) addonHtml += `<p class="svc-addon-line"><strong>Add on:</strong> ${opt.join(", ")}.</p>`;

      const d = document.createElement("details");
      d.className = "faq-item";
      if (i === 0) d.setAttribute("open", "");
      d.innerHTML = `
        <summary>${escapeHtml(b.name)} <span class="svc-pkg-price">${priceLabel}</span></summary>
        <div class="faq-answer">
          <p class="svc-pkg-summary">${escapeHtml(b.summary || "")} <span class="muted">(${escapeHtml(b.time)})</span></p>
          <ul class="bundle-includes">${includes}</ul>
          ${addonHtml}
        </div>`;
      pkgEl.appendChild(d);
    });
  }

  /* ---- Add-ons grid (Deep clean excluded, it has its own box) ---- */
  const addEl = $("[data-svc-addons]");
  if (addEl && Array.isArray(cfg.addons)) {
    cfg.addons.filter(a => !a.boxed).forEach(a => {
      let priceLine, perTierNote = "";
      if (a.priceByTier && Object.keys(a.priceByTier).length) {
        const vals = Object.values(a.priceByTier).map(Number).filter(Number.isFinite);
        const min = Math.min(...vals), max = Math.max(...vals);
        priceLine = min === max ? `+$${min}` : `+$${min}–$${max}`;
        perTierNote = Object.keys(a.priceByTier)
          .map(t => `$${a.priceByTier[t]} on ${escapeHtml(tierName(t))}`).join(", ");
      } else if (a.price == null) {
        priceLine = "Quoted";
      } else {
        priceLine = "+$" + a.price;
      }

      const onTiers = (a.tiers || []).filter(t => !((a.includedIn || []).includes(t)))
        .map(t => escapeHtml(tierName(t)));
      const inc = (a.includedIn || []).map(t => escapeHtml(tierName(t)));
      let avail = "";
      if (perTierNote) avail += `${perTierNote}. `;
      else if (onTiers.length) avail += `On ${onTiers.join(", ")}. `;
      if (inc.length) avail += `Included in ${inc.join(", ")}.`;
      if (a.requires) {
        const reqName = (cfg.addons.find(x => x.id === a.requires) || {}).name || a.requires;
        avail += ` Add to ${escapeHtml(reqName.toLowerCase())}.`;
      }

      const card = document.createElement("div");
      card.className = "addon-card";
      card.innerHTML = `
        <div class="addon-card-top">
          <h4 class="addon-name">${escapeHtml(a.name)}</h4>
          <span class="addon-price">${priceLine}</span>
        </div>
        <p class="addon-desc">${escapeHtml(a.description)}</p>
        <p class="addon-avail">${avail.trim()}</p>`;
      addEl.appendChild(card);
    });
  }
})();
