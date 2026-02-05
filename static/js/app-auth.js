(() => {
  const { dom, state, safeJson } = window.HEXACTF;

  function setAuthMessage(message, type) {
    if (!dom.authMessageEl) return;
    dom.authMessageEl.textContent = message || "";
    dom.authMessageEl.classList.remove("error", "ok");
    if (type) dom.authMessageEl.classList.add(type);
  }

  function saveAuth(user, token) {
    state.auth = { user, token: token || null };
    // token은 HttpOnly 쿠키로 저장 (localStorage 저장 X)
    localStorage.removeItem("hexactf_token");
    localStorage.setItem("hexactf_user", JSON.stringify(user));
    renderAuthState();
  }

  function clearAuth() {
    state.auth = { user: null, token: null };
    localStorage.removeItem("hexactf_token");
    localStorage.removeItem("hexactf_user");
    renderAuthState();
  }

  function loadAuth() {
    const userRaw = localStorage.getItem("hexactf_user");
    if (!userRaw) {
      renderAuthState();
      return;
    }

    try {
      const user = JSON.parse(userRaw);
      state.auth = { token: null, user };
    } catch {
      clearAuth();
      return;
    }
    renderAuthState();
  }

  function authHeaders() {
    if (!state.auth.token) return {};
    return { Authorization: `Bearer ${state.auth.token}` };
  }

  function renderAuthState() {
    const isAuthed = !!state.auth.user;
    if (dom.currentUserEl) {
      dom.currentUserEl.textContent = isAuthed
        ? (state.auth.user.display_name || state.auth.user.username || "User")
        : "Guest";
    }

    if (dom.authUserPanel) {
      dom.authUserPanel.classList.toggle("hidden", !isAuthed);
    }
    if (dom.loginForm) {
      dom.loginForm.classList.toggle("active", !isAuthed && state.activeAuthTab === "login");
    }
    if (dom.registerForm) {
      dom.registerForm.classList.toggle("active", !isAuthed && state.activeAuthTab === "register");
    }

    if (dom.authUserNameEl) {
      dom.authUserNameEl.textContent = isAuthed
        ? (state.auth.user.display_name || state.auth.user.username || "User")
        : "-";
    }
    if (dom.authUserRoleEl) {
      dom.authUserRoleEl.textContent = isAuthed ? (state.auth.user.role || "user") : "user";
    }
    if (!isAuthed) {
      setAuthMessage("", "");
    }
    if (window.HEXACTF.router && window.HEXACTF.router.syncAdminLink) {
      window.HEXACTF.router.syncAdminLink();
    }
    if (window.HEXACTF.admin && window.HEXACTF.admin.onAuthChange) {
      window.HEXACTF.admin.onAuthChange();
    }
  }

  function setAuthTab(tab) {
    state.activeAuthTab = tab;
    dom.authTabs.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.auth === tab);
    });
    renderAuthState();
  }

  async function loginUser(username, password) {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await safeJson(res);
    if (!res.ok || data.status !== "ok") {
      throw new Error(data.detail || data.error || "Login failed");
    }
    saveAuth(data.user, null);
    setAuthMessage("Login success", "ok");
    if (window.HEXACTF.router && window.HEXACTF.router.guardRoutes) {
      window.HEXACTF.router.guardRoutes();
    }
  }

  async function registerUser(username, password, displayName) {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        password,
        display_name: displayName || null
      })
    });

    const data = await safeJson(res);
    if (!res.ok || data.status !== "ok") {
      throw new Error(data.detail || data.error || "Register failed");
    }
    saveAuth(data.user, null);
    setAuthMessage("Account created", "ok");
    if (window.HEXACTF.router && window.HEXACTF.router.guardRoutes) {
      window.HEXACTF.router.guardRoutes();
    }
  }

  async function refreshMe() {
    try {
      const res = await fetch("/api/auth/me");
      const data = await safeJson(res);
      if (!res.ok || data.status !== "ok") {
        throw new Error(data.detail || data.error || "Auth check failed");
      }
      if (data.user) {
        saveAuth(data.user, null);
      }
      return true;
    } catch {
      clearAuth();
      return false;
    }
  }

  async function logout() {
    try {
      const csrf = window.HEXACTF.getCsrfToken ? window.HEXACTF.getCsrfToken() : "";
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: csrf ? { "X-CSRF-Token": csrf } : {}
      });
    } catch {
      // ignore network errors
    }
    clearAuth();
  }

  dom.authTabs.forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.auth;
      if (!tab) return;
      setAuthTab(tab);
    });
  });

  if (dom.loginForm) {
    dom.loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(dom.loginForm);
      const username = String(fd.get("username") || "").trim();
      const password = String(fd.get("password") || "").trim();
      if (!username || !password) {
        setAuthMessage("Username and password are required.", "error");
        return;
      }
      try {
        setAuthMessage("Logging in...", "");
        await loginUser(username, password);
      } catch (err) {
        setAuthMessage(err.message || "Login failed", "error");
      }
    });
  }

  if (dom.registerForm) {
    dom.registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(dom.registerForm);
      const username = String(fd.get("username") || "").trim();
      const password = String(fd.get("password") || "").trim();
      const displayName = String(fd.get("display_name") || "").trim();
      if (!username || !password) {
        setAuthMessage("Username and password are required.", "error");
        return;
      }
      try {
        setAuthMessage("Creating account...", "");
        await registerUser(username, password, displayName);
        setAuthTab("login");
      } catch (err) {
        setAuthMessage(err.message || "Register failed", "error");
      }
    });
  }

  if (dom.logoutBtn) {
    dom.logoutBtn.addEventListener("click", () => {
      Promise.resolve(logout()).finally(() => setAuthTab("login"));
    });
  }

  window.HEXACTF = Object.assign(window.HEXACTF || {}, {
    authHeaders,
    loadAuth,
    clearAuth,
    setAuthTab,
    setAuthMessage,
    renderAuthState,
    refreshMe,
    logout
  });
})();
