(() => {
  const { log, state } = window.HEXACTF;
  const page = document.body.dataset.page || "";

  async function boot() {
    log("Front boot...");

    if (window.HEXACTF.loadAuth) {
      window.HEXACTF.loadAuth();
    }

    if (window.HEXACTF.refreshMe) {
      const ok = await window.HEXACTF.refreshMe();
      if (!ok && page !== "login") {
        window.location.href = "/login";
        return;
      }
    }

    if (window.HEXACTF.router && window.HEXACTF.router.guardRoutes) {
      const allowed = window.HEXACTF.router.guardRoutes();
      if (!allowed && page !== 'login') {
        return;
      }
    }

    if (window.HEXACTF.router && window.HEXACTF.router.revealProtectedPage) {
      window.HEXACTF.router.revealProtectedPage();
    }

    if (page === "challenges" && window.HEXACTF.challenges) {
      state.allChallenges = await window.HEXACTF.challenges.loadChallenges();
      if (window.HEXACTF.challenges.loadInstances) {
        await window.HEXACTF.challenges.loadInstances();
      }
      window.HEXACTF.challenges.render();
      if (window.HEXACTF.challenges.maybeOpenFromPath) {
        window.HEXACTF.challenges.maybeOpenFromPath();
      }
    }

    if (page === "scoreboard" && window.HEXACTF.scoreboard) {
      window.HEXACTF.scoreboard.refreshScoreboard();
    }

    if (page === "admin" && window.HEXACTF.admin) {
      window.HEXACTF.admin.refreshUsers();
    }

    if (window.HEXACTF.refreshMe && page !== "login") {
      window.setInterval(async () => {
        const ok = await window.HEXACTF.refreshMe();
        if (!ok && page !== "login") {
          window.location.href = "/login";
        }
      }, 5000);
    }
  }

  boot().catch(() => {
    if (page !== 'login') {
      window.location.href = '/login';
      return;
    }
    if (window.HEXACTF.router && window.HEXACTF.router.revealProtectedPage) {
      window.HEXACTF.router.revealProtectedPage();
    }
  });
})();
