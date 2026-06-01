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

diff --git a/book.js b/book.js
index 45d34a2..1de282b 100644
--- a/book.js
+++ b/book.js
@@ -1,391 +1,28 @@
 /* ============================================================
-   book.js — Order form behavior for /book
+   book.js — /book page behavior
    ------------------------------------------------------------
-   - Live quote as the user changes tier / scope / add-ons / location
-   - First-time discount detected from localStorage and applied
-   - Bridge to chatbot: if the AI made a recommendation, an
-     "Apply chat plan" button shows up that fills the form
-   - Submit to /api/orders, show confirmation modal with Venmo link
-   ============================================================ */
+   Cal.com is the order system now. This file does two small things:
+
+   1. Cal.com fast-path: clicking a tier button swaps the embedded
+      Cal.com iframe to that tier's event type.
+   2. Renders the "add-ons you can check off" list from CONFIG so the
+      site and the Cal.com booking questions stay described in one place.
 
+   No custom order form, no quote engine, no confirmation modal — all
+   ordering (tier + time + add-ons + interior) happens inside the
+   Cal.com booking. Add-ons are Cal.com booking questions on each event.
+   The chat "Open AI planner" button is wired by chatbot.js, not here.
+   ============================================================ */
 (function () {
   "use strict";
 
-  const FIRSTTIME_KEY = "elion_firsttime_used";
-
-  const PRICES = { basic: 40, essential: 90, premium: 200 };
-  const ADDON_PRICES = { interior: 50, headlight: 30, pethair: 20, stain: 25, leather: 15 };
-  const TIER_LABEL = { basic: "Basic", essential: "Essential", premium: "Premium" };
-  const ADDON_LABEL = {
-    interior: "Interior detail",
-    headlight: "Headlight restoration",
-    pethair: "Heavy pet hair removal",
-    stain: "Heavy stain treatment",
-    leather: "Leather conditioning",
-  };
-
-  // ---- DOM ----
-  let form, submitBtn, modal;
-  const q = {};
-
-  function isFirstTime() {
-    try { return !localStorage.getItem(FIRSTTIME_KEY); }
-    catch { return true; }
-  }
-  function markFirstTimeUsed() {
-    try { localStorage.setItem(FIRSTTIME_KEY, new Date().toISOString()); }
-    catch {}
-  }
-
-  // ---- Pricing (mirrors server-side computePricing) ----
-  function compute(state) {
-    const tier = state.tier;
-    if (!tier || !PRICES[tier]) {
-      return { ok: false, tier: null, base: 0, addons: [], addonTotal: 0, travel: 0, bundleDiscount: 0, firstTimeDiscount: 0, total: 0 };
-    }
-    const base = PRICES[tier];
-
-    // Auto-include interior when scope says so
-    const set = new Set(state.addons);
-    if (state.scope === "interior" || state.scope === "both") set.add("interior");
-    // Filter dependent add-ons that need interior
-    if (!set.has("interior")) {
-      ["pethair", "stain", "leather"].forEach(id => set.delete(id));
-    }
-    // Leather is free with premium
-    if (set.has("leather") && tier === "premium") set.delete("leather");
-
-    const addons = [...set].map(id => ({ id, price: ADDON_PRICES[id] }));
-    const addonTotal = addons.reduce((s, a) => s + a.price, 0);
-    const travel = state.location === "annarbor" ? 5 : 0;
-
-    const hasInterior = set.has("interior");
-    const bundleEligible = hasInterior && (tier === "essential" || tier === "premium");
-    const bundleDiscount = bundleEligible ? 10 : 0;
-
-    const subtotalPre = base + addonTotal + travel - bundleDiscount;
-    const ft = isFirstTime();
-    const firstTimeDiscount = ft ? Math.round(subtotalPre * 0.25) : 0;
-    const total = subtotalPre - firstTimeDiscount;
-
-    return { ok: true, tier, base, addons, addonTotal, travel, bundleDiscount, firstTimeDiscount, total, firstTime: ft, hasInterior };
-  }
-
-  // ---- Read form state ----
-  function readState() {
-    const tier = form.querySelector('input[name="tier"]:checked')?.value || null;
-    const scope = form.querySelector('input[name="scope"]:checked')?.value || "exterior";
-    const location = form.querySelector('input[name="location"]:checked')?.value || "burns";
-    const addons = Array.from(form.querySelectorAll('input[name="addons"]:checked')).map(i => i.value);
-    return { tier, scope, location, addons };
-  }
-
-  // ---- Render live quote ----
-  function renderQuote() {
-    const state = readState();
-    const p = compute(state);
-
-    q.tier.textContent = p.tier ? `${TIER_LABEL[p.tier]} ($${p.base})` : "Pick a tier above";
-
-    const addonText = p.addons.length
-      ? p.addons.map(a => `${ADDON_LABEL[a.id] || a.id} ($${a.price})`).join(", ")
-      : "(none)";
-    q.addons.textContent = addonText;
-
-    q.travel.textContent = p.travel ? `+$${p.travel}` : "$0";
-
-    if (p.bundleDiscount > 0) {
-      q.bundleRow.hidden = false;
-      q.bundle.textContent = `−$${p.bundleDiscount}`;
-    } else {
-      q.bundleRow.hidden = true;
-    }
-
-    if (p.firstTimeDiscount > 0) {
-      q.firsttimeRow.hidden = false;
-      q.firsttime.textContent = `−$${p.firstTimeDiscount}`;
-    } else {
-      q.firsttimeRow.hidden = true;
-    }
-
-    q.total.textContent = `$${p.total}`;
-    submitBtn.disabled = !p.ok;
-  }
-
-  // ---- Submit ----
-  async function submit(e) {
-    e.preventDefault();
-
-    // Native validity check first
-    if (!form.checkValidity()) {
-      form.reportValidity();
-      return;
-    }
-
-    const state = readState();
-    const data = new FormData(form);
-    const body = {
-      name: data.get("name"),
-      phone: data.get("phone"),
-      email: data.get("email") || "",
-      address: data.get("address"),
-      car: data.get("car") || "",
-      tier: state.tier,
-      scope: state.scope,
-      addons: state.addons,
-      preferred_timing: data.get("preferred_timing") || "",
-      notes: data.get("notes") || "",
-      location: state.location,
-      first_time: isFirstTime(),
-    };
-
-    submitBtn.disabled = true;
-    submitBtn.textContent = "Booking…";
-
-    try {
-      const resp = await fetch("/api/orders", {
-        method: "POST",
-        headers: { "content-type": "application/json" },
-        body: JSON.stringify(body),
-      });
-      const result = await resp.json();
-      if (!resp.ok || result.error) {
-        showInlineError(result);
-        return;
-      }
-      markFirstTimeUsed();
-      showConfirmation(result.order);
-      form.reset();
-      renderQuote();
-      // Intentionally leave submitBtn disabled until the user closes the
-      // confirmation modal — prevents accidental double-booking.
-      submitBtn.textContent = "Booked ✓";
-      return;
-    } catch (err) {
-      showInlineError({ error: "network", detail: String(err.message || err) });
-    }
-    // Only re-enable on the error path
-    submitBtn.disabled = false;
-    submitBtn.textContent = "Book this wash";
-  }
-
-  function showInlineError(result) {
-    const map = {
-      rate_limited: "Hold up, you've sent a lot of requests. Try again in a few minutes, or text Ellis at (628) 252-0740.",
-      daily_cap_reached: "We're at today's booking limit. Text Ellis at (628) 252-0740 and he'll set it up directly.",
-      region_not_supported: "Online booking is US-only. Text Ellis at (628) 252-0740 if you're in Ann Arbor.",
-      invalid_order: "Something is missing in the form. Check the highlighted fields and try again.",
-      storage_not_configured: "Our booking system is offline. Text Ellis at (628) 252-0740.",
-      network: "Lost the connection. Try again, or text Ellis.",
-    };
-    const msg = map[result.error] || (result.detail ? `Couldn't book: ${result.detail}` : "Couldn't book. Try again or text Ellis.");
-    alert(msg);
-  }
-
-  // ---- Confirmation modal ----
-  function showConfirmation(order) {
-    const p = order.pricing || {};
-    const summary = [
-      `<div><strong>${TIER_LABEL[order.tier] || order.tier}</strong> ($${p.base})</div>`,
-      ...(p.addons || []).map(a => `<div>+ ${ADDON_LABEL[a.id] || a.id} ($${a.price})</div>`),
-      p.travel ? `<div>+ Travel ($${p.travel})</div>` : "",
-      p.bundle_discount ? `<div>− Bundle discount (−$${p.bundle_discount})</div>` : "",
-      p.first_time_discount ? `<div>− First-time ${p.first_time_rate_pct}% off (−$${p.first_time_discount})</div>` : "",
-      `<div class="confirm-total"><strong>Total: $${p.total}</strong></div>`,
-    ].filter(Boolean).join("");
-
-    modal.querySelector("[data-confirm-summary]").innerHTML = summary;
-    modal.querySelector("[data-confirm-order-id]").textContent = `Order ${order.id}`;
-    modal.querySelector("[data-confirm-id-bare]").textContent = order.id;
-    modal.querySelector("[data-confirm-amount]").textContent = `$${p.total}`;
-    const venmoNote = `Elion Car Care order ${order.id.replace(/^ord_/, "")}`;
-    modal.querySelector("[data-confirm-venmo-note]").textContent = venmoNote;
-
-    // Venmo deep link + handle (single source of truth: config.js)
-    const venmoHandle = (window.CONFIG && window.CONFIG.contact && window.CONFIG.contact.venmo) || "@Ellis-Wyatt-2";
-    const venmoSlug = (window.CONFIG && window.CONFIG.contact && window.CONFIG.contact.venmoSlug) || venmoHandle.replace(/^@/, "");
-    modal.querySelectorAll("[data-venmo-handle]").forEach(el => { el.textContent = venmoHandle; });
-    const venmoUrl = `https://venmo.com/${venmoSlug}?txn=pay&amount=${p.total}&note=${encodeURIComponent(venmoNote)}`;
-    modal.querySelector("[data-venmo-link]").href = venmoUrl;
-
-    // Cal.com booking link, tier-aware + prefilled with what we already know
-    const calLink = modal.querySelector("[data-cal-link]");
-    if (calLink) {
-      const cfg = window.CONFIG || {};
-      const slugMap = cfg.calEventBySlug || {};
-      const slug = slugMap[order.tier];
-      if (!order.tier) {
-        // No tier on the order — shouldn't happen since the form requires it.
-        console.warn(`[cal] order has no tier; falling back to /elion`);
-      } else if (!slug) {
-        // Catch config drift early — a bundle id with no slug map entry means
-        // the Cal.com event type wasn't created or the key was misspelled.
-        console.warn(`[cal] no calEventBySlug entry for tier "${order.tier}", falling back to /elion`);
-      }
-      const calBase = cfg.calBaseUrl || "https://cal.com/elion";
-      const notes = [
-        `Order ${order.id}`,
-        order.car ? `Car: ${order.car}` : "",
-        order.scope ? `Scope: ${order.scope}` : "",
-        (order.addons && order.addons.length) ? `Add-ons: ${order.addons.join(", ")}` : "",
-      ].filter(Boolean).join(" | ");
-      const params = new URLSearchParams();
-      if (order.name)    params.set("name", order.name);
-      if (order.email)   params.set("email", order.email);
-      if (order.phone)   params.set("smsReminderNumber", order.phone);
-      if (order.address) params.set("location", order.address);
-      if (notes)         params.set("notes", notes);
-      const calUrl = slug ? `${calBase}/${slug}?${params.toString()}` : `${calBase}?${params.toString()}`;
-      calLink.href = calUrl;
-
-      const tierLabel = (order.tier || "your wash").replace(/^\w/, c => c.toUpperCase());
-      const durationMap = cfg.calDurationLabel || {};
-      const duration = durationMap[order.tier];
-      if (slug && !duration) {
-        // Slug exists but duration map is missing this tier — the CTA will
-        // still work, but the label loses the "(about 45 min)" suffix.
-        console.warn(`[cal] no calDurationLabel entry for tier "${order.tier}"`);
-      }
-      calLink.textContent = duration
-        ? `Pick a time for ${tierLabel} (about ${duration})`
-        : `Pick a time for ${tierLabel}`;
-    }
-
-    modal.setAttribute("aria-hidden", "false");
-    modal.classList.add("is-open");
-  }
-
-  function closeConfirm() {
-    modal.setAttribute("aria-hidden", "true");
-    modal.classList.remove("is-open");
-  }
-
-  // ---- Bridge: apply AI chat plan to form ----
-  // When the AI chatbot lands on its recommendation, expose an "Apply" path.
-  // Listens for a custom event the chatbot can dispatch (we'll wire it later).
-  function applyChatRecommendation() {
-    const ec = window.ElionChat || window.EllisChat;
-    if (!ec || typeof ec._state !== "function") return false;
-    const s = ec._state();
-    const rec = s.recommendation;
-    if (!rec || !rec.pkg) return false;
-    const a = s.answers || {};
-
-    // Set tier
-    const tierInput = form.querySelector(`input[name="tier"][value="${rec.pkg}"]`);
-    if (tierInput) tierInput.checked = true;
-
-    // Set scope
-    const scope = a.scope || "exterior";
-    const scopeInput = form.querySelector(`input[name="scope"][value="${scope}"]`);
-    if (scopeInput) scopeInput.checked = true;
-
-    // Set add-ons (uncheck all first, then check recommended)
-    form.querySelectorAll('input[name="addons"]').forEach(i => i.checked = false);
-    (rec.addons || []).forEach(ad => {
-      const input = form.querySelector(`input[name="addons"][value="${ad.id}"]`);
-      if (input) input.checked = true;
-    });
-
-    // Set location
-    if (a.location) {
-      const li = form.querySelector(`input[name="location"][value="${a.location}"]`);
-      if (li) li.checked = true;
-    }
-
-    // Set car
-    if (a.carModel) form.querySelector('input[name="car"]').value = a.carModel;
-    // Notes
-    if (a.notes) form.querySelector('textarea[name="notes"]').value = a.notes;
-    // Timing (free text)
-    if (a.timing) {
-      const t = ({ thisweek: "this week", weekend: "this weekend", nextweek: "next week", flexible: "flexible" })[a.timing] || a.timing;
-      form.querySelector('input[name="preferred_timing"]').value = t;
-    }
-
-    renderQuote();
-    // Scroll back to the form
-    form.scrollIntoView({ behavior: "smooth", block: "start" });
-    return true;
-  }
-
-  // Poll for chat recommendation availability — show "Apply" button when ready
-  let applyBtn = null;
-  function maybeShowApplyButton() {
-    const ec = window.ElionChat || window.EllisChat;
-    if (!ec) return;
-    const s = ec._state && ec._state();
-    if (!s || !s.recommendation) {
-      if (applyBtn) applyBtn.remove(), applyBtn = null;
-      return;
-    }
-    if (applyBtn) return; // already shown
-    const aside = document.querySelector(".book-ai .book-ai-body");
-    if (!aside) return;
-    applyBtn = document.createElement("button");
-    applyBtn.type = "button";
-    applyBtn.className = "btn btn-primary";
-    applyBtn.style.marginTop = "10px";
-    applyBtn.textContent = "Apply AI plan to form";
-    applyBtn.addEventListener("click", () => {
-      if (applyChatRecommendation()) {
-        applyBtn.textContent = "Plan applied ✓";
-        applyBtn.disabled = true;
-        setTimeout(() => {
-          applyBtn?.remove();
-          applyBtn = null;
-        }, 1500);
-      }
-    });
-    aside.appendChild(applyBtn);
-  }
-
-  // ---- Slot picker ----
-  function renderSlotDays() {
-    const container = form.querySelector("[data-slot-days]");
-    if (!container) return;
-    const today = new Date();
-    const days = [];
-    // Next 14 days. Skip Sundays. First option is "ASAP".
-    days.push({ key: "asap", label: "ASAP", sub: "Whenever Ellis can" });
-    for (let i = 0; i < 14 && days.length < 9; i++) {
-      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
-      if (d.getDay() === 0) continue; // Sunday — Ellis doesn't work
-      const isoDate = d.toISOString().slice(0, 10);
-      const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
-      const monthDay = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
-      const isToday = i === 0;
-      const isTomorrow = i === 1;
-      days.push({
-        key: isoDate,
-        label: isToday ? "Today" : isTomorrow ? "Tomorrow" : weekday,
-        sub: monthDay,
-      });
-    }
-    container.innerHTML = days.map((d, i) => `
-      <label class="slot-chip">
-        <input type="radio" name="slot_day" value="${d.key}"${i === 0 ? " checked" : ""}>
-        ${d.label}
-        <span class="slot-chip-sub">${d.sub}</span>
-      </label>
-    `).join("");
-  }
-
-  function updateSlotFormatted() {
-    const day = form.querySelector('input[name="slot_day"]:checked');
-    const time = form.querySelector('input[name="slot_time"]:checked');
-    const formatted = form.querySelector("[data-slot-formatted]");
-    if (!day || !time || !formatted) return;
-    const dayLabel = day.closest(".slot-chip").childNodes[0]?.textContent?.trim() ||
-                     day.parentElement?.textContent?.trim() ||
-                     day.value;
-    const timeLabel = time.value === "flexible" ? "flexible time" : time.value;
-    formatted.value = day.value === "asap" ? "ASAP / Flexible" : `${dayLabel} ${day.value !== "asap" ? "(" + day.value + ")" : ""} ${timeLabel}`.trim();
+  function escapeHtml(s) {
+    return String(s ?? "").replace(/[&<>"']/g, c => ({
+      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
+    })[c]);
   }
 
   // ---- Cal.com fast-path tier switcher ----
-  // The /book page now leads with an inline Cal.com embed.
-  // Clicking a tier button swaps the iframe src to the matching event type.
   function initCalFastPath() {
     const buttons = document.querySelectorAll("[data-cal-tier]");
     const frame = document.getElementById("cal-embed-frame");
@@ -397,7 +34,6 @@
 
     function selectTier(tier) {
       const slug = slugMap[tier] || tier;
-      // embed=true tells Cal.com to render the compact embedded view
       frame.src = `${calBase}/${slug}?embed=true`;
       buttons.forEach(b => {
         b.setAttribute("aria-selected", b.dataset.calTier === tier ? "true" : "false");
@@ -409,63 +45,54 @@
     });
   }
 
-  // ---- Init ----
-  function init() {
-    initCalFastPath();
-
-    form = document.getElementById("orderForm");
-    submitBtn = form.querySelector("[data-submit-btn]");
-    modal = document.getElementById("confirmModal");
-
-    q.tier = form.querySelector("[data-quote-tier]");
-    q.addons = form.querySelector("[data-quote-addons]");
-    q.travel = form.querySelector("[data-quote-travel]");
-    q.bundle = form.querySelector("[data-quote-bundle]");
-    q.bundleRow = form.querySelector("[data-quote-bundle-row]");
-    q.firsttime = form.querySelector("[data-quote-firsttime]");
-    q.firsttimeRow = form.querySelector("[data-quote-firsttime-row]");
-    q.total = form.querySelector("[data-quote-total]");
+  // ---- Add-ons list (mirrors the Cal.com booking questions) ----
+  function tierName(cfg, id) {
+    const b = (cfg.bundles || []).find(x => x.id === id);
+    return b ? b.name : id;
+  }
 
-    // First-time banner
-    if (isFirstTime()) {
-      const banner = document.querySelector("[data-firsttime-banner]");
-      if (banner) banner.hidden = false;
-    }
+  function renderBookAddons() {
+    const el = document.querySelector("[data-book-addons]");
+    const cfg = window.CONFIG || {};
+    if (!el || !Array.isArray(cfg.addons)) return;
+
+    el.innerHTML = cfg.addons.map(a => {
+      // Price text + per-tier detail.
+      let price;
+      let detail = "";
+      if (a.priceByTier) {
+        const parts = Object.keys(a.priceByTier).map(t => `$${a.priceByTier[t]} on ${escapeHtml(tierName(cfg, t))}`);
+        const vals = Object.values(a.priceByTier).map(Number);
+        const min = Math.min(...vals), max = Math.max(...vals);
+        price = min === max ? `+$${min}` : `+$${min}–$${max}`;
+        detail = parts.join(", ");
+        if (a.id === "interior") detail += ", deep interior quoted";
+      } else if (a.price == null) {
+        price = "Quoted";
+      } else {
+        price = `+$${a.price}`;
+      }
 
-    // Slot picker
-    renderSlotDays();
-    updateSlotFormatted();
-    form.addEventListener("change", () => { renderQuote(); updateSlotFormatted(); });
-    form.addEventListener("input", renderQuote);
-    form.addEventListener("submit", submit);
+      // Availability text.
+      const onTiers = (a.tiers || [])
+        .filter(t => !((a.includedIn || []).includes(t)))
+        .map(t => escapeHtml(tierName(cfg, t)));
+      const inc = (a.includedIn || []).map(t => escapeHtml(tierName(cfg, t)));
+      let avail = detail || (onTiers.length ? onTiers.join(" & ") : "");
+      if (inc.length) avail += `${avail ? ". " : ""}Included in ${inc.join(" & ")}`;
 
-    // Modal close handlers
-    modal.querySelector(".confirm-close").addEventListener("click", closeConfirm);
-    modal.querySelector("[data-confirm-close]").addEventListener("click", closeConfirm);
-    modal.querySelector("[data-copy-handle]").addEventListener("click", (e) => {
-      const handle = (window.CONFIG && window.CONFIG.contact && window.CONFIG.contact.venmo) || "@Ellis-Wyatt-2";
-      navigator.clipboard?.writeText(handle);
-      const btn = e.currentTarget;
-      btn.textContent = "Copied ✓";
-      setTimeout(() => {
-        // Rebuild label using DOM nodes (no innerHTML) — handle is config-controlled
-        // today but this guards against ever sourcing it from somewhere injectable.
-        btn.replaceChildren();
-        btn.appendChild(document.createTextNode("Copy "));
-        const span = document.createElement("span");
-        span.setAttribute("data-venmo-handle", "");
-        span.textContent = handle;
-        btn.appendChild(span);
-      }, 1500);
-    });
-    document.addEventListener("keydown", (e) => {
-      if (e.key === "Escape" && modal.classList.contains("is-open")) closeConfirm();
-    });
-
-    renderQuote();
+      return `
+        <li class="cal-addon-item">
+          <span class="cal-addon-name">${escapeHtml(a.name)}</span>
+          <span class="cal-addon-price">${price}</span>
+          <span class="cal-addon-avail">${avail}</span>
+        </li>`;
+    }).join("");
+  }
 
-    // Watch for AI chat recommendation availability
-    setInterval(maybeShowApplyButton, 1000);
+  function init() {
+    initCalFastPath();
+    renderBookAddons();
   }
 
   if (document.readyState === "loading") {
