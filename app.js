/* ----------------------------------------------------------
   Ellis Car Care, app.js
   Reads CONFIG (from config.js) and renders the dynamic bits.
   Static JSON-LD lives in index.html. This file only adds the
   bundle-priced OfferCatalog so prices stay in sync with config.
   ---------------------------------------------------------- */

(function () {
  "use strict";

  const cfg = window.CONFIG;
  if (!cfg) {
    console.warn("CONFIG not loaded. config.js missing or in wrong order.");
    return;
  }

  const $  = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const fmtPrice = (n) => "$" + n;
  const enc = (s) => encodeURIComponent(s || "");

  /* 1. SMS, tel, mail link wiring */

  const smsBody = `Hi Ellis, I'd like to book a detail. My car is a ____. I'm in Burns Park / 48104. Available: ____.`;
  const smsHref = `sms:${cfg.contact.phoneHref}?&body=${enc(smsBody)}`;
  $$("[data-sms-link]").forEach((a) => { a.setAttribute("href", smsHref); });

  $$("[data-tel-link]").forEach((a) => a.setAttribute("href", `tel:${cfg.contact.phoneHref}`));
  $$("[data-tel-display]").forEach((a) => a.textContent = cfg.contact.phone);
  const mailHref = `mailto:${cfg.contact.email}`;
  $$("[data-mailto-link]").forEach((a) => a.setAttribute("href", mailHref));
  $$("[data-mailto-display]").forEach((a) => a.textContent = cfg.contact.email);

  const avail = $("[data-next-available]");
  if (avail) {
    if (cfg.nextAvailable && cfg.nextAvailable.trim()) {
      avail.textContent = cfg.nextAvailable;
    } else {
      avail.remove();
    }
  }

  /* 2. Render bundle cards */

  const bundlesEl = $("[data-bundles]");
  if (bundlesEl) {
    cfg.bundles.forEach((b) => {
      const card = document.createElement("article");
      card.className = "bundle" + (b.popular ? " popular" : "");
      const popularBadge = b.popular ? '<span class="popular-badge">Most popular</span>' : "";
      const bundleSmsBody = `Hi Ellis, I'd like to book the ${b.name} ($${b.price}). My car is a ____. I'm in ____.`;
      const bundleSms = `sms:${cfg.contact.phoneHref}?&body=${enc(bundleSmsBody)}`;
      card.innerHTML = `
        ${popularBadge}
        <span class="sticker" aria-hidden="true">
          <span class="sticker-amount"><span class="dollar">$</span>${b.price}</span>
          <span class="sticker-sub">flat</span>
        </span>
        <h3 class="bundle-name">${b.name}</h3>
        <p class="bundle-time">${b.time}</p>
        <ul class="bundle-includes">
          ${b.includes.map((i) => `<li>${i}</li>`).join("")}
        </ul>
        <a class="bundle-cta" href="${bundleSms}">Text to book ${b.name}</a>
      `;
      bundlesEl.appendChild(card);
    });
  }

  /* 3. Add-on + Season Pass */

  const addonEl = $("[data-addon]");
  if (addonEl && cfg.addons && cfg.addons[0]) {
    const a = cfg.addons[0];
    const priceLine = a.price == null ? "Text for a quote" : fmtPrice(a.price);
    addonEl.innerHTML = `
      <p class="eyebrow">Add-on</p>
      <h3 class="extra-name">${a.name}</h3>
      <p class="extra-price">${priceLine}</p>
      <p class="extra-desc">${a.description}</p>
    `;
  }

  const seasonEl = $("[data-season]");
  if (seasonEl && cfg.seasonPass) {
    const s = cfg.seasonPass;
    seasonEl.innerHTML = `
      <p class="eyebrow">Season pass</p>
      <h3 class="extra-name">${s.name}</h3>
      <p class="extra-price">${fmtPrice(s.price)}</p>
      <p class="extra-desc">${s.description}</p>
    `;
  }

  /* 4. FAQ */

  const faqEl = $("[data-faq]");
  if (faqEl && cfg.faq) {
    cfg.faq.forEach((item) => {
      const d = document.createElement("details");
      d.className = "faq-item";
      d.innerHTML = `
        <summary>${item.q}</summary>
        <div class="faq-answer">${item.a}</div>
      `;
      faqEl.appendChild(d);
    });
  }

  /* 5. Referral */

  const refHead = $("[data-referral-headline]");
  const refBody = $("[data-referral-body]");
  const refShare = $("[data-referral-share]");
  if (cfg.referral) {
    if (refHead) refHead.textContent = cfg.referral.headline;
    if (refBody) refBody.textContent = cfg.referral.body;
    if (refShare) {
      const shareUrl = `sms:?&body=${enc(cfg.referral.shareText + " " + cfg.referral.shareUrl)}`;
      refShare.setAttribute("href", shareUrl);
    }
  }

  /* 6. Form: Formspree if configured, else mailto fallback (HTML form action is also mailto so JS-off works). */

  const form = $("#bookForm");
  if (form) {
    if (cfg.formspreeId && cfg.formspreeId.trim()) {
      form.setAttribute("action", `https://formspree.io/f/${cfg.formspreeId.trim()}`);
      form.removeAttribute("enctype");
    } else {
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        const fd = new FormData(form);
        const services = fd.getAll("services").join(", ") || "(not specified)";
        const lines = [
          `Name: ${fd.get("name") || ""}`,
          `Phone: ${fd.get("phone") || ""}`,
          `Address: ${fd.get("address") || ""}`,
          `Car: ${fd.get("car") || ""}`,
          `Services: ${services}`,
          `Notes: ${fd.get("notes") || ""}`,
        ].join("\n");
        const subject = "Ellis Car Care booking";
        window.location.href = `mailto:${cfg.contact.email}?subject=${enc(subject)}&body=${enc(lines)}`;
        setTimeout(() => { window.location.href = "thanks.html"; }, 600);
      });
    }
  }

  /* 7. Append OfferCatalog to the existing JSON-LD so prices stay in sync with config.js */

  try {
    const existing = $('script[type="application/ld+json"]');
    if (existing) {
      const parsed = JSON.parse(existing.textContent);
      parsed.hasOfferCatalog = {
        "@type": "OfferCatalog",
        "name": "Detailing packages",
        "itemListElement": cfg.bundles.map((b) => ({
          "@type": "Offer",
          "name": b.name,
          "price": String(b.price),
          "priceCurrency": "USD",
          "itemOffered": {
            "@type": "Service",
            "name": b.name,
            "description": b.includes.join("; ")
          }
        }))
      };
      existing.textContent = JSON.stringify(parsed);
    }
  } catch (e) { /* leave the static JSON-LD alone if parsing fails */ }

  /* 8. Scroll-driven sun rotation */

  const sun = $(".floating-sun");
  if (sun && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    let last = 0;
    let ticking = false;
    function onScroll() {
      last = window.scrollY;
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const deg = (last * 0.08) % 360;
          sun.style.transform = `rotate(${deg}deg)`;
          ticking = false;
        });
        ticking = true;
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* 9. Sticky CTA: hide and remove from a11y tree when book is visible */

  const sticky = $(".sticky-cta");
  const book = $("#book");
  if (sticky && book && "IntersectionObserver" in window) {
    function setHidden(hidden) {
      sticky.classList.toggle("is-hidden", hidden);
      if (hidden) {
        sticky.setAttribute("aria-hidden", "true");
        sticky.setAttribute("tabindex", "-1");
      } else {
        sticky.removeAttribute("aria-hidden");
        sticky.removeAttribute("tabindex");
      }
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => setHidden(e.isIntersecting));
    }, { threshold: 0.18 });
    io.observe(book);
  }

  /* 10. Year in footer (also pre-filled in HTML for no-JS) */

  const y = $("#year");
  if (y) y.textContent = String(new Date().getFullYear());

})();
