(() => {
  const dom = {
    grid: document.getElementById("grid"),
    logEl: document.getElementById("log"),
    apiStatusEl: document.getElementById("apiStatus"),
    filtersEl: document.getElementById("filters"),
    searchInput: document.getElementById("searchInput"),
    clearLogBtn: document.getElementById("clearLogBtn"),
    navLinks: document.querySelectorAll(".nav-link"),
    pages: document.querySelectorAll(".page"),
    scoreboardBody: document.getElementById("scoreboardBody"),
    scoreboardStatusEl: document.getElementById("scoreboardStatus"),
    refreshScoreboardBtn: document.getElementById("refreshScoreboardBtn"),
    authTabs: document.querySelectorAll(".auth-tab"),
    loginForm: document.getElementById("loginForm"),
    registerForm: document.getElementById("registerForm"),
    authMessageEl: document.getElementById("authMessage"),
    authUserPanel: document.getElementById("authUserPanel"),
    authUserNameEl: document.getElementById("authUserName"),
    authUserRoleEl: document.getElementById("authUserRole"),
    logoutBtn: document.getElementById("logoutBtn"),
    currentUserEl: document.getElementById("currentUser"),
    adminPanel: document.getElementById("adminPanel"),
    adminMessageEl: document.getElementById("adminMessage"),
    refreshUsersBtn: document.getElementById("refreshUsersBtn"),
    resetScoreboardBtn: document.getElementById("resetScoreboardBtn"),
    adminUserBody: document.getElementById("adminUserBody"),
    userInstanceLimitInput: document.getElementById("userInstanceLimitInput"),
    saveUserInstanceLimitBtn: document.getElementById("saveUserInstanceLimitBtn")
  };

  const state = {
    allChallenges: [],
    activeCat: "all",
    activeQuery: "",
    runningMap: new Map(),
    auth: { token: null, user: null },
    activeAuthTab: "login"
  };

  function log(line) {
    const ts = new Date().toLocaleTimeString();
    if (!dom.logEl) {
      console.log(`[${ts}] ${line}`);
      return;
    }
    dom.logEl.textContent += `[${ts}] ${line}\n`;
    dom.logEl.scrollTop = dom.logEl.scrollHeight;
  }

  function setApiStatus(ok) {
    const dot = document.querySelector(".dot");
    if (!dot || !dom.apiStatusEl) return;
    if (ok) {
      dot.style.background = "var(--ok)";
      dot.style.boxShadow = "0 0 0 4px rgba(46,229,157,0.12)";
      dom.apiStatusEl.textContent = "API: online";
    } else {
      dot.style.background = "var(--danger)";
      dot.style.boxShadow = "0 0 0 4px rgba(255,77,109,0.12)";
      dom.apiStatusEl.textContent = "API: offline (fallback data)";
    }
  }

  function setScoreboardStatus(ok, detail) {
    if (!dom.scoreboardStatusEl) return;
    if (ok) {
      dom.scoreboardStatusEl.textContent = detail ? `API: online (${detail})` : "API: online";
    } else {
      dom.scoreboardStatusEl.textContent = detail ? `API: offline (${detail})` : "API: offline (fallback data)";
    }
  }

  async function safeJson(res) {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error("응답이 JSON이 아닙니다 (서버 에러/404 가능).");
    }
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(id);
    }
  }

  function normalizeCat(cat) {
    const c = (cat || "").toLowerCase();
    if (["pwn", "web", "rev", "crypto"].includes(c)) return c;
    return "misc";
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "";
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let idx = 0;
    while (size >= 1024 && idx < units.length - 1) {
      size /= 1024;
      idx += 1;
    }
    return `${size.toFixed(size >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(str) {
    return String(str).replaceAll('"', "%22");
  }

  function getCookie(name) {
    const target = `${name}=`;
    const parts = String(document.cookie || "").split(/;\s*/);
    for (const part of parts) {
      if (part.startsWith(target)) {
        return decodeURIComponent(part.slice(target.length));
      }
    }
    return "";
  }

  function getCsrfToken() {
    return getCookie("hexactf_csrf");
  }

  function parseHostPort(url) {
    try {
      const u = new URL(url);
      const port = u.port || (u.protocol === "https:" ? "443" : "80");
      return { host: u.hostname, port };
    } catch {
      const raw = String(url);
      const noProto = raw.replace(/^[a-z]+:\/\//i, "");
      const hostPort = noProto.split("/")[0];
      const [host, port] = hostPort.split(":");
      return { host, port };
    }
  }

  function buildConnectHint(ch, instance) {
    if (!instance?.url) return "-";
    const cat = normalizeCat(ch.type ?? ch.category);
    const { host, port } = parseHostPort(instance.url);

    if (cat === "pwn" || cat === "crypto") {
      if (host && port) return `nc ${host} ${port}`;
      return `nc ${instance.url}`;
    }
    if (cat === "web") {
      return instance.url;
    }
    if (cat === "rev") {
      return "No network service. Download files.";
    }
    return instance.url;
  }

  window.HEXACTF = Object.assign(window.HEXACTF || {}, {
    dom,
    state,
    log,
    setApiStatus,
    setScoreboardStatus,
    safeJson,
    fetchWithTimeout,
    normalizeCat,
    formatBytes,
    escapeHtml,
    escapeAttr,
    getCookie,
    getCsrfToken,
    parseHostPort,
    buildConnectHint
  });
})();
