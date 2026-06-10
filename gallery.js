/* ============================================================
   gallery.js — renders the public gallery page
   ------------------------------------------------------------
   Two sections, both optional:

   1. "In the wild" — process photos from images/process/wash-NN-*.
      Currently 12 hand-curated shots of Ellis foam-washing cars
      in actual Burns Park driveways. Lives in WASH_PHOTOS (below).

   2. "Recent jobs" — before/after pairs from images/jobs/, driven
      by CONFIG.JOBS_COUNT. Empty by default until Ellis starts
      shooting before/afters.

   If both lists are empty, an "in progress" placeholder renders so
   the page never looks broken.
   ============================================================ */
(function () {
  "use strict";

  // 8 photos from Ellis, updated June 2026.
  const WASH_PHOTOS = [
    { id: "01", alt: "Black Mazda CX-5 freshly detailed in a Burns Park driveway" },
    { id: "02", alt: "Wheel and tire close-up after a hand detail, Burns Park" },
    { id: "03", alt: "Side profile of a clean car in a neighborhood driveway" },
    { id: "04", alt: "Detail shot from a recent wash in Ann Arbor" },
    { id: "05", alt: "Close-up detail on a freshly washed vehicle" },
    { id: "06", alt: "Car exterior after a full hand detail by Ellis" },
    { id: "07", alt: "Black SUV after a hand wash and wax, driveway in Burns Park" },
    { id: "08", alt: "Wheel close-up after tire shine treatment — after" },
  ];

  function tryImage(src) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = src;
    });
  }

  function renderWashCard(p) {
    const card = document.createElement("div");
    card.className = "gallery-card";
    card.innerHTML = `
      <picture>
        <source srcset="images/process/wash-${p.id}-400.webp 400w, images/process/wash-${p.id}-900.webp 900w, images/process/wash-${p.id}-1600.webp 1600w" sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 33vw" type="image/webp">
        <source srcset="images/process/wash-${p.id}-400.jpg 400w, images/process/wash-${p.id}-900.jpg 900w, images/process/wash-${p.id}-1600.jpg 1600w" sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 33vw" type="image/jpeg">
        <img src="images/process/wash-${p.id}-900.jpg" alt="${p.alt}" loading="lazy" width="900" height="675">
      </picture>
    `;
    return card;
  }

  function renderJobPair(before, after, jobNum) {
    const wrap = document.createElement("div");
    wrap.className = "gallery-card";
    wrap.innerHTML = `
      <img src="${after}" alt="After detail, job #${jobNum}" loading="lazy">
      <div class="gallery-card-caption">After · job #${jobNum}</div>
    `;
    return wrap;
  }

  function renderJobSingle(src, jobNum) {
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

  async function renderJobs(jobGrid) {
    const count = Number(window.CONFIG?.JOBS_COUNT) || 0;
    if (count <= 0) return 0;
    let rendered = 0;
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

      if (hasBeforeW && hasAfterW)        { jobGrid.appendChild(renderJobPair(beforeWebp, afterWebp, i)); rendered++; }
      else if (hasBeforeJ && hasAfterJ)   { jobGrid.appendChild(renderJobPair(beforeJpg, afterJpg, i));   rendered++; }
      else if (hasSingleW)                { jobGrid.appendChild(renderJobSingle(singleWebp, i));          rendered++; }
      else if (hasSingleJ)                { jobGrid.appendChild(renderJobSingle(singleJpg, i));           rendered++; }
    }
    return rendered;
  }

  async function init() {
    const washGrid = document.querySelector("[data-gallery-wash]");
    const jobGrid = document.querySelector("[data-gallery-jobs]");
    const jobSection = document.querySelector("[data-gallery-jobs-section]");

    // 1. Wash photos — these are always present
    if (washGrid) {
      WASH_PHOTOS.forEach(p => washGrid.appendChild(renderWashCard(p)));
    }

    // 2. Before/after jobs — only if any exist
    let jobsRendered = 0;
    if (jobGrid) {
      jobsRendered = await renderJobs(jobGrid);
    }
    if (jobSection && jobsRendered === 0) {
      jobSection.hidden = true;
    }

    // 3. If somehow nothing rendered (no wash grid + no jobs), show placeholder
    const anyRendered = (washGrid && washGrid.children.length > 0) || jobsRendered > 0;
    if (!anyRendered && washGrid) {
      washGrid.appendChild(emptyState());
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
