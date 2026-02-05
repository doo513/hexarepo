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

  function renderUsers(users) {
    if (!dom.adminUserBody) return;
    if (!users.length) {
      dom.adminUserBody.innerHTML = `
        <tr>
          <td class="admin-empty" colspan="5">No users</td>
        </tr>
      `;
      return;
    }

    dom.adminUserBody.innerHTML = users.map(user => {
      const username = escapeHtml(String(user.username || ""));
      const display = escapeHtml(String(user.display_name || user.username || ""));
      const role = escapeHtml(String(user.role || "user"));
      const score = Number(user.score || 0);
      const solved = Array.isArray(user.solved_problems) ? user.solved_problems.length : Number(user.solved_count || 0);
      const isSelf = state.auth?.user?.username === user.username;
      const toggleLabel = role === "admin" ? "Make User" : "Make Admin";
      const toggleRole = role === "admin" ? "user" : "admin";

      return `
        <tr data-username="${username}" data-role="${role}">
          <td>
            <div>${display}</div>
            <div class="small">@${username}</div>
          </td>
          <td><span class="auth-role">${role}</span></td>
          <td>${score}</td>
          <td>${solved}</td>
          <td>
            <div class="admin-actions">
              <button class="btn btn-ghost" data-action="toggle-role" data-role="${toggleRole}">${toggleLabel}</button>
              <button class="btn btn-danger" data-action="delete" ${isSelf ? "disabled" : ""}>Delete</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  async function fetchUsers() {
    const headers = window.HEXACTF.authHeaders ? window.HEXACTF.authHeaders() : {};
    const res = await fetch("/api/admin/users", { headers });
    const data = await safeJson(res);
    if (!res.ok || data.status !== "ok") {
      throw new Error(data.detail || data.error || "Failed to load users");
    }
    return Array.isArray(data.users) ? data.users : [];
  }

  async function fetchSettings() {
    const headers = window.HEXACTF.authHeaders ? window.HEXACTF.authHeaders() : {};
    const res = await fetch("/api/admin/settings", { headers });
    const data = await safeJson(res);
    if (!res.ok || data.status !== "ok") {
      throw new Error(data.detail || data.error || "Failed to load settings");
    }
    return data.settings || {};
  }

  async function updateSettings(payload) {
    const headers = window.HEXACTF.authHeaders ? window.HEXACTF.authHeaders() : {};
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(payload)
    });
    const data = await safeJson(res);
    if (!res.ok || data.status !== "ok") {
      throw new Error(data.detail || data.error || "Failed to update settings");
    }
    return data.settings || {};
  }

  async function refreshSettings() {
    if (!isAdminUser() || !dom.userInstanceLimitInput) return;
    try {
      const settings = await fetchSettings();
      const limit = Number(settings.user_instance_limit);
      dom.userInstanceLimitInput.value = Number.isFinite(limit) ? String(limit) : "";
    } catch (err) {
      setAdminMessage(err.message || "Failed to load settings", "error");
      log(`Admin settings load failed: ${err.message}`);
    }
  }

  async function refreshUsers() {
    if (!isAdminUser()) return;
    try {
      setAdminMessage("Loading users...", "");
      const users = await fetchUsers();
      renderUsers(users);
      setAdminMessage(`Loaded ${users.length} users`, "ok");
    } catch (err) {
      setAdminMessage(err.message || "Failed to load users", "error");
      log(`Admin users load failed: ${err.message}`);
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
      log(`Admin settings update failed: ${err.message}`);
    }
  }

  async function updateRole(username, role) {
    const headers = window.HEXACTF.authHeaders ? window.HEXACTF.authHeaders() : {};
    const res = await fetch(`/api/admin/users/${encodeURIComponent(username)}/role`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ role })
    });
    const data = await safeJson(res);
    if (!res.ok || data.status !== "ok") {
      throw new Error(data.detail || data.error || "Failed to update role");
    }
    return data.user;
  }

  async function deleteUser(username) {
    const headers = window.HEXACTF.authHeaders ? window.HEXACTF.authHeaders() : {};
    const res = await fetch(`/api/admin/users/${encodeURIComponent(username)}`, {
      method: "DELETE",
      headers
    });
    const data = await safeJson(res);
    if (!res.ok || data.status !== "ok") {
      throw new Error(data.detail || data.error || "Failed to delete user");
    }
  }

  async function resetScoreboard() {
    const headers = window.HEXACTF.authHeaders ? window.HEXACTF.authHeaders() : {};
    const res = await fetch("/api/admin/scoreboard/reset", {
      method: "POST",
      headers
    });
    const data = await safeJson(res);
    if (!res.ok || data.status !== "ok") {
      throw new Error(data.detail || data.error || "Failed to reset scoreboard");
    }
  }

  if (dom.adminUserBody) {
    dom.adminUserBody.addEventListener("click", async (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      const row = e.target.closest("tr");
      if (!row) return;
      const username = row.dataset.username;
      const action = btn.dataset.action;

      try {
        if (action === "toggle-role") {
          const targetRole = btn.dataset.role;
          setAdminMessage("Updating role...", "");
          await updateRole(username, targetRole);
          await refreshUsers();
        } else if (action === "delete") {
          const ok = confirm(`Delete user ${username}?`);
          if (!ok) return;
          setAdminMessage("Deleting user...", "");
          await deleteUser(username);
          await refreshUsers();
        }
      } catch (err) {
        setAdminMessage(err.message || "Admin action failed", "error");
        log(`Admin action failed: ${err.message}`);
      }
    });
  }

  if (dom.refreshUsersBtn) {
    dom.refreshUsersBtn.addEventListener("click", () => {
      refreshUsers();
    });
  }

  if (dom.saveUserInstanceLimitBtn) {
    dom.saveUserInstanceLimitBtn.addEventListener("click", () => {
      saveUserInstanceLimit();
    });
  }

  if (dom.resetScoreboardBtn) {
    dom.resetScoreboardBtn.addEventListener("click", async () => {
      const ok = confirm("Reset all scores and solved history?");
      if (!ok) return;
      try {
        setAdminMessage("Resetting scoreboard...", "");
        await resetScoreboard();
        setAdminMessage("Scoreboard reset", "ok");
        if (window.HEXACTF.scoreboard) {
          window.HEXACTF.scoreboard.refreshScoreboard();
        }
        await refreshUsers();
      } catch (err) {
        setAdminMessage(err.message || "Reset failed", "error");
        log(`Scoreboard reset failed: ${err.message}`);
      }
    });
  }

  function onAuthChange() {
    renderAdminVisibility();
    if (isAdminUser()) {
      refreshSettings();
      refreshUsers();
    } else if (dom.adminUserBody) {
      dom.adminUserBody.innerHTML = `
        <tr>
          <td class="admin-empty" colspan="5">Admin only</td>
        </tr>
      `;
    }
  }

  window.HEXACTF = Object.assign(window.HEXACTF || {}, {
    admin: {
      refreshUsers,
      onAuthChange
    }
  });

  onAuthChange();
})();
