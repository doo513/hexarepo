(() => {
  const { dom, state } = window.HEXACTF;

  const page = document.body.dataset.page || "";
  const protectedPages = new Set(["challenges", "scoreboard", "admin"]);
  const adminLinks = document.querySelectorAll('.admin-link, [data-auth-role="admin"]');
  const protectedLinks = document.querySelectorAll('[data-auth-link]');
  const logoutBtn = document.getElementById("logoutTopBtn");
  const THEME_KEY = 'hexactf_theme';

  function redirect(path) {
    if (window.location.pathname !== path) {
      window.location.href = path;
    }
  }

  function getStoredUser() {
    const raw = localStorage.getItem('hexactf_user');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      localStorage.removeItem('hexactf_user');
      localStorage.removeItem('hexactf_token');
      return null;
    }
  }

  function isAdminUser(user) {
    return user?.role === 'admin';
  }

  function syncAdminLink() {
    const user = state.auth?.user || getStoredUser();
    const isAdmin = isAdminUser(user);
    adminLinks.forEach(link => link.classList.toggle('hidden', !isAdmin));
  }

  function syncProtectedLinks() {
    const user = state.auth?.user || getStoredUser();
    const isAuthed = !!user;

    protectedLinks.forEach(link => {
      const requiredRole = link.dataset.authRole || 'user';
      const allowed = requiredRole === 'admin' ? isAdminUser(user) : isAuthed;
      link.classList.toggle('hidden', !allowed);
      if (!allowed) {
        link.setAttribute('aria-hidden', 'true');
        link.setAttribute('tabindex', '-1');
      } else {
        link.removeAttribute('aria-hidden');
        link.removeAttribute('tabindex');
      }
    });

    syncAdminLink();
  }

  function guardRoutes() {
    const user = getStoredUser();
    if (!user) {
      syncProtectedLinks();
      if (protectedPages.has(page)) {
        redirect('/login');
        return false;
      }
      return page == 'login';
    }

    if (page === 'login') {
      redirect(isAdminUser(user) ? '/admin' : '/challenges');
      return false;
    }

    if (page === 'admin' && !isAdminUser(user)) {
      redirect('/challenges');
      return false;
    }

    syncProtectedLinks();
    return true;
  }

  function revealProtectedPage() {
    document.body.classList.remove('route-pending');
  }

  function getSavedTheme() {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    const nextTheme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    localStorage.setItem(THEME_KEY, nextTheme);
    syncThemeToggle();
  }

  function syncThemeToggle() {
    const container = dom.currentUserEl?.parentElement;
    if (!container) return;

    let button = document.getElementById('themeToggleBtn');
    if (!button) {
      button = document.createElement('button');
      button.id = 'themeToggleBtn';
      button.type = 'button';
      button.className = 'theme-toggle-btn';
      button.setAttribute('aria-label', 'Toggle dark mode');
      button.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true"></span>';
      button.addEventListener('click', () => {
        const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme);
      });
      const accountIcon = container.querySelector('.account-circle-parent');
      container.insertBefore(button, accountIcon || dom.currentUserEl);
    }

    const isDark = document.documentElement.dataset.theme === 'dark';
    const icon = button.querySelector('.material-symbols-outlined');
    if (icon) {
      icon.textContent = isDark ? 'light_mode' : 'dark_mode';
    }
    button.setAttribute('aria-pressed', String(isDark));
    button.title = isDark ? '라이트 모드로 전환' : '다크 모드로 전환';
  }


  async function syncVisibilityBadges() {
    const user = state.auth?.user || getStoredUser();
    const badges = document.querySelectorAll('.badge-visibility');
    if (!user || user.role !== 'admin') {
      badges.forEach(b => b.classList.add('hidden'));
      return;
    }
    try {
      const res = await fetch('/api/visibility', { cache: 'no-store' });
      const data = await res.json();
      badges.forEach(badge => {
        const type = badge.dataset.badge;
        let visible = false;
        if (type === 'challenges') visible = data.challenges_visible;
        if (type === 'rankings') visible = data.ranking_visible;
        badge.textContent = visible ? 'open' : 'closed';
        badge.className = 'badge-visibility ml-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ' + (visible ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600');
      });
    } catch {
      badges.forEach(b => b.classList.add('hidden'));
    }
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      const p = window.HEXACTF.logout
        ? window.HEXACTF.logout()
        : (window.HEXACTF.clearAuth ? (window.HEXACTF.clearAuth(), Promise.resolve()) : Promise.resolve());
      Promise.resolve(p).finally(() => redirect('/login'));
    });
  }

  applyTheme(getSavedTheme());

  window.HEXACTF = Object.assign(window.HEXACTF || {}, {
    router: {
      applyTheme,
      getSavedTheme,
      guardRoutes,
      revealProtectedPage,
      syncAdminLink,
      syncProtectedLinks,
      syncThemeToggle,
      syncVisibilityBadges
    }
  });

  guardRoutes();
  syncProtectedLinks();
  syncThemeToggle();
  syncVisibilityBadges();
})();
