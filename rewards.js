/* ============================================================
   rewards.js — /rewards punch-card lookup (read-only)
   ------------------------------------------------------------
   Customer enters their email, we GET /api/loyalty?email= and render
   the punch strip. Never mutates anything (only the signed operator
   links in Ellis's email can change state). Remembers the last email
   in localStorage for one-tap re-checks.
   ============================================================ */
(function () {
  "use strict";

  const STORE_KEY = "elion_rewards_email";

  function el(id) { return document.getElementById(id); }

  function renderStrip(filled, total, freeAvailable) {
    const strip = el("rewardsStrip");
    strip.innerHTML = "";
    for (let i = 1; i <= total; i++) {
      const dot = document.createElement("span");
      dot.className = "rewards-dot";
      const isReward = i === total;
      const isFilled = i <= filled;
      if (isReward) dot.classList.add("is-reward");
      if (isFilled) dot.classList.add("is-filled");
      // Mark the free slot with a star glyph
      if (isReward) dot.textContent = "★";
      strip.appendChild(dot);
    }
    // If a free is available, light the reward slot regardless.
    if (freeAvailable > 0) {
      const last = strip.lastChild;
      if (last) last.classList.add("is-filled");
    }
  }

  async function check(email) {
    const btn = el("rewardsCheck");
    const result = el("rewardsResult");
    const status = el("rewardsStatus");
    const free = el("rewardsFree");
    const hint = el("rewardsHint");
    btn.disabled = true;
    btn.textContent = "Checking…";
    try {
      const res = await fetch(`/api/loyalty?email=${encodeURIComponent(email)}`, { headers: { "accept": "application/json" } });
      const data = await res.json();
      const filled = Number(data.stampsFilled) || 1;
      const total = Number(data.totalSlots) || 5;
      const nextIn = Number(data.nextRewardIn);
      const freeAvail = Number(data.freeAvailable) || 0;

      renderStrip(filled, total, freeAvail);
      result.hidden = false;

      if (freeAvail > 0) {
        free.hidden = false;
        free.textContent = freeAvail === 1
          ? "You've got a free Essential waiting. Mention it when you book and Ellis takes care of it."
          : `You've got ${freeAvail} free Essentials waiting. Mention it when you book.`;
      } else {
        free.hidden = true;
      }

      if (!data.returning && filled <= 1) {
        status.textContent = "Your card is started, one punch on the house. Book your first wash to keep it going.";
      } else if (nextIn === 1) {
        status.textContent = "One more wash and your next one's a free Essential.";
      } else {
        status.textContent = `${nextIn} more washes until a free Essential.`;
      }
      hint.textContent = `Filled ${filled} of ${total}.`;
      try { localStorage.setItem(STORE_KEY, email); } catch {}
    } catch (e) {
      result.hidden = false;
      status.textContent = "Couldn't reach the rewards service. Try again in a minute, or text Ellis.";
      el("rewardsStrip").innerHTML = "";
      free.hidden = true;
      hint.textContent = "";
    } finally {
      btn.disabled = false;
      btn.textContent = "Check my card";
    }
  }

  function init() {
    const form = el("rewardsForm");
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = el("rewardsEmail").value.trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        el("rewardsResult").hidden = false;
        el("rewardsStatus").textContent = "That doesn't look like an email. Use the one you book with.";
        el("rewardsStrip").innerHTML = "";
        el("rewardsFree").hidden = true;
        el("rewardsHint").textContent = "";
        return;
      }
      check(email);
    });
    // Prefill last-used email for convenience.
    try {
      const last = localStorage.getItem(STORE_KEY);
      if (last) el("rewardsEmail").value = last;
    } catch {}
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
