(() => {
  const { dom, state } = window.HEXACTF;

  const page = document.body.dataset.page || "";
  const adminLinks = document.querySelectorAll(".admin-link");
  const logoutBtn = document.getElementById("logoutTopBtn");

  function redirect(path) {
    if (window.location.pathname !== path) {
      window.location.href = path;
    }
  }

  function syncAdminLink() {
    const isAdmin = state.auth?.user?.role === "admin";
    adminLinks.forEach(link => link.classList.toggle("hidden", !isAdmin));
  }

  function guardRoutes() {
    const userRaw = localStorage.getItem("hexactf_user");
    if (!userRaw) {
      if (page !== "login") {
        redirect("/login");
      }
      return;
    }

    let user = null;
    try {
      user = JSON.parse(userRaw);
    } catch {
      localStorage.removeItem("hexactf_token");
      localStorage.removeItem("hexactf_user");
      if (page !== "login") {
        redirect("/login");
      }
      return;
    }

    if (page === "login") {
      if (user?.role === "admin") {
        redirect("/admin");
      } else {
        redirect("/challenges");
      }
      return;
    }

    if (page === "admin" && user?.role !== "admin") {
      redirect("/challenges");
    }
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      const p = window.HEXACTF.logout
        ? window.HEXACTF.logout()
        : (window.HEXACTF.clearAuth ? (window.HEXACTF.clearAuth(), Promise.resolve()) : Promise.resolve());
      Promise.resolve(p).finally(() => redirect("/login"));
    });
  }

  window.HEXACTF = Object.assign(window.HEXACTF || {}, {
    router: {
      guardRoutes,
      syncAdminLink
    }
  });

  guardRoutes();
  syncAdminLink();
})();
