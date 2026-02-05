(() => {
  const { dom } = window.HEXACTF;

  function setNavActive(page) {
    dom.navLinks.forEach(link => {
      link.classList.toggle("active", link.dataset.page === page);
    });
    dom.pages.forEach(section => {
      section.classList.toggle("active", section.dataset.page === page);
    });
  }

  function showPage(page) {
    if (!page) return;
    setNavActive(page);
    if (page === "scoreboard" && window.HEXACTF.scoreboard) {
      window.HEXACTF.scoreboard.refreshScoreboard();
    }
  }

  dom.navLinks.forEach(link => {
    link.addEventListener("click", (e) => {
      const page = link.dataset.page;
      if (!page) return;
      e.preventDefault();
      showPage(page);
    });
  });

  window.HEXACTF = Object.assign(window.HEXACTF || {}, {
    nav: {
      showPage
    }
  });
})();
