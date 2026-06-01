/* ============================================================
   book.js — /book page behavior
   ------------------------------------------------------------
   Cal.com is the order system now. This file does two small things:

   1. Cal.com fast-path: clicking a tier button swaps the embedded
      Cal.com iframe to that tier's event type.
   2. Renders the "add-ons you can check off" list from CONFIG so the
      site and the Cal.com booking questions stay described in one place.

   No custom order form, no quote engine, no confirmation modal — all
   ordering (tier + time + add-ons + interior) happens inside the
   Cal.com booking. Add-ons are Cal.com booking questions on each event.
   The chat "Open AI planner" button is wired by chatbot.js, not here.
   ============================================================ */
(function () {
  "use strict";

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  // ---- Cal.com fast-path tier switcher ----
  function initCalFastPath() {
    const buttons = document.querySelectorAll("[data-cal-tier]");
    const frame = document.getElementById("cal-embed-frame");
    if (!buttons.length || !frame) return;

    const cfg = window.CONFIG || {};
    const slugMap = cfg.calEventBySlug || { basic: "basic", essential: "essential", premium: "premium" };
    const calBase = cfg.calBaseUrl || "https://cal.com/elion";

    function selectTier(tier) {
      const slug = slugMap[tier] || tier;
      frame.src = `${calBase}/${slug}?embed=true`;
      buttons.forEach(b => {
        b.setAttribute("aria-selected", b.dataset.calTier === tier ? "true" : "false");
      });
    }

    buttons.forEach(b => {
      b.addEventListener("click", () => selectTier(b.dataset.calTier));
    });
  }

  // ---- Add-ons list (mirrors the Cal.com booking questions) ----
  function tierName(cfg, id) {
    const b = (cfg.bundles || []).find(x => x.id === id);
    return b ? b.name : id;
  }

  function renderBookAddons() {
    const el = document.querySelector("[data-book-addons]");
    const cfg = window.CONFIG || {};
    if (!el || !Array.isArray(cfg.addons)) return;

    el.innerHTML = cfg.addons.map(a => {
      // Price text + per-tier detail.
      let price;
      let detail = "";
      if (a.priceByTier && Object.keys(a.priceByTier).length) {
        const parts = Object.keys(a.priceByTier).map(t => `$${a.priceByTier[t]} on ${escapeHtml(tierName(cfg, t))}`);
        const vals = Object.values(a.priceByTier).map(Number);
        const min = Math.min(...vals), max = Math.max(...vals);
        price = min === max ? `+$${min}` : `+$${min}–$${max}`;
        detail = parts.join(", ");
        if (a.id === "interior") detail += ", deep interior quoted";
      } else if (a.price == null) {
        price = "Quoted";
      } else {
        price = `+$${a.price}`;
      }

      // Availability text.
      const onTiers = (a.tiers || [])
        .filter(t => !((a.includedIn || []).includes(t)))
        .map(t => escapeHtml(tierName(cfg, t)));
      const inc = (a.includedIn || []).map(t => escapeHtml(tierName(cfg, t)));
      let avail = detail || (onTiers.length ? onTiers.join(" & ") : "");
      if (inc.length) avail += `${avail ? ". " : ""}Included in ${inc.join(" & ")}`;

      return `
        <li class="cal-addon-item">
          <span class="cal-addon-name">${escapeHtml(a.name)}</span>
          <span class="cal-addon-price">${price}</span>
          <span class="cal-addon-avail">${avail}</span>
        </li>`;
    }).join("");
  }

  function init() {
    initCalFastPath();
    renderBookAddons();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
