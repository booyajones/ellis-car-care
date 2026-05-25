/* ============================================================
   gallery.js — auto-load before/after photos from images/jobs/
   ------------------------------------------------------------
   Ellis just drops .jpg or .webp files into images/jobs/ named
   like job-01-before.jpg / job-01-after.jpg / job-01.jpg,
   bumps JOBS_COUNT in config.js, and they appear here.

   If no JOBS_COUNT is set in config.js, the page renders 6
   placeholder slots so it never looks broken on first deploy.
   ============================================================ */
(function () {
  "use strict";

  function tryImage(src) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = src;
    });
  }

  async function init() {
    const grid = document.querySelector("[data-gallery]");
    if (!grid) return;

    const count = Number(window.CONFIG?.JOBS_COUNT) || 0;

    if (count > 0) {
      // Try to load each numbered job. Prefer before/after pair; fall back to single.
      for (let i = 1; i <= count; i++) {
        const padded = String(i).padStart(2, "0");
        const beforeWebp = `images/jobs/job-${padded}-before.webp`;
        const afterWebp  = `images/jobs/job-${padded}-after.webp`;
        const singleWebp = `images/jobs/job-${padded}.webp`;
        const beforeJpg  = `images/jobs/job-${padded}-before.jpg`;
        const afterJpg   = `images/jobs/job-${padded}-after.jpg`;
        const singleJpg  = `images/jobs/job-${padded}.jpg`;

        const [hasBeforeW, hasAfterW, hasSingleW, hasBeforeJ, hasAfterJ, hasSingleJ] =
          await Promise.all([
            tryImage(beforeWebp), tryImage(afterWebp), tryImage(singleWebp),
            tryImage(beforeJpg),  tryImage(afterJpg),  tryImage(singleJpg),
          ]);

        if (hasBeforeW && hasAfterW) {
          grid.appendChild(renderPair(beforeWebp, afterWebp, i, true));
        } else if (hasBeforeJ && hasAfterJ) {
          grid.appendChild(renderPair(beforeJpg, afterJpg, i, false));
        } else if (hasSingleW) {
          grid.appendChild(renderSingle(singleWebp, i));
        } else if (hasSingleJ) {
          grid.appendChild(renderSingle(singleJpg, i));
        }
      }
    }

    // If nothing got rendered, show placeholders so the page reads as
    // "we're building this out" instead of broken.
    if (grid.children.length === 0) {
      grid.appendChild(emptyState());
    }
  }

  function renderPair(before, after, jobNum, isWebp) {
    const wrap = document.createElement("div");
    wrap.className = "gallery-card";
    wrap.innerHTML = `
      <img src="${after}" alt="After detail, job #${jobNum}" loading="lazy">
      <div class="gallery-card-caption">After · job #${jobNum}</div>
    `;
    return wrap;
  }

  function renderSingle(src, jobNum) {
    const wrap = document.createElement("div");
    wrap.className = "gallery-card";
    wrap.innerHTML = `
      <img src="${src}" alt="Detailed car, job #${jobNum}" loading="lazy">
      <div class="gallery-card-caption">Job #${jobNum}</div>
    `;
    return wrap;
  }

  function emptyState() {
    const wrap = document.createElement("div");
    wrap.className = "gallery-empty";
    wrap.innerHTML = `
      <p style="font-family:var(--display);font-size:1.4rem;color:var(--ink-soft);margin-bottom:8px;">
        Photos coming soon.
      </p>
      <p>
        Ellis is just getting started. As cars get done, before-and-afters land here.<br>
        Want yours featured? Mention it when you book.
      </p>
      <p style="margin-top:16px;">
        <a href="/book" style="color:var(--accent);">Book a wash</a>
      </p>
    `;
    return wrap;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
