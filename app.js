/* ----------------------------------------------------------
   Elion Car Care, app.js
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

  /* 1. Wire SMS / tel / mail links */

  const smsBody = `Hi Ellis, I'd like to book a detail. My car is a ____. I'm in Burns Park / 48104. Available: ____.`;
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
    cfg.bundles.forEach((b) => {
      const card = document.createElement("article");
      card.className = "bundle" + (b.popular ? " popular" : "");
      const popularBadge = b.popular ? '<span class="popular-badge">Most popular</span>' : "";
      const bundleSmsBody = `Hi Ellis, I'd like to book the ${b.name} ($${b.price}). My car is a ____. I'm in ____.`;
      const bundleSms = `sms:${cfg.contact.phoneHref}?&body=${enc(bundleSmsBody)}`;
      const summary = b.summary ? `<p class="bundle-summary">${b.summary}</p>` : "";
      card.innerHTML = `
        <span class="tier-accent" data-tier="${b.id}" aria-hidden="true"></span>
        ${popularBadge}
        <header class="bundle-head">
          <h3 class="bundle-name">${b.name}</h3>
          <span class="bundle-price"><span class="dollar">$</span>${b.price}</span>
        </header>
        <p class="bundle-meta"><span>${b.time}</span><span>flat</span></p>
        ${summary}
        <ul class="bundle-includes">
          ${b.includes.map((i) => `<li>${i}</li>`).join("")}
        </ul>
        <a class="bundle-cta" href="${bundleSms}">Text to book</a>
      `;
      bundlesEl.appendChild(card);
    });
  }

  /* 3. Add-on */

  const addonEl = $("[data-addon]");
  if (addonEl && cfg.addons && cfg.addons[0]) {
    const a = cfg.addons[0];
    const priceLine = a.price == null ? "Quoted" : "$" + a.price;
    addonEl.innerHTML = `
      <p class="eyebrow">Add-on</p>
      <h3 class="extra-name">${a.name}</h3>
      <span class="extra-price">${priceLine}</span>
      <p class="extra-desc">${a.description}</p>
    `;
  }

  /* 4. Process bullet lists */

  const bringEl = $("[data-bring]");
  if (bringEl && cfg.process && cfg.process.iBring) {
    bringEl.innerHTML = cfg.process.iBring.map((i) => `<li>${i}</li>`).join("");
  }
  const youEl = $("[data-you]");
  if (youEl && cfg.process && cfg.process.youProvide) {
    youEl.innerHTML = cfg.process.youProvide.map((i) => `<li>${i}</li>`).join("");
  }

  /* 5. FAQ */

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

  /* 7. Form: Formspree if configured, otherwise mailto + inline confirmation. */

  const form = $("#bookForm");
  if (form) {
    if (cfg.formspreeId && cfg.formspreeId.trim()) {
      form.setAttribute("action", `https://formspree.io/f/${cfg.formspreeId.trim()}`);
      form.removeAttribute("enctype");
    } else {
      form.addEventListener("submit", function (ev) {
        if (!form.checkValidity()) return; // let browser show native validation
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
        const subject = "Elion Car Care booking";
        const mailto = `mailto:${cfg.contact.email}?subject=${enc(subject)}&body=${enc(lines)}`;

        // Trigger mailto via a hidden anchor click. This works on iOS Safari
        // without forcing a hard navigation that wipes the page.
        const a = document.createElement("a");
        a.href = mailto;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Replace the form with an inline confirmation so the user sees feedback
        // even if their mail app handled the navigation in a separate context.
        const confirm = document.createElement("div");
        confirm.className = "book-confirm";
        confirm.setAttribute("role", "status");
        confirm.setAttribute("aria-live", "polite");
        confirm.innerHTML = `
          <p class="eyebrow">Sent</p>
          <h3 class="form-title">Got it. Ellis will text you back.</h3>
          <p class="book-confirm-lead">Usually inside an hour. If your mail app didn't open, text Ellis directly:</p>
          <a class="btn btn-primary btn-lg" href="sms:${cfg.contact.phoneHref}">Text ${cfg.contact.phone}</a>
        `;
        form.replaceWith(confirm);
      });
    }
  }

  /* 8. Append OfferCatalog to the existing JSON-LD */

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
  } catch (e) { /* leave static JSON-LD alone if parsing fails */ }

  /* 9. Sticky CTA: hide and remove from a11y tree when book section is visible */

  const sticky = $(".sticky-cta");
  const hero = $(".hero");
  const book = $("#book");
  if (sticky && "IntersectionObserver" in window) {
    let heroVisible = true;
    let bookVisible = false;
    function update() {
      const hidden = heroVisible || bookVisible;
      sticky.classList.toggle("is-hidden", hidden);
      if (hidden) {
        sticky.setAttribute("aria-hidden", "true");
        sticky.setAttribute("tabindex", "-1");
      } else {
        sticky.removeAttribute("aria-hidden");
        sticky.removeAttribute("tabindex");
      }
    }
    if (hero) {
      const heroIo = new IntersectionObserver((entries) => {
        heroVisible = entries[0].isIntersecting;
        update();
      }, { threshold: 0.1 });
      heroIo.observe(hero);
    } else {
      heroVisible = false;
    }
    if (book) {
      const bookIo = new IntersectionObserver((entries) => {
        bookVisible = entries[0].isIntersecting;
        update();
      }, { rootMargin: "0px 0px -20% 0px", threshold: 0 });
      bookIo.observe(book);
    }
    update();
  }

  /* 10. Year in footer (also pre-filled in HTML for no-JS) */

  const y = $("#year");
  if (y) y.textContent = String(new Date().getFullYear());

})();
