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
      if (window.HEXACTF.router && window.HEXACTF.router.guardRoutes) {
        window.HEXACTF.router.guardRoutes();
      }
    }

    if (page === "challenges" && window.HEXACTF.challenges) {
      state.allChallenges = await window.HEXACTF.challenges.loadChallenges();
      if (window.HEXACTF.challenges.loadInstances) {
        await window.HEXACTF.challenges.loadInstances();
      }
      window.HEXACTF.challenges.render();
    }

    if (page === "scoreboard" && window.HEXACTF.scoreboard) {
      window.HEXACTF.scoreboard.refreshScoreboard();
    }

    if (page === "admin" && window.HEXACTF.admin) {
      window.HEXACTF.admin.refreshUsers();
    }
  }

  boot();
})();
