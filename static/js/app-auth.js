(() => {
  const { dom, state, safeJson } = window.HEXACTF;

  function setAuthMessage(message, type) {
    if (!dom.authMessageEl) return;
    dom.authMessageEl.textContent = message || "";
    dom.authMessageEl.classList.remove("error", "ok");
    if (type) dom.authMessageEl.classList.add(type);
  }


  let concurrentLogoutNoticeShown = false;

  function showConcurrentLogoutNotice() {
    if (concurrentLogoutNoticeShown) return;
    concurrentLogoutNoticeShown = true;
    window.setTimeout(() => {
      alert('다른 기기 또는 브라우저에서 같은 계정으로 다시 로그인되어 현재 로그인은 종료되었습니다.');
      concurrentLogoutNoticeShown = false;
    }, 0);
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

  function isAuthenticated() {
    return !!state.auth.user;
  }

  function isAdmin() {
    return state.auth.user?.role === "admin";
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
    if (window.HEXACTF.router) {
      if (window.HEXACTF.router.syncProtectedLinks) {
        window.HEXACTF.router.syncProtectedLinks();
      }
      if (window.HEXACTF.router.syncAdminLink) {
        window.HEXACTF.router.syncAdminLink();
      }
      if (window.HEXACTF.router.syncThemeToggle) {
        window.HEXACTF.router.syncThemeToggle();
      }
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
    clearAuth();
    setAuthMessage(data.message || "가입 요청이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.", "ok");
  }

  async function refreshMe() {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = await safeJson(res);
      if (!res.ok || data.status !== "ok") {
        const message = data.detail || data.error || "Auth check failed";
        throw new Error(message);
      }
      if (data.user) {
        saveAuth(data.user, null);
      }
      return true;
    } catch (err) {
      if (String(err?.message || '').includes('현재 세션이 종료되었습니다')) {
        clearAuth();
        showConcurrentLogoutNotice();
        return false;
      }
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
        setAuthMessage("Username/password required.", "error");
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
        setAuthMessage("Username/password required.", "error");
        return;
      }
      if (password.length < 8) {
        setAuthMessage("비밀번호 8자+", "error");
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



  function evaluatePasswordStrength(password) {
    const value = String(password || '');
    let score = 0;
    if (value.length >= 8) score += 1;
    if (/[a-zA-Z]/.test(value) && /\d/.test(value)) score += 1;
    if (/[^A-Za-z0-9]/.test(value) || (/[A-Z]/.test(value) && /[a-z]/.test(value))) score += 1;

    if (score <= 1) return { level: 'weak', text: '강도: 약함' };
    if (score === 2) return { level: 'medium', text: '강도: 보통' };
    return { level: 'strong', text: '강도: 강함' };
  }

  function syncPasswordStrength(password, prefix = 'pc') {
    const wrap = document.getElementById(prefix === 'pc' ? 'pcStrengthText' : 'registerStrengthText')?.closest('.password-strength');
    const textEl = document.getElementById(prefix === 'pc' ? 'pcStrengthText' : 'registerStrengthText');
    if (!wrap || !textEl) return;

    wrap.classList.remove('is-weak', 'is-medium', 'is-strong');
    if (!password) {
      textEl.textContent = '강도: -';
      return;
    }

    const result = evaluatePasswordStrength(password);
    wrap.classList.add(`is-${result.level}`);
    textEl.textContent = result.text;
  }

  function setCapsLockMessage(targetId, active) {
    const el = document.getElementById(targetId);
    if (!el) return;
    el.textContent = active ? 'Caps Lock 켜짐' : '';
  }

  function setPasswordMessage(message, type = "") {
    const msg = document.getElementById('pcMessage');
    if (!msg) return;
    msg.textContent = message || '';
    msg.className = 'text-sm min-h-[18px]';
    if (type === 'error') msg.classList.add('text-red-600');
    if (type === 'ok') msg.classList.add('text-emerald-600');
    if (type === 'muted') msg.classList.add('text-slate-400');
  }

  function openPasswordChangeModal() {
    const modal = document.getElementById('passwordChangeModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    const form = document.getElementById('passwordChangeForm');
    if (form) form.reset();
    setPasswordMessage('');
    syncPasswordStrength('', 'pc');
    requestAnimationFrame(() => modal.classList.add('is-open'));
  }

  function closePasswordChangeModal() {
    const modal = document.getElementById('passwordChangeModal');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    window.setTimeout(() => {
      if (!modal.classList.contains('is-open')) {
        modal.classList.add('hidden');
      }
    }, 170);
  }

  async function readResponseData(res) {
    const text = await res.text();
    try {
      return JSON.parse(text || '{}');
    } catch {
      const trimmed = (text || '').trim().toLowerCase();
      if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html')) {
        throw new Error(`서버 응답 오류 (${res.status})`);
      }
      throw new Error(`응답 오류 (${res.status})`);
    }
  }

  async function submitPasswordChange(e) {
    e.preventDefault();
    const currentPw = document.getElementById('pcCurrentPassword');
    const newPw = document.getElementById('pcNewPassword');
    const confirmPw = document.getElementById('pcConfirmPassword');
    if (!currentPw || !newPw || !confirmPw) return;

    const cur = currentPw.value;
    const nw = newPw.value;
    const cf = confirmPw.value;

    if (!cur || !nw || !cf) {
      setPasswordMessage('모두 입력하세요.', 'error');
      return;
    }
    if (nw.length < 8) {
      setPasswordMessage('비밀번호 8자+', 'error');
      return;
    }
    if (nw !== cf) {
      setPasswordMessage('비밀번호 불일치', 'error');
      return;
    }

    setPasswordMessage('변경 중...', 'muted');

    try {
      const csrf = window.HEXACTF.getCsrfToken ? window.HEXACTF.getCsrfToken() : '';
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        ...(window.HEXACTF.authHeaders ? window.HEXACTF.authHeaders() : {})
      };
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers,
        body: JSON.stringify({ current_password: cur, new_password: nw }),
        credentials: 'same-origin',
        cache: 'no-store'
      });
      const data = await readResponseData(res);
      if (!res.ok || data.status !== 'ok') {
        throw new Error(data.detail || data.error || `변경 실패 (${res.status})`);
      }
      setPasswordMessage('변경 완료', 'ok');
      setTimeout(() => closePasswordChangeModal(), 650);
    } catch (err) {
      setPasswordMessage(err.message || '변경 실패', 'error');
    }
  }

  document.addEventListener('click', (e) => {
    const toggleBtn = e.target.closest('[data-toggle-password]');
    if (toggleBtn) {
      const input = document.getElementById(toggleBtn.getAttribute('data-toggle-password'));
      const icon = toggleBtn.querySelector('.material-symbols-outlined');
      if (input) {
        const nextType = input.type === 'password' ? 'text' : 'password';
        input.type = nextType;
        if (icon) icon.textContent = nextType === 'password' ? 'visibility' : 'visibility_off';
      }
      return;
    }

    const pwModal = document.getElementById('passwordChangeModal');
    if (!pwModal) return;
    if (e.target.closest('[data-action="close-password-modal"]')) {
      closePasswordChangeModal();
      return;
    }
    if (e.target.closest('#currentUser') || e.target.closest('.material-symbols-outlined.account-circle-parent')) {
      if (!state.auth?.user) return;
      openPasswordChangeModal();
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'pcNewPassword') {
      syncPasswordStrength(e.target.value || '', 'pc');
    }
    if (e.target && e.target.id === 'registerPassword') {
      syncPasswordStrength(e.target.value || '', 'register');
    }
  });

  document.addEventListener('keydown', (e) => {
    const target = e.target;
    if (target && target.id === 'pcCurrentPassword') setCapsLockMessage('pcCurrentCapsMessage', e.getModifierState && e.getModifierState('CapsLock'));
    if (target && target.id === 'pcNewPassword') setCapsLockMessage('pcNewCapsMessage', e.getModifierState && e.getModifierState('CapsLock'));
    if (target && target.id === 'pcConfirmPassword') setCapsLockMessage('pcConfirmCapsMessage', e.getModifierState && e.getModifierState('CapsLock'));
    if (target && target.id === 'registerPassword') setCapsLockMessage('registerCapsMessage', e.getModifierState && e.getModifierState('CapsLock'));
  });


  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePasswordChangeModal();
    }
  });

  document.addEventListener('submit', (e) => {
    if (e.target && e.target.id === 'passwordChangeForm') {
      submitPasswordChange(e);
    }
  });

  syncPasswordStrength('', 'register');

  window.HEXACTF = Object.assign(window.HEXACTF || {}, {
    authHeaders,
    loadAuth,
    clearAuth,
    setAuthTab,
    setAuthMessage,
    renderAuthState,
    refreshMe,
    logout,
    isAuthenticated,
    isAdmin
  });
})();
