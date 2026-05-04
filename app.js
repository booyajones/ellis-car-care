/* ----------------------------------------------------------
   Ellis Car Care, app.js
   Reads CONFIG (from config.js) and renders the dynamic bits.
   Also wires up sticky CTA hide, scroll-driven sun, form fallback,
   and the JSON-LD LocalBusiness block.
   ---------------------------------------------------------- */

(function () {
  "use strict";

  const cfg = window.CONFIG;
  if (!cfg) {
    console.warn("CONFIG not loaded. config.js missing or in wrong order.");
    return;
  }

  /* ---------- helpers ---------- */
  const $  = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const fmtPrice = (n) => "$" + n;
  const enc = (s) => encodeURIComponent(s || "");

  /* ---------- 1. Top bar + sticky + book + tel + mail link wiring ---------- */

  // Pre-fill SMS deep link from config.
  const smsBody = `Hi Ellis, I'd like to book a detail. My car is a ____. I'm in Burns Park / 48104. Available days: ____.`;
  const smsHref = `sms:${cfg.contact.phoneHref}?&body=${enc(smsBody)}`;
  $$("[data-sms-link]").forEach((a) => { a.setAttribute("href", smsHref); });

  // Tel and mail links.
  $$("[data-tel-link]").forEach((a) => a.setAttribute("href", `tel:${cfg.contact.phoneHref}`));
  $$("[data-tel-display]").forEach((a) => a.textContent = cfg.contact.phone);
  const mailHref = `mailto:${cfg.contact.email}`;
  $$("[data-mailto-link]").forEach((a) => a.setAttribute("href", mailHref));
  $$("[data-mailto-display]").forEach((a) => a.textContent = cfg.contact.email);

  // Parent backup phone fallback line(s).
  const parentLine = `${cfg.contact.parentName}, ${cfg.contact.parentPhone}`;
  $$("[data-parent-fallback]").forEach((el) => el.textContent = `${cfg.contact.parentName} (Ellis's dad): ${cfg.contact.parentPhone}`);
  $$("[data-parent-footer]").forEach((el) => el.textContent = `Adult contact: ${parentLine}`);

  // Next-available pill in hero.
  const avail = $("[data-next-available]");
  if (avail) {
    if (cfg.nextAvailable && cfg.nextAvailable.trim()) {
      avail.textContent = cfg.nextAvailable;
    } else {
      avail.remove();
    }
  }

  /* ---------- 2. Render bundles ---------- */

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
        <a class="bundle-cta" href="${bundleSms}">Text to book the ${b.name}</a>
      `;
      bundlesEl.appendChild(card);
    });
  }

  /* ---------- 3. Render add-on + season pass ---------- */

  const addonEl = $("[data-addon]");
  if (addonEl && cfg.addons && cfg.addons[0]) {
    const a = cfg.addons[0];
    const priceLine = a.price == null ? "Text Ellis for a quote" : fmtPrice(a.price);
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

  /* ---------- 4. Render FAQ ---------- */

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

  /* ---------- 5. Referral block ---------- */

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

  /* ---------- 6. Form: Formspree or mailto fallback ---------- */

  const form = $("#bookForm");
  if (form) {
    if (cfg.formspreeId && cfg.formspreeId.trim()) {
      form.setAttribute("action", `https://formspree.io/f/${cfg.formspreeId.trim()}`);
    } else {
      // Build a mailto: that pre-fills based on form values when submitted.
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
        // After a moment, navigate to thanks.html so the user has a confirmation.
        setTimeout(() => { window.location.href = "thanks.html"; }, 600);
      });
    }
  }

  /* ---------- 7. JSON-LD: LocalBusiness, AutoDetailing ---------- */

  const ld = {
    "@context": "https://schema.org",
    "@type": "AutoDetailing",
    "name": cfg.business.name,
    "description": cfg.business.description,
    "url": "https://elliscarcare.com/",
    "image": "https://elliscarcare.com/og-image.png",
    "telephone": cfg.contact.phone,
    "email": cfg.contact.email,
    "priceRange": "$",
    "areaServed": [
      {
        "@type": "Place",
        "name": "Burns Park, Ann Arbor, MI"
      },
      {
        "@type": "PostalCode",
        "postalCode": "48104"
      },
      {
        "@type": "PostalCode",
        "postalCode": "48103"
      }
    ],
    "serviceArea": {
      "@type": "GeoCircle",
      "geoMidpoint": {
        "@type": "GeoCoordinates",
        "latitude": cfg.serviceArea.lat,
        "longitude": cfg.serviceArea.lng
      },
      "geoRadius": String(cfg.serviceArea.radiusMeters)
    },
    "hasOfferCatalog": {
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
    }
  };
  const ldEl = document.createElement("script");
  ldEl.type = "application/ld+json";
  ldEl.textContent = JSON.stringify(ld);
  document.head.appendChild(ldEl);

  /* ---------- 8. Scroll-driven sun rotation ---------- */

  const sun = $(".floating-sun");
  if (sun && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    let last = 0;
    let ticking = false;
    function onScroll() {
      last = window.scrollY;
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const deg = (last * 0.06) % 360; // 1deg per ~16px
          sun.style.transform = `rotate(${deg}deg)`;
          ticking = false;
        });
        ticking = true;
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- 9. Sticky CTA hide when book section is visible ---------- */

  const sticky = $(".sticky-cta");
  const book = $("#book");
  if (sticky && book && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) sticky.classList.add("is-hidden");
        else sticky.classList.remove("is-hidden");
      });
    }, { threshold: 0.18 });
    io.observe(book);
  }

  /* ---------- 10. Year in footer ---------- */

  const y = $("#year");
  if (y) y.textContent = String(new Date().getFullYear());

})();
