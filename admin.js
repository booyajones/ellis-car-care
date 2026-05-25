/* ============================================================
   admin.js — Elion's job dashboard
   ------------------------------------------------------------
   - Bearer-token auth (sessionStorage). Password compared
     server-side via X-Elion-Admin header.
   - Lists all orders sorted newest first, in rounded-corner
     cards grouped/filtered by status.
   - Per-card: update status dropdown, tap-to-call, tap-to-text,
     Maps link for address.
   ============================================================ */

(function () {
  "use strict";

  const PWD_KEY = "elion_admin_token";

  const TIER_LABEL = { basic: "Basic", essential: "Essential", premium: "Premium" };
  const ADDON_LABEL = {
    interior: "Interior detail",
    headlight: "Headlight restoration",
    pethair: "Heavy pet hair",
    stain: "Heavy stain",
    leather: "Leather conditioning",
  };
  const STATUSES = [
    { id: "new",         label: "New" },
    { id: "scheduled",   label: "Scheduled" },
    { id: "in_progress", label: "In progress" },
    { id: "done",        label: "Done" },
    { id: "cancelled",   label: "Cancelled" },
  ];

  // ---- DOM refs ----
  let loginPane, dashboardPane, loginForm, pwdInput, loginError;
  let orderGrid, emptyState, refreshBtn;
  let stats = {};
  let allOrders = [];

  function getToken() {
    try { return sessionStorage.getItem(PWD_KEY) || ""; } catch { return ""; }
  }
  function setToken(t) {
    try { sessionStorage.setItem(PWD_KEY, t); } catch {}
  }
  function clearToken() {
    try { sessionStorage.removeItem(PWD_KEY); } catch {}
  }

  // ---- Auth ----
  async function tryAuth(pwd) {
    // Validate by attempting to fetch orders with the password as the bearer.
    // 401 = wrong password; 200 = valid.
    const resp = await fetch("/api/orders", {
      headers: { "x-elion-admin": pwd },
    });
    return resp.ok;
  }

  function showLogin() {
    loginPane.hidden = false;
    dashboardPane.hidden = true;
    setTimeout(() => pwdInput.focus(), 50);
  }

  function showDashboard() {
    loginPane.hidden = true;
    dashboardPane.hidden = false;
    loadOrders();
  }

  // ---- Load + render orders ----
  async function loadOrders() {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "Loading…";
    try {
      const resp = await fetch("/api/orders", {
        headers: { "x-elion-admin": getToken() },
      });
      if (resp.status === 401) {
        clearToken();
        showLogin();
        return;
      }
      if (!resp.ok) {
        alert("Failed to load orders: HTTP " + resp.status);
        return;
      }
      const data = await resp.json();
      allOrders = data.orders || [];
      renderAll();
    } catch (e) {
      alert("Network error: " + e.message);
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "Refresh";
    }
  }

  function renderAll() {
    // Stats
    const counts = { new: 0, scheduled: 0, in_progress: 0, done: 0, cancelled: 0 };
    allOrders.forEach(o => { counts[o.status] = (counts[o.status] || 0) + 1; });
    stats.total.textContent = allOrders.length;
    stats.new.textContent = counts.new;
    stats.scheduled.textContent = counts.scheduled;
    stats.done.textContent = counts.done;

    const filter = document.querySelector('input[name="filter"]:checked')?.value || "all";
    const filtered = filter === "all" ? allOrders : allOrders.filter(o => o.status === filter);

    orderGrid.innerHTML = "";
    if (filtered.length === 0) {
      emptyState.hidden = false;
      emptyState.querySelector("p:first-child").textContent = allOrders.length === 0
        ? "No orders yet."
        : `No ${filter === "all" ? "" : filter + " "}orders.`;
      return;
    }
    emptyState.hidden = true;

    filtered.forEach(order => orderGrid.appendChild(renderCard(order)));
  }

  function renderCard(order) {
    const card = document.createElement("article");
    card.className = "order-card";

    const p = order.pricing || {};
    const created = new Date(order.created_at);
    const dateStr = isNaN(created) ? "" : created.toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });

    const addonText = (p.addons || [])
      .map(a => `${ADDON_LABEL[a.id] || a.id} ($${a.price})`)
      .join(" · ") || "(none)";

    const phoneHref = (order.phone || "").replace(/[^\d+]/g, "");
    const mapHref = `https://maps.google.com/?q=${encodeURIComponent(order.address || "")}`;

    card.innerHTML = `
      <div class="order-card-head">
        <div>
          <div class="order-card-name">${escapeHtml(order.name)}</div>
          <div class="order-card-meta">${escapeHtml(dateStr)} · ${escapeHtml(order.id)}</div>
        </div>
        <div class="order-card-total">$${p.total ?? "?"}</div>
      </div>
      <div>
        <span class="status-badge status-${escapeHtml(order.status)}">${escapeHtml(formatStatus(order.status))}</span>
      </div>
      <div class="order-card-tier">
        <strong>${escapeHtml(TIER_LABEL[order.tier] || order.tier)}</strong> · ${escapeHtml(formatScope(order.scope))}
      </div>
      <div class="order-card-tier" style="font-size: 0.82rem; color: var(--muted);">
        Add-ons: ${escapeHtml(addonText)}
      </div>
      <div class="order-card-info">
        ${order.car ? `<div>🚗 ${escapeHtml(order.car)}</div>` : ""}
        <div>📞 <a href="tel:${escapeHtml(phoneHref)}">${escapeHtml(order.phone)}</a> · <a href="sms:${escapeHtml(phoneHref)}">text</a></div>
        <div>📍 <a href="${escapeHtml(mapHref)}" target="_blank" rel="noopener">${escapeHtml(order.address)}</a></div>
        ${order.preferred_timing ? `<div>🕐 ${escapeHtml(order.preferred_timing)}</div>` : ""}
        ${order.location === "annarbor" ? '<div style="color: var(--muted);">+$5 travel (Greater Ann Arbor)</div>' : ""}
        ${order.first_time ? '<div style="color: var(--accent);">⭐ First-time customer (25% discount applied)</div>' : ""}
      </div>
      ${order.notes ? `<div class="order-card-notes">"${escapeHtml(order.notes)}"</div>` : ""}
      ${order.notes_admin ? `<div class="order-card-notes" style="background: var(--accent-soft); color: var(--accent);">📝 ${escapeHtml(order.notes_admin)}</div>` : ""}
      <div class="order-card-actions">
        <select class="status-select" data-status-select>
          ${STATUSES.map(s => `<option value="${s.id}" ${s.id === order.status ? "selected" : ""}>${s.label}</option>`).join("")}
        </select>
        <button type="button" class="status-select" data-delete-btn style="background: transparent; color: var(--muted); border: 1px solid var(--line); padding: 6px 12px;">Delete</button>
      </div>
    `;

    // Wire up status change
    card.querySelector("[data-status-select]").addEventListener("change", async (e) => {
      const newStatus = e.target.value;
      e.target.disabled = true;
      const ok = await updateStatus(order.id, newStatus);
      if (ok) {
        order.status = newStatus;
        renderAll();
      } else {
        e.target.value = order.status;
        alert("Failed to update status. Try refresh.");
      }
      e.target.disabled = false;
    });

    // Wire up delete
    card.querySelector("[data-delete-btn]").addEventListener("click", async () => {
      if (!confirm(`Delete order ${order.id} from ${order.name}? This can't be undone.`)) return;
      const ok = await deleteOrder(order.id);
      if (ok) {
        allOrders = allOrders.filter(o => o.id !== order.id);
        renderAll();
      } else {
        alert("Failed to delete. Try refresh.");
      }
    });

    return card;
  }

  async function deleteOrder(orderId) {
    try {
      const resp = await fetch(`/api/orders?id=${encodeURIComponent(orderId)}`, {
        method: "DELETE",
        headers: { "x-elion-admin": getToken() },
      });
      // 200 = deleted, 404 = already gone (double-tap race) — both are success from UX standpoint
      return resp.ok || resp.status === 404;
    } catch { return false; }
  }

  async function updateStatus(orderId, status) {
    try {
      const resp = await fetch(`/api/orders?id=${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-elion-admin": getToken() },
        body: JSON.stringify({ status }),
      });
      return resp.ok;
    } catch { return false; }
  }

  function formatStatus(s) {
    return ({
      new: "New",
      scheduled: "Scheduled",
      in_progress: "In progress",
      done: "Done",
      cancelled: "Cancelled",
    })[s] || s;
  }

  function formatScope(s) {
    return ({ exterior: "Exterior only", interior: "Interior focus", both: "Inside + out" })[s] || s;
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  // ---- Init ----
  function init() {
    loginPane = document.getElementById("loginPane");
    dashboardPane = document.getElementById("dashboardPane");
    loginForm = document.getElementById("loginForm");
    pwdInput = document.getElementById("adminPwd");
    loginError = document.getElementById("loginError");
    orderGrid = document.getElementById("orderGrid");
    emptyState = document.getElementById("emptyState");
    refreshBtn = document.getElementById("refreshBtn");

    stats.total = document.getElementById("statTotal");
    stats.new = document.getElementById("statNew");
    stats.scheduled = document.getElementById("statScheduled");
    stats.done = document.getElementById("statDone");

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      loginError.hidden = true;
      const pwd = pwdInput.value;
      const ok = await tryAuth(pwd);
      if (ok) {
        setToken(pwd);
        pwdInput.value = "";
        showDashboard();
      } else {
        loginError.textContent = "Wrong password.";
        loginError.hidden = false;
      }
    });

    document.querySelectorAll('input[name="filter"]').forEach(r => {
      r.addEventListener("change", renderAll);
    });

    refreshBtn.addEventListener("click", loadOrders);

    document.querySelector("[data-logout]").addEventListener("click", () => {
      clearToken();
      showLogin();
    });

    // Auto-login if token present
    const existing = getToken();
    if (existing) {
      tryAuth(existing).then(ok => {
        if (ok) showDashboard();
        else { clearToken(); showLogin(); }
      });
    } else {
      showLogin();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
