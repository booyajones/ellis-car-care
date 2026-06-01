/* ============================================================
   nav.js — shared topnav + hamburger drawer
   ------------------------------------------------------------
   Auto-injects the topbar (with hamburger on mobile) and the
   footer into elements with data-shared-nav and data-shared-footer.
   This way new pages just need <header data-shared-nav> in the
   markup and the nav stays consistent everywhere.
   ============================================================ */
(function () {
  "use strict";

  const PAGES = [
    { href: "/book",      label: "Book" },
    { href: "/#menu",     label: "Pricing" },
    { href: "/services",  label: "What's included" },
    { href: "/gallery",   label: "Gallery" },
    { href: "/rewards",   label: "Rewards" },
    { href: "/about",     label: "About" },
  ];
  const PHONE = "(628) 252-0740";
  const PHONE_HREF = "+16282520740";
  const SMS_BODY = encodeURIComponent(
    "Hi Ellis, I'd like to book a detail. My car is a ____. I'm in Burns Park / 48104. Available: ____."
  );

  function currentPath() {
    return (location.pathname || "/").replace(/\.html$/, "").replace(/\/$/, "") || "/";
  }

  function buildNav() {
    const here = currentPath();
    const navItems = PAGES.map(p => {
      const active = (p.href === "/" && here === "/") || (p.href !== "/" && here === p.href);
      return `<a href="${p.href}"${active ? ' aria-current="page"' : ""}>${p.label}</a>`;
    }).join("");

    return `
      <a class="brand" href="/" aria-label="Elion Car Care home">
        <span class="brand-stripe" aria-hidden="true"></span>
        <span class="brand-stack">
          <span class="brand-name">Elion</span>
          <span class="brand-mono">Car Care · Ann Arbor</span>
        </span>
      </a>
      <nav class="topnav" aria-label="Primary">${navItems}</nav>
      <a class="topbar-phone" href="tel:${PHONE_HREF}" data-tel-link>${PHONE}</a>
      <button class="hamburger" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="nav-drawer">
        <span aria-hidden="true"></span>
        <span aria-hidden="true"></span>
        <span aria-hidden="true"></span>
      </button>

      <div class="nav-drawer" id="nav-drawer" role="dialog" aria-modal="true" aria-hidden="true" aria-label="Navigation menu">
        <div class="nav-drawer-head">
          <a class="brand" href="/" aria-label="Elion Car Care home">
            <span class="brand-name">Elion Car Care</span>
            <span class="brand-mono">ANN ARBOR · MI</span>
          </a>
          <button class="nav-drawer-close" type="button" aria-label="Close menu">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <nav class="nav-drawer-links" aria-label="Mobile primary">
          ${PAGES.map(p => {
            const active = (p.href === here) || (p.href.startsWith("/#") && here === "/");
            return `<a href="${p.href}"${active ? ' aria-current="page"' : ""}>${p.label}</a>`;
          }).join("")}
        </nav>
        <div class="nav-drawer-cta">
          <a class="btn btn-primary btn-lg" href="/book">Book online</a>
          <a class="btn btn-ghost btn-lg" href="sms:${PHONE_HREF}?body=${SMS_BODY}" data-sms-link>Text Ellis</a>
          <p class="muted small" style="text-align:center;margin:8px 0 0;"><a href="tel:${PHONE_HREF}" data-tel-link>${PHONE}</a></p>
        </div>
      </div>
    `;
  }

  function buildFooter() {
    const year = new Date().getFullYear();
    return `
      <div class="container footer-grid">
        <div>
          <p class="footer-brand">Elion Car Care</p>
          <p class="muted small">Hand-detailed, in your driveway. Ann Arbor.</p>
        </div>
        <div>
          <p><a href="tel:${PHONE_HREF}" data-tel-link>${PHONE}</a></p>
          <p><a href="mailto:info@elioncarcare.com">info@elioncarcare.com</a></p>
        </div>
        <div>
          <p class="muted small">Burns Park, Ann Arbor, MI</p>
          <p class="muted small">Greater Ann Arbor served.</p>
        </div>
      </div>
      <hr class="stripe-rule is-wide" aria-hidden="true">
      <p class="footer-fine muted small">© ${year} ELION CAR CARE · MADE IN ANN ARBOR</p>
    `;
  }

  function ensureSiteStripeTop() {
    if (document.querySelector(".site-stripe-top")) return;
    const bar = document.createElement("div");
    bar.className = "site-stripe-top";
    bar.setAttribute("aria-hidden", "true");
    document.body.insertBefore(bar, document.body.firstChild);
  }

  function bindDrawer(host) {
    const drawer = host.querySelector("#nav-drawer");
    const hamburger = host.querySelector(".hamburger");
    const closeBtn = host.querySelector(".nav-drawer-close");
    if (!drawer || !hamburger) return;

    function open() {
      drawer.classList.add("is-open");
      drawer.setAttribute("aria-hidden", "false");
      hamburger.setAttribute("aria-expanded", "true");
      document.body.classList.add("nav-drawer-open");
      // Focus first link
      const firstLink = drawer.querySelector("a, button");
      if (firstLink) firstLink.focus();
    }
    function close() {
      drawer.classList.remove("is-open");
      drawer.setAttribute("aria-hidden", "true");
      hamburger.setAttribute("aria-expanded", "false");
      document.body.classList.remove("nav-drawer-open");
      hamburger.focus();
    }
    hamburger.addEventListener("click", open);
    if (closeBtn) closeBtn.addEventListener("click", close);
    // Tap outside the drawer content closes (use ::before scrim)
    drawer.addEventListener("click", (e) => { if (e.target === drawer) close(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && drawer.classList.contains("is-open")) close();
    });
  }

  function init() {
    ensureSiteStripeTop();
    const navHost = document.querySelector("[data-shared-nav]");
    if (navHost) {
      navHost.innerHTML = buildNav();
      bindDrawer(navHost);
    }
    const footerHost = document.querySelector("[data-shared-footer]");
    if (footerHost) footerHost.innerHTML = buildFooter();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
