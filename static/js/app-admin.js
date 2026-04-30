(() => {
  const { dom, state, log, safeJson, escapeHtml } = window.HEXACTF;

  function setAdminMessage(message, type) {
    if (!dom.adminMessageEl) return;
    dom.adminMessageEl.textContent = message || "";
    dom.adminMessageEl.classList.remove("error", "ok");
    if (type) dom.adminMessageEl.classList.add(type);
  }

  function isAdminUser() {
    return state.auth?.user?.role === "admin";
  }

  function renderAdminVisibility() {
    if (!dom.adminPanel) return;
    dom.adminPanel.classList.toggle("hidden", !isAdminUser());
  }

  function confirmAdminAction(message) {
    console.log("[confirmAdminAction] Called:", message);
    const modal = document.getElementById("adminConfirmModal");
    const msgEl = document.getElementById("adminConfirmMessage");
    const okBtn = document.getElementById("adminConfirmOkBtn");
    const cancelBtn = document.getElementById("adminConfirmCancelBtn");
    if (!modal || !msgEl || !okBtn || !cancelBtn) {
      console.log("[confirmAdminAction] Modal not found, using window.confirm");
      return Promise.resolve(window.confirm(message));
    }
    msgEl.textContent = message || "\uc774 \uc791\uc5c5\uc744 \uc9c4\ud589\ud558\uc2dc\uaca0\uc2b5\ub2c8\uae4c?";
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    window.setTimeout(() => cancelBtn.focus(), 0);
    return new Promise(resolve => {
      const cleanup = result => {
        modal.classList.add("hidden");
        modal.setAttribute("aria-hidden", "true");
        okBtn.removeEventListener("click", onOk);
        cancelBtn.removeEventListener("click", onCancel);
        modal.removeEventListener("click", onBackdrop);
        document.removeEventListener("keydown", onKeydown);
        resolve(result);
      };
      const onOk = () => cleanup(true);
      const onCancel = () => cleanup(false);
      const onBackdrop = e => {
        if (e.target.closest('[data-action="close-admin-confirm"]')) cleanup(false);
      };
      const onKeydown = e => {
        if (e.key === "Escape") cleanup(false);
      };
      okBtn.addEventListener("click", onOk);
      cancelBtn.addEventListener("click", onCancel);
      modal.addEventListener("click", onBackdrop);
      document.addEventListener("keydown", onKeydown);
    });
  }

  function renderUsers(users) {
    if (!dom.adminUserBody) return;
    if (!users.length) {
      dom.adminUserBody.innerHTML = '<tr><td class="px-6 py-8 text-slate-400 text-center" colspan="7">No users</td></tr>';
      return;
    }
    dom.adminUserBody.innerHTML = users.filter(user => String(user.status || "approved") !== "pending").map(user => {
      const username = escapeHtml(String(user.username || ""));
      const display = escapeHtml(String(user.display_name || user.username || ""));
      const role = escapeHtml(String(user.role || "user"));
      const status = escapeHtml(String(user.status || "approved"));
      const score = Number(user.score || 0);
      const solved = Array.isArray(user.solved_problems) ? user.solved_problems.length : Number(user.solved_count || 0);
      const activeInstances = Number(user.active_instance_count || user.active_instances || 0);
      const isSelf = state.auth?.user?.username === user.username;
      const toggleLabel = role === "admin" ? "Make User" : "Make Admin";
      const toggleRole = role === "admin" ? "user" : "admin";
      return '<tr class="hover:bg-surface-container-low transition-colors duration-150" data-username="' + username + '" data-role="' + role + '">' +
        '<td class="px-6 py-4"><div class="flex items-center gap-3"><div class="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center"><span class="material-symbols-outlined text-lg">person</span></div><div><div class="font-bold text-sm">' + display + '</div><div class="text-xs text-slate-400">@' + username + '</div></div></div></td>' +
        '<td class="px-6 py-4"><span class="px-2 py-0.5 rounded-sm ' + (status === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600") + ' text-[10px] font-bold uppercase tracking-wider">' + status + '</span></td>' +
        '<td class="px-6 py-4"><span class="px-2 py-0.5 rounded-sm bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase tracking-wider">' + role + '</span></td>' +
        '<td class="px-6 py-4 font-headline font-bold text-sm">' + score + '</td>' +
        '<td class="px-6 py-4 text-sm text-slate-600">' + solved + '</td>' +
        '<td class="px-6 py-4 text-sm text-slate-600">' + activeInstances + '</td>' +
        '<td class="px-6 py-4 text-right"><div class="flex justify-end gap-2 flex-wrap">' +
        '<button class="bg-amber-50 text-amber-700 px-3 py-1.5 rounded-sm text-xs font-bold hover:bg-amber-100 transition-all" data-action="reset-password">Reset Password</button>' +
        '<button class="bg-surface-container-high px-3 py-1.5 rounded-sm text-xs font-bold hover:bg-primary hover:text-white transition-all" data-action="toggle-role" data-role="' + toggleRole + '">' + toggleLabel + '</button>' +
        '<button class="bg-red-50 text-red-600 px-3 py-1.5 rounded-sm text-xs font-bold hover:bg-red-100 transition-all" data-action="delete"' + (isSelf ? " disabled" : "") + '>Delete</button>' +
        '<button class="bg-orange-50 text-orange-700 px-3 py-1.5 rounded-sm text-xs font-bold hover:bg-orange-100 transition-all" data-action="reclaim-user"' + (activeInstances > 0 ? "" : " disabled") + '>Reclaim</button>' +
        '</div></td></tr>';
    }).join("");
  }

  function formatKstDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    }).format(date).replace(/\./g, "-").replace(/\s+/g, " ").trim();
  }

  function isoToDatetimeLocal(isoStr) {
    if (!isoStr) return "";
    try {
      const d = new Date(isoStr);
      const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
      const yyyy = kst.getUTCFullYear();
      const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(kst.getUTCDate()).padStart(2, "0");
      const hh = String(kst.getUTCHours()).padStart(2, "0");
      const mi = String(kst.getUTCMinutes()).padStart(2, "0");
      return yyyy + "-" + mm + "-" + dd + "T" + hh + ":" + mi;
    } catch { return ""; }
  }

  function datetimeLocalToIso(val) {
    if (!val) return null;
    const d = new Date(val + ":00+09:00");
    if (isNaN(d.getTime())) return null;
    return d.toISOString().replace(".000Z", "Z").replace(".000+09:00", "+09:00");
  }

  function renderPendingUsers(users) {
    if (!dom.adminPendingBody) return;
    const pendingUsers = users.filter(user => String(user.status || "approved") === "pending");
    if (!pendingUsers.length) {
      dom.adminPendingBody.innerHTML = '<tr><td class="px-6 py-8 text-slate-400 text-center" colspan="4">No pending users</td></tr>';
      return;
    }
    dom.adminPendingBody.innerHTML = pendingUsers.map(user => {
      const username = escapeHtml(String(user.username || ""));
      const display = escapeHtml(String(user.display_name || user.username || ""));
      const created = escapeHtml(formatKstDateTime(user.created_at));
      return '<tr class="hover:bg-surface-container-low transition-colors duration-150" data-username="' + username + '">' +
        '<td class="px-6 py-4"><div class="font-bold text-sm">' + display + '</div><div class="text-xs text-slate-400">@' + username + '</div></td>' +
        '<td class="px-6 py-4"><span class="px-2 py-0.5 rounded-sm bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-wider">pending</span></td>' +
        '<td class="px-6 py-4 text-sm text-slate-600">' + created + '</td>' +
        '<td class="px-6 py-4 text-right"><div class="flex justify-end gap-2 flex-wrap">' +
        '<button class="bg-emerald-500 text-white px-3 py-1.5 rounded-sm text-xs font-bold hover:bg-emerald-600 transition-all" data-action="approve-user">Approve</button>' +
        '<button class="bg-red-50 text-red-600 px-3 py-1.5 rounded-sm text-xs font-bold hover:bg-red-100 transition-all" data-action="reject-user">Reject</button>' +
        '</div></td></tr>';
    }).join("");
  }

  async function fetchUsers() {
    const headers = window.HEXACTF.authHeaders ? window.HEXACTF.authHeaders() : {};
    const res = await fetch("/api/admin/users", { headers });
    const data = await safeJson(res);
    if (!res.ok || data.status !== "ok") throw new Error(data.detail || data.error || "Failed to load users");
    return Array.isArray(data.users) ? data.users : [];
  }

  async function fetchSettings() {
    const headers = window.HEXACTF.authHeaders ? window.HEXACTF.authHeaders() : {};
    const res = await fetch("/api/admin/settings", { headers });
    const data = await safeJson(res);
    if (!res.ok || data.status !== "ok") throw new Error(data.detail || data.error || "Failed to load settings");
    return data.settings || {};
  }

  async function fetchSummary() {
    const headers = window.HEXACTF.authHeaders ? window.HEXACTF.authHeaders() : {};
    const res = await fetch("/api/admin/summary", { headers });
    const data = await safeJson(res);
    if (!res.ok || data.status !== "ok") throw new Error(data.detail || data.error || "Failed to load admin summary");
    return data.summary || {};
  }

  async function fetchInstances() {
    const headers = window.HEXACTF.authHeaders ? window.HEXACTF.authHeaders() : {};
    const res = await fetch("/api/instances", { headers });
    const data = await safeJson(res);
    if (!res.ok || data.status !== "ok") throw new Error(data.detail || data.error || "Failed to load instances");
    return Array.isArray(data.instances) ? data.instances : [];
  }

  function renderAdminSummary(users, summary) {
    if (dom.adminUserCountEl) dom.adminUserCountEl.textContent = String(Array.isArray(users) ? users.length : 0);
    if (dom.adminActiveSessionsEl) dom.adminActiveSessionsEl.textContent = Number(summary?.active_sessions || 0) + " active users";
    if (dom.rankingStateLabel) dom.rankingStateLabel.textContent = summary?.ranking_open === false ? "Rankings are currently closed for non-admin users." : "Rankings are currently open for everyone.";
    if (dom.rankingToggleBtn) {
      const isOpen = summary?.ranking_open !== false;
      dom.rankingToggleBtn.textContent = isOpen ? "Close Rankings" : "Resume Rankings";
      dom.rankingToggleBtn.className = (isOpen ? "bg-red-500 hover:bg-red-600" : "bg-emerald-500 hover:bg-emerald-600") + " text-white font-headline text-sm px-6 py-2.5 rounded-sm hover:shadow-lg transition-all active:scale-95";
      dom.rankingToggleBtn.dataset.mode = isOpen ? "close" : "resume";
    }
    if (dom.rankingClosedMessage && summary?.ranking_closed_message && !_isEditing(dom.rankingClosedMessage)) dom.rankingClosedMessage.value = summary.ranking_closed_message;
    const challengeStateLabel = document.getElementById("challengeStateLabel");
    const challengeToggleBtn = document.getElementById("challengeToggleBtn");
    if (challengeStateLabel) challengeStateLabel.textContent = summary?.challenges_visible !== false ? "Challenges are currently open for everyone." : "Challenges are currently closed for non-admin users.";
    if (challengeToggleBtn) {
      const isOpen = summary?.challenges_visible !== false;
      challengeToggleBtn.textContent = isOpen ? "Close Challenges" : "Open Challenges";
      challengeToggleBtn.className = (isOpen ? "bg-red-500 hover:bg-red-600" : "bg-emerald-500 hover:bg-emerald-600") + " text-white font-headline text-sm px-6 py-2.5 rounded-sm hover:shadow-lg transition-all active:scale-95";
      challengeToggleBtn.dataset.mode = isOpen ? "close" : "open";
    }
  }

  async function updateSettings(payload) {
    const headers = window.HEXACTF.authHeaders ? window.HEXACTF.authHeaders() : {};
    const csrf = window.HEXACTF.getCsrfToken ? window.HEXACTF.getCsrfToken() : "";
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(csrf ? { "X-CSRF-Token": csrf } : {}), ...headers },
      body: JSON.stringify(payload)
    });
    const data = await safeJson(res);
    if (!res.ok || data.status !== "ok") throw new Error(data.detail || data.error || "Failed to update settings");
    return data.settings || {};
  }

  function _isEditing(el) {
    return el && (document.activeElement === el || el.matches(":focus"));
  }

  async function refreshSettings() {
    if (!isAdminUser() || !dom.userInstanceLimitInput) return;
    try {
      const settings = await fetchSettings();
      const limit = Number(settings.user_instance_limit);
      if (!_isEditing(dom.userInstanceLimitInput)) {
        dom.userInstanceLimitInput.value = Number.isFinite(limit) ? String(limit) : "";
      }
      const rcm = dom.rankingClosedMessage;
      if (rcm && !_isEditing(rcm)) {
        rcm.value = String(settings.ranking_closed_message || "");
      }
      const coa = document.getElementById("challengeOpenAt");
      const cca = document.getElementById("challengeCloseAt");
      const ccm = document.getElementById("challengeClosedMessage");
      const roa = document.getElementById("rankingOpenAt");
      const rca = document.getElementById("rankingCloseAt");
      if (coa && !_isEditing(coa)) coa.value = isoToDatetimeLocal(settings.challenges_open_at);
      if (cca && !_isEditing(cca)) cca.value = isoToDatetimeLocal(settings.challenges_close_at);
      if (ccm && !_isEditing(ccm)) ccm.value = String(settings.challenges_closed_message || "");
      if (roa && !_isEditing(roa)) roa.value = isoToDatetimeLocal(settings.ranking_open_at);
      if (rca && !_isEditing(rca)) rca.value = isoToDatetimeLocal(settings.ranking_close_at);
    } catch (err) {
      setAdminMessage(err.message || "Failed to load settings", "error");
      log("Admin settings load failed: " + err.message);
    }
  }

  async function refreshUsers() {
    if (!isAdminUser()) return;
    try {
      setAdminMessage("Loading users...", "");
      const [users, summary] = await Promise.all([fetchUsers(), fetchSummary()]);
      renderUsers(users);
      renderPendingUsers(users);
      renderAdminSummary(users, summary);
      setAdminMessage("Loaded " + users.length + " users", "ok");
    } catch (err) {
      setAdminMessage(err.message || "Failed to load users", "error");
      log("Admin users load failed: " + err.message);
    }
  }

  async function saveUserInstanceLimit() {
    if (!dom.userInstanceLimitInput) return;
    const raw = dom.userInstanceLimitInput.value;
    const limit = Number.parseInt(String(raw), 10);
    if (!Number.isFinite(limit) || limit < 0) {
      setAdminMessage("Invalid limit (must be >= 0)", "error");
      return;
    }
    try {
      setAdminMessage("Saving instance limit...", "");
      const settings = await updateSettings({ user_instance_limit: limit });
      const saved = Number(settings.user_instance_limit);
      dom.userInstanceLimitInput.value = Number.isFinite(saved) ? String(saved) : String(limit);
      setAdminMessage("Instance limit saved", "ok");
    } catch (err) {
      setAdminMessage(err.message || "Failed to save instance limit", "error");
      log("Admin settings update failed: " + err.message);
    }
  }

  async function updateRole(username, role) {
    const headers = window.HEXACTF.authHeaders ? window.HEXACTF.authHeaders() : {};
    const csrf = window.HEXACTF.getCsrfToken ? window.HEXACTF.getCsrfToken() : "";
    const res = await fetch("/api/admin/users/" + encodeURIComponent(username) + "/role", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(csrf ? { "X-CSRF-Token": csrf } : {}), ...headers },
      body: JSON.stringify({ role })
    });
    const data = await safeJson(res);
    if (!res.ok || data.status !== "ok") throw new Error(data.detail || data.error || "Failed to update role");
    return data.user;
  }

  async function resetPassword(username, password) {
    const headers = window.HEXACTF.authHeaders ? window.HEXACTF.authHeaders() : {};
    const csrf = window.HEXACTF.getCsrfToken ? window.HEXACTF.getCsrfToken() : "";
    const res = await fetch("/api/admin/users/" + encodeURIComponent(username) + "/password", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(csrf ? { "X-CSRF-Token": csrf } : {}), ...headers },
      body: JSON.stringify({ password })
    });
    const data = await safeJson(res);
    if (!res.ok || data.status !== "ok") throw new Error(data.detail || data.error || "Failed to reset password");
    return data.user;
  }

  async function deleteUser(username) {
    const headers = window.HEXACTF.authHeaders ? window.HEXACTF.authHeaders() : {};
    const csrf = window.HEXACTF.getCsrfToken ? window.HEXACTF.getCsrfToken() : "";
    const res = await fetch("/api/admin/users/" + encodeURIComponent(username), {
      method: "DELETE",
      headers: { ...(csrf ? { "X-CSRF-Token": csrf } : {}), ...headers }
    });
    const data = await safeJson(res);
    if (!res.ok || data.status !== "ok") throw new Error(data.detail || data.error || "Failed to delete user");
  }

  async function approveUser(username) {
    const headers = window.HEXACTF.authHeaders ? window.HEXACTF.authHeaders() : {};
    const csrf = window.HEXACTF.getCsrfToken ? window.HEXACTF.getCsrfToken() : "";
    const res = await fetch("/api/admin/users/" + encodeURIComponent(username) + "/approve", {
      method: "POST",
      headers: { ...(csrf ? { "X-CSRF-Token": csrf } : {}), ...headers }
    });
    const data = await safeJson(res);
    if (!res.ok || data.status !== "ok") throw new Error(data.detail || data.error || "Failed to approve user");
    return data.user;
  }

  async function rejectUser(username) {
    const headers = window.HEXACTF.authHeaders ? window.HEXACTF.authHeaders() : {};
    const csrf = window.HEXACTF.getCsrfToken ? window.HEXACTF.getCsrfToken() : "";
    const res = await fetch("/api/admin/users/" + encodeURIComponent(username), {
      method: "DELETE",
      headers: { ...(csrf ? { "X-CSRF-Token": csrf } : {}), ...headers }
    });
    const data = await safeJson(res);
    if (!res.ok || data.status !== "ok") throw new Error(data.detail || data.error || "Failed to reject user");
  }

  async function resetScoreboard() {
    const headers = window.HEXACTF.authHeaders ? window.HEXACTF.authHeaders() : {};
    const csrf = window.HEXACTF.getCsrfToken ? window.HEXACTF.getCsrfToken() : "";
    const res = await fetch("/api/admin/scoreboard/reset", {
      method: "POST",
      headers: { ...(csrf ? { "X-CSRF-Token": csrf } : {}), ...headers }
    });
    const data = await safeJson(res);
    if (!res.ok || data.status !== "ok") throw new Error(data.detail || data.error || "Failed to reset scoreboard");
  }

  // === User Directory click handler ===
  console.log("[app-admin] adminUserBody:", dom.adminUserBody);
  if (dom.adminUserBody) {
    dom.adminUserBody.addEventListener("click", async (e) => {
      console.log("[app-admin] adminUserBody click, target:", e.target);
      const btn = e.target.closest("button");
      if (!btn) return;
      const row = e.target.closest("tr");
      if (!row) return;
      const username = row.dataset.username;
      const action = btn.dataset.action;
      console.log("[app-admin] action:", action, "username:", username);

      try {
        if (action === "toggle-role") {
          const targetRole = btn.dataset.role;
          const ok = await confirmAdminAction(
            targetRole === "admin"
              ? username + " \uacc4\uc815\uc744 \uad00\ub9ac\uc790 \uad8c\ud55c\uc73c\ub85c \ubcc0\uacbd\ud558\uc2dc\uaca0\uc2b5\ub2c8\uae4c?"
              : username + " \uacc4\uc815\uc744 \uc77c\ubc18 \uc0ac\uc6a9\uc790 \uad8c\ud55c\uc73c\ub85c \ubcc0\uacbd\ud558\uc2dc\uaca0\uc2b5\ub2c8\uae4c?"
          );
          if (!ok) return;
          setAdminMessage("Updating role...", "");
          await updateRole(username, targetRole);
          await refreshUsers();
        } else if (action === "reset-password") {
          const nextPassword = prompt("Set a new password for " + username);
          if (!nextPassword) return;
          setAdminMessage("Resetting password...", "");
          await resetPassword(username, nextPassword);
          setAdminMessage("Password reset for " + username, "ok");
        } else if (action === "delete") {
          const ok = await confirmAdminAction(username + " \uacc4\uc815\uc744 \uc0ad\uc81c\ud558\uc2dc\uaca0\uc2b5\ub2c8\uae4c? \uc774 \uc791\uc5c5\uc740 \ub418\ub3cc\ub9b4 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.");
          if (!ok) return;
          setAdminMessage("Deleting user...", "");
          await deleteUser(username);
          await refreshUsers();
        } else if (action === "reclaim-user") {
          const ok = await confirmAdminAction("Reclaim all instances for " + username + "? This cannot be undone.");
          if (!ok) return;
          try {
            setAdminMessage("Reclaiming instances for " + username + "...", "");
            const result = await reclaimUser(username);
            const reclaimed = Array.isArray(result.reclaimed) ? result.reclaimed.length : 0;
            log("Reclaim user " + username + ": " + reclaimed + " instances reclaimed");
            setAdminMessage("Reclaimed " + reclaimed + " instances for " + username, "ok");
            await refreshAdminInstances();
          } catch (err) {
            setAdminMessage(err.message || "Failed to reclaim instances", "error");
            log("Reclaim user failed: " + err.message);
          }
          await refreshUsers();
        } else if (action === "approve-user") {
          setAdminMessage("Approving user...", "");
          await approveUser(username);
          await refreshUsers();
        } else if (action === "reject-user") {
          const ok = confirm("Reject and delete pending user " + username + "?");
          if (!ok) return;
          setAdminMessage("Rejecting user...", "");
          await rejectUser(username);
          await refreshUsers();
        }
      } catch (err) {
        setAdminMessage(err.message || "Admin action failed", "error");
        log("Admin action failed: " + err.message);
      }
    });
  }

  if (dom.adminPendingBody) {
    dom.adminPendingBody.addEventListener("click", async (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const row = e.target.closest("tr");
      if (!row) return;
      const username = row.dataset.username;
      const action = btn.dataset.action;
      try {
        if (action === "approve-user") {
          setAdminMessage("Approving user...", "");
          await approveUser(username);
          await refreshUsers();
        } else if (action === "reject-user") {
          const ok = confirm("Reject and delete pending user " + username + "?");
          if (!ok) return;
          setAdminMessage("Rejecting user...", "");
          await rejectUser(username);
          await refreshUsers();
        }
      } catch (err) {
        setAdminMessage(err.message || "Admin action failed", "error");
        log("Admin pending action failed: " + err.message);
      }
    });
  }

  if (dom.refreshUsersBtn) dom.refreshUsersBtn.addEventListener("click", () => refreshUsers());
  if (dom.saveUserInstanceLimitBtn) dom.saveUserInstanceLimitBtn.addEventListener("click", () => saveUserInstanceLimit());

  if (dom.rankingToggleBtn) {
    dom.rankingToggleBtn.addEventListener("click", async () => {
      try {
        const shouldClose = (dom.rankingToggleBtn.dataset.mode || "close") === "close";
        const message = String(dom.rankingClosedMessage?.value || "").trim() || "This page has been closed. \ub9c8\uc9c0\ub9c9\uae4c\uc9c0 \ucd5c\uc120\uc744 \ub2e4\ud574 \uc8fc\uc138\uc694!";
        setAdminMessage(shouldClose ? "Closing rankings..." : "Reopening rankings...", "");
        await updateSettings({ ranking_open: !shouldClose, ranking_closed_message: message });
        await refreshSettings();
        await refreshUsers();
        setAdminMessage(shouldClose ? "Rankings closed" : "Rankings resumed", "ok");
      } catch (err) { setAdminMessage(err.message || "Failed to toggle rankings", "error"); }
    });
  }

  if (dom.resetScoreboardBtn) {
    dom.resetScoreboardBtn.addEventListener("click", async () => {
      const ok = confirm("Reset all scores and solved history?");
      if (!ok) return;
      try {
        setAdminMessage("Resetting scoreboard...", "");
        await resetScoreboard();
        localStorage.setItem("hexactf_scoreboard_reset_at", String(Date.now()));
        setAdminMessage("Scoreboard reset", "ok");
        if (window.HEXACTF.scoreboard) window.HEXACTF.scoreboard.refreshScoreboard();
        await refreshUsers();
      } catch (err) {
        setAdminMessage(err.message || "Reset failed", "error");
        log("Scoreboard reset failed: " + err.message);
      }
    });
  }

  // Challenge toggle
  const challengeToggleBtn = document.getElementById("challengeToggleBtn");
  if (challengeToggleBtn) {
    challengeToggleBtn.addEventListener("click", async () => {
      try {
        const shouldClose = (challengeToggleBtn.dataset.mode || "close") === "close";
        const ccm = document.getElementById("challengeClosedMessage");
        const msg = ccm ? String(ccm.value || "").trim() : undefined;
        setAdminMessage(shouldClose ? "Closing challenges..." : "Opening challenges...", "");
        const payload = { challenges_open: !shouldClose };
        if (msg) payload.challenges_closed_message = msg;
        await updateSettings(payload);
        await refreshSettings();
        await refreshUsers();
        setAdminMessage(shouldClose ? "Challenges closed" : "Challenges opened", "ok");
      } catch (err) { setAdminMessage(err.message || "Failed to toggle challenges", "error"); }
    });
  }

  // Challenge schedule save
  const challengeScheduleBtn = document.getElementById("challengeScheduleBtn");
  if (challengeScheduleBtn) {
    challengeScheduleBtn.addEventListener("click", async () => {
      try {
        setAdminMessage("Saving challenge schedule...", "");
        const coa = document.getElementById("challengeOpenAt");
        const cca = document.getElementById("challengeCloseAt");
        const ccm = document.getElementById("challengeClosedMessage");
        const payload = {};
        const openAt = datetimeLocalToIso(coa ? coa.value : "");
        const closeAt = datetimeLocalToIso(cca ? cca.value : "");
        const msg = ccm ? String(ccm.value || "").trim() : "";
        if (openAt) payload.challenges_open_at = openAt;
        if (closeAt) payload.challenges_close_at = closeAt;
        if (msg) payload.challenges_closed_message = msg;
        await updateSettings(payload);
        await refreshSettings();
        setAdminMessage("Challenge schedule saved", "ok");
      } catch (err) { setAdminMessage(err.message || "Failed to save schedule", "error"); }
    });
  }

  // Challenge schedule reset
  const challengeScheduleResetBtn = document.getElementById("challengeScheduleResetBtn");
  if (challengeScheduleResetBtn) {
    challengeScheduleResetBtn.addEventListener("click", async () => {
      try {
        setAdminMessage("Resetting challenge schedule...", "");
        await updateSettings({ challenges_open: true, challenges_open_at: "", challenges_close_at: "" });
        const coa = document.getElementById("challengeOpenAt");
        const cca = document.getElementById("challengeCloseAt");
        if (coa) coa.value = "";
        if (cca) cca.value = "";
        await refreshUsers();
        setAdminMessage("Challenge schedule reset", "ok");
      } catch (err) { setAdminMessage(err.message || "Failed to reset schedule", "error"); }
    });
  }

  // Ranking schedule save
  const rankingScheduleBtn = document.getElementById("rankingScheduleBtn");
  if (rankingScheduleBtn) {
    rankingScheduleBtn.addEventListener("click", async () => {
      try {
        setAdminMessage("Saving ranking schedule...", "");
        const roa = document.getElementById("rankingOpenAt");
        const rca = document.getElementById("rankingCloseAt");
        const payload = {};
        const openAt = datetimeLocalToIso(roa ? roa.value : "");
        const closeAt = datetimeLocalToIso(rca ? rca.value : "");
        if (openAt) payload.ranking_open_at = openAt;
        if (closeAt) payload.ranking_close_at = closeAt;
        await updateSettings(payload);
        await refreshSettings();
        setAdminMessage("Ranking schedule saved", "ok");
      } catch (err) { setAdminMessage(err.message || "Failed to save schedule", "error"); }
    });
  }

  // Ranking schedule reset
  const rankingScheduleResetBtn = document.getElementById("rankingScheduleResetBtn");
  if (rankingScheduleResetBtn) {
    rankingScheduleResetBtn.addEventListener("click", async () => {
      try {
        setAdminMessage("Resetting ranking schedule...", "");
        await updateSettings({ ranking_open: true, ranking_open_at: "", ranking_close_at: "" });
        const roa = document.getElementById("rankingOpenAt");
        const rca = document.getElementById("rankingCloseAt");
        if (roa) roa.value = "";
        if (rca) rca.value = "";
        await refreshUsers();
        setAdminMessage("Ranking schedule reset", "ok");
      } catch (err) { setAdminMessage(err.message || "Failed to reset schedule", "error"); }
    });
  }

  // === Admin Instance Management ===

  async function fetchAdminInstances() {
    const headers = window.HEXACTF.authHeaders ? window.HEXACTF.authHeaders() : {};
    const res = await fetch("/api/admin/instances", { headers });
    const data = await safeJson(res);
    if (!res.ok || data.status !== "ok") throw new Error(data.detail || data.error || "Failed to load admin instances");
    return Array.isArray(data.instances) ? data.instances : [];
  }

  async function reclaimAllInstances() {
    const headers = window.HEXACTF.authHeaders ? window.HEXACTF.authHeaders() : {};
    const csrf = window.HEXACTF.getCsrfToken ? window.HEXACTF.getCsrfToken() : "";
    const res = await fetch("/api/admin/instances/reclaim", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(csrf ? { "X-CSRF-Token": csrf } : {}), ...headers },
      body: JSON.stringify({})
    });
    const data = await safeJson(res);
    if (!res.ok || data.status !== "ok") throw new Error(data.detail || data.error || "Failed to reclaim instances");
    return data;
  }

  async function reclaimUser(username) {
    const headers = window.HEXACTF.authHeaders ? window.HEXACTF.authHeaders() : {};
    const csrf = window.HEXACTF.getCsrfToken ? window.HEXACTF.getCsrfToken() : "";
    const res = await fetch("/api/admin/instances/reclaim", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(csrf ? { "X-CSRF-Token": csrf } : {}), ...headers },
      body: JSON.stringify({ username: username })
    });
    const data = await safeJson(res);
    if (!res.ok || data.status !== "ok") throw new Error(data.detail || data.error || "Failed to reclaim instances for user");
    return data;
  }

  function renderAdminInstances(instances) {
    const tbody = document.getElementById("adminInstancesBody");
    if (!tbody) return;
    if (!instances.length) {
      tbody.innerHTML = '<tr><td class="px-6 py-8 text-slate-400 text-center" colspan="4">No running instances</td></tr>';
      return;
    }
    // Deduplicate by instance_id + owner + problem
    const seen = new Set();
    const uniqueInstances = instances.filter(inst => {
      if (!inst || typeof inst !== "object") return false;
      const key = String(inst.instance_id || "") + "-" + String(inst.owner || "") + "-" + String(inst.problem || "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    
    tbody.innerHTML = uniqueInstances.map(inst => {
      const owner = escapeHtml(String(inst.owner || inst.username || "-"));
      const problem = escapeHtml(String(inst.problem || inst.challenge || "-"));
      const status = escapeHtml(String(inst.status || "running"));
      const created = escapeHtml(formatKstDateTime(inst.created_at));
      return '<tr class="hover:bg-surface-container-low transition-colors duration-150">' +
        '<td class="px-6 py-4 text-sm font-bold">' + owner + '</td>' +
        '<td class="px-6 py-4 text-sm text-slate-600">' + problem + '</td>' +
        '<td class="px-6 py-4"><span class="px-2 py-0.5 rounded-sm bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wider">' + status + '</span></td>' +
        '<td class="px-6 py-4 text-sm text-slate-600">' + created + '</td>' +
        '</tr>';
    }).join("");
  }

  async function refreshAdminInstances() {
    if (!isAdminUser()) return;
    try {
      const instances = await fetchAdminInstances();
      renderAdminInstances(instances);
    } catch (err) {
      log("Admin instances load failed: " + err.message);
      const tbody = document.getElementById("adminInstancesBody");
      if (tbody) tbody.innerHTML = '<tr><td class="px-6 py-8 text-red-400 text-center" colspan="4">Failed to load instances</td></tr>';
    }
  }

  function onAuthChange() {
    renderAdminVisibility();
    if (isAdminUser()) {
      refreshSettings();
      refreshAdminInstances();
      refreshUsers();
    } else if (dom.adminUserBody) {
      dom.adminUserBody.innerHTML = '<tr><td class="px-6 py-8 text-slate-400 text-center" colspan="7">Admin only</td></tr>';
      if (dom.adminPendingBody) dom.adminPendingBody.innerHTML = '<tr><td class="px-6 py-8 text-slate-400 text-center" colspan="4">Admin only</td></tr>';
      renderAdminSummary([], {});
    }
  }

  window.HEXACTF = Object.assign(window.HEXACTF || {}, {
    admin: { refreshUsers, onAuthChange }
  });

  // Reclaim All Instances button handler
  const reclaimAllBtn = document.getElementById("reclaimAllInstancesBtn");
  if (reclaimAllBtn) {
    reclaimAllBtn.addEventListener("click", async () => {
      const ok = await confirmAdminAction("All instances will be reclaimed. This cannot be undone.");
      if (!ok) return;
      try {
        setAdminMessage("Reclaiming all instances...", "");
        await reclaimAllInstances();
        setAdminMessage("All instances reclaimed", "ok");
        await refreshAdminInstances();
        await refreshUsers();
      } catch (err) {
        setAdminMessage(err.message || "Failed to reclaim instances", "error");
        log("Reclaim failed: " + err.message);
      }
    });
  }

  onAuthChange();
  console.log("[app-admin] Module loaded successfully");
})();
