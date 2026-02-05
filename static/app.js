// -------------------------
// HexaCTF Front (static)
// - 카드 렌더
// - 필터/검색
// - Start/Stop + URL 표시/복사
// -------------------------

const grid = document.getElementById("grid");
const logEl = document.getElementById("log");
const apiStatusEl = document.getElementById("apiStatus");
const filtersEl = document.getElementById("filters");
const searchInput = document.getElementById("searchInput");
const clearLogBtn = document.getElementById("clearLogBtn");
const navLinks = document.querySelectorAll(".nav-link");
const pages = document.querySelectorAll(".page");
const scoreboardBody = document.getElementById("scoreboardBody");
const scoreboardStatusEl = document.getElementById("scoreboardStatus");
const refreshScoreboardBtn = document.getElementById("refreshScoreboardBtn");
const authTabs = document.querySelectorAll(".auth-tab");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const authMessageEl = document.getElementById("authMessage");
const authUserPanel = document.getElementById("authUserPanel");
const authUserNameEl = document.getElementById("authUserName");
const authUserRoleEl = document.getElementById("authUserRole");
const logoutBtn = document.getElementById("logoutBtn");
const currentUserEl = document.getElementById("currentUser");

let allChallenges = [];
let activeCat = "all";
let activeQuery = "";
let activeAuthTab = "login";
let authState = { token: null, user: null };

// key -> { instance_id, url }
const runningMap = new Map();

function log(line) {
  const ts = new Date().toLocaleTimeString();
  if (!logEl) {
    console.log(`[${ts}] ${line}`);
    return;
  }
  logEl.textContent += `[${ts}] ${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function setApiStatus(ok) {
  const dot = document.querySelector(".dot");
  if (!dot || !apiStatusEl) return;
  if (ok) {
    dot.style.background = "var(--ok)";
    dot.style.boxShadow = "0 0 0 4px rgba(46,229,157,0.12)";
    apiStatusEl.textContent = "API: online";
  } else {
    dot.style.background = "var(--danger)";
    dot.style.boxShadow = "0 0 0 4px rgba(255,77,109,0.12)";
    apiStatusEl.textContent = "API: offline (fallback data)";
  }
}

function setScoreboardStatus(ok, detail) {
  if (!scoreboardStatusEl) return;
  if (ok) {
    scoreboardStatusEl.textContent = detail ? `API: online (${detail})` : "API: online";
  } else {
    scoreboardStatusEl.textContent = detail ? `API: offline (${detail})` : "API: offline (fallback data)";
  }
}

function setAuthMessage(message, type) {
  if (!authMessageEl) return;
  authMessageEl.textContent = message || "";
  authMessageEl.classList.remove("error", "ok");
  if (type) authMessageEl.classList.add(type);
}

function saveAuth(user, token) {
  authState = { user, token };
  localStorage.setItem("hexactf_token", token);
  localStorage.setItem("hexactf_user", JSON.stringify(user));
  renderAuthState();
}

function clearAuth() {
  authState = { user: null, token: null };
  localStorage.removeItem("hexactf_token");
  localStorage.removeItem("hexactf_user");
  renderAuthState();
}

function loadAuth() {
  const token = localStorage.getItem("hexactf_token");
  const userRaw = localStorage.getItem("hexactf_user");
  if (!token || !userRaw) {
    renderAuthState();
    return;
  }

  try {
    const user = JSON.parse(userRaw);
    authState = { token, user };
  } catch {
    clearAuth();
    return;
  }
  renderAuthState();
}

function authHeaders() {
  if (!authState.token) return {};
  return { Authorization: `Bearer ${authState.token}` };
}

function renderAuthState() {
  const isAuthed = !!authState.token && !!authState.user;
  if (currentUserEl) {
    currentUserEl.textContent = isAuthed
      ? (authState.user.display_name || authState.user.username || "User")
      : "Guest";
  }

  if (authUserPanel) {
    authUserPanel.classList.toggle("hidden", !isAuthed);
  }
  if (loginForm) {
    loginForm.classList.toggle("active", !isAuthed && activeAuthTab === "login");
  }
  if (registerForm) {
    registerForm.classList.toggle("active", !isAuthed && activeAuthTab === "register");
  }

  if (authUserNameEl) {
    authUserNameEl.textContent = isAuthed
      ? (authState.user.display_name || authState.user.username || "User")
      : "-";
  }
  if (authUserRoleEl) {
    authUserRoleEl.textContent = isAuthed ? (authState.user.role || "user") : "user";
  }
  if (!isAuthed) {
    setAuthMessage("", "");
  }
}

function setAuthTab(tab) {
  activeAuthTab = tab;
  authTabs.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.auth === tab);
  });
  renderAuthState();
}

async function safeJson(res) {
  const text = await res.text();
  // 디버깅에 매우 유용
  log(`HTTP ${res.status} raw: ${text.slice(0, 200)}${text.length > 200 ? "..." : ""}`);

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

// 1) 가능하면 서버에서 challenges 목록 받아오기
//   - 권장 엔드포인트: GET /api/challenges
//   - 없으면 fallback 사용
async function loadChallenges() {
  // fallback 데이터 (서버 엔드포인트 없을 때도 UI 확인 가능)
  const fallback = [
    {
      key: "pwn1",
      title: "기초 버퍼 오버플로우",
      category: "pwn",
      score: 100,
      desc: "Basic buffer overflow challenge.",
      tags: ["#pwn", "#easy"],
      downloads: []
    },
    {
      key: "web1",
      title: "반사형 XSS",
      category: "web",
      score: 150,
      desc: "Simple reflected XSS challenge.",
      tags: ["#web", "#xss"],
      locked: true,
      downloads: []
    }
  ];

  try {
    const res = await fetchWithTimeout("/api/challenges", {}, 5000);
    if (!res.ok) throw new Error(`GET /api/challenges failed: ${res.status}`);
    const data = await res.json();

    // 기대 형태 예시:
    // { "pwn1": {title, dir, category, score, ...}, "web1": {...} }
    // -> 프론트에서 배열로 변환
    const arr = Object.entries(data).map(([key, v]) => {
      const cat = (v.type ?? v.category ?? "misc").toLowerCase();
      return {
        key,
        title: v.title ?? key,
        category: cat,
        type: v.type ?? null,
        score: v.score ?? 0,
        desc: v.desc ?? v.description ?? "No description.",
        tags: v.tags ?? [`#${cat}`],
        locked: v.locked ?? false,
        downloads: Array.isArray(v.downloads) ? v.downloads : []
      };
    });

    setApiStatus(true);
    log(`Loaded challenges from API: ${arr.length}`);
    return arr;
  } catch (e) {
    setApiStatus(false);
    const reason = e.name === "AbortError" ? "timeout" : e.message;
    log(`API load failed -> fallback 사용: ${reason}`);
    return fallback;
  }
}

function setNavActive(page) {
  navLinks.forEach(link => {
    link.classList.toggle("active", link.dataset.page === page);
  });
  pages.forEach(section => {
    section.classList.toggle("active", section.dataset.page === page);
  });
}

function showPage(page) {
  if (!page) return;
  setNavActive(page);
  if (page === "scoreboard") {
    refreshScoreboard();
  }
}

function normalizeCat(cat) {
  const c = (cat || "").toLowerCase();
  if (["pwn","web","rev","crypto"].includes(c)) return c;
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

function renderDownloads(ch) {
  const files = Array.isArray(ch.downloads) ? ch.downloads : [];
  if (!files.length) return "";

  const items = files.filter(f => f && f.url).map(f => {
    const label = escapeHtml(String(f.label ?? f.name ?? "file"));
    const sizeLabel = formatBytes(Number(f.size));
    const sizeHtml = sizeLabel ? `<span class="download-size">${escapeHtml(sizeLabel)}</span>` : "";
    return `<a class="download-link" href="${escapeAttr(String(f.url))}" download rel="noreferrer">${label}${sizeHtml}</a>`;
  }).join("");

  if (!items) return "";

  return `
    <div class="downloads">
      <div class="small">Downloads</div>
      <div class="download-list">${items}</div>
    </div>
  `;
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

function cardHTML(ch) {
  const cat = normalizeCat(ch.type ?? ch.category);
  const tags = (ch.tags || []).map(t => `<span class="tag">${escapeHtml(String(t))}</span>`).join("");

  const isRunning = runningMap.has(ch.key);
  const locked = !!ch.locked;

  const startDisabled = locked || isRunning;
  const stopDisabled = locked || !isRunning;

  const instance = runningMap.get(ch.key);
  const downloads = renderDownloads(ch);
  const connectHint = instance ? buildConnectHint(ch, instance) : "-";

  return `
    <div class="card" data-key="${escapeHtml(ch.key)}" data-cat="${cat}">
      <div class="card-top">
        <span class="badge ${cat}">
          <span class="chip"></span>
          ${cat.toUpperCase()}
        </span>
        <span class="points">${Number(ch.score || 0)} pts</span>
      </div>

      <h3 class="title">${escapeHtml(ch.title || ch.key)}</h3>

      <p class="desc">${escapeHtml(ch.desc || "No description.")}</p>

      <div class="meta-row">
        <span class="tag">#${escapeHtml(ch.key)}</span>
        ${tags}
      </div>

      ${downloads}

      <div class="actions">
        <button class="btn" data-action="start" ${startDisabled ? "disabled" : ""}>
          ${locked ? "Locked" : (isRunning ? "Running" : "Start Instance")}
        </button>

        <button class="btn btn-danger" data-action="stop" ${stopDisabled ? "disabled" : ""}>
          Stop
        </button>
      </div>

      <div class="instance ${isRunning ? "show" : ""}">
        <div class="row">
          <div>
            <div class="small">Instance</div>
            <div class="small">ID: <span data-field="instance_id">${instance ? instance.instance_id : "-"}</span></div>
          </div>
          <div>
            ${instance ? `<a href="${escapeAttr(instance.url)}" target="_blank" rel="noreferrer">Open</a>` : ""}
          </div>
        </div>

        <div class="row" style="margin-top:8px;">
          <div style="flex:1; min-width:0;">
            <div class="small">URL</div>
            <div class="small" style="word-break:break-all;">
              <span data-field="url">${instance ? escapeHtml(instance.url) : "-"}</span>
            </div>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-ghost" data-action="copy" ${instance ? "" : "disabled"}>Copy</button>
          </div>
        </div>

        <div class="row" style="margin-top:8px;">
          <div style="flex:1; min-width:0;">
            <div class="small">Connect</div>
            <div class="small" style="word-break:break-all;">
              <span data-field="connect">${instance ? escapeHtml(connectHint) : "-"}</span>
            </div>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-ghost" data-action="copy-connect" ${instance ? "" : "disabled"}>Copy</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(str) {
  // href attribute용 최소 처리
  return String(str).replaceAll('"', "%22");
}

function render() {
  if (!grid) return;
  const filtered = allChallenges.filter(ch => {
    const cat = normalizeCat(ch.type ?? ch.category);
    const okCat = (activeCat === "all") ? true : (cat === activeCat);
    const q = activeQuery.trim().toLowerCase();
    const okQ = !q
      ? true
      : (String(ch.key).toLowerCase().includes(q) || String(ch.title || "").toLowerCase().includes(q));
    return okCat && okQ;
  });

  grid.innerHTML = filtered.map(cardHTML).join("");
}

function renderScoreboard(rows) {
  if (!scoreboardBody) return;
  if (!rows.length) {
    scoreboardBody.innerHTML = `
      <tr>
        <td class="scoreboard-empty" colspan="4">No data</td>
      </tr>
    `;
    return;
  }

  scoreboardBody.innerHTML = rows.map(row => {
    const rank = Number(row.rank || 0);
    const score = Number(row.score || 0);
    const solved = Number(row.solved_count || 0);
    const username = escapeHtml(String(row.username || "unknown"));
    const display = escapeHtml(String(row.display_name || row.username || "Unknown"));
    const userHtml = display !== username ? `${display} <span class="small">@${username}</span>` : display;

    return `
      <tr>
        <td class="scoreboard-rank">#${rank}</td>
        <td>${userHtml}</td>
        <td>${score}</td>
        <td>${solved}</td>
      </tr>
    `;
  }).join("");
}

async function loadScoreboard() {
  const fallback = [
    { rank: 1, username: "guest01", display_name: "Guest 01", score: 250, solved_count: 5 },
    { rank: 2, username: "guest02", display_name: "Guest 02", score: 180, solved_count: 4 },
    { rank: 3, username: "guest03", display_name: "Guest 03", score: 120, solved_count: 3 }
  ];

  try {
    const res = await fetchWithTimeout("/api/scoreboard", { headers: authHeaders() }, 5000);
    if (!res.ok) throw new Error(`GET /api/scoreboard failed: ${res.status}`);
    const data = await res.json();
    const raw = Array.isArray(data) ? data : (Array.isArray(data.scoreboard) ? data.scoreboard : []);

    const rows = raw.map((item, idx) => ({
      rank: Number(item.rank) || 0,
      username: item.username ?? item.user ?? `user${idx + 1}`,
      display_name: item.display_name ?? item.name ?? item.username ?? `User ${idx + 1}`,
      score: Number(item.score ?? 0),
      solved_count: Number(item.solved_count ?? item.solved ?? 0)
    }));

    rows.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.username).localeCompare(String(b.username));
    });

    rows.forEach((row, idx) => {
      if (!row.rank) row.rank = idx + 1;
    });

    setScoreboardStatus(true, `Loaded ${rows.length}`);
    log(`Loaded scoreboard: ${rows.length}`);
    return rows;
  } catch (e) {
    const reason = e.name === "AbortError" ? "timeout" : e.message;
    setScoreboardStatus(false, reason);
    log(`Scoreboard load failed -> fallback 사용: ${reason}`);
    return fallback;
  }
}

async function refreshScoreboard() {
  if (!scoreboardBody) return;
  const rows = await loadScoreboard();
  renderScoreboard(rows);
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
  saveAuth(data.user, data.access_token);
  setAuthMessage("Login success", "ok");
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
  saveAuth(data.user, data.access_token);
  setAuthMessage("Account created", "ok");
}

async function startInstance(problemKey) {
  log(`Start 요청: ${problemKey}`);

  const res = await fetch("/start", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ problem: problemKey })
  });

  const data = await safeJson(res);

  if (!res.ok || data.status !== "ok") {
    const msg = data.error ? String(data.error) : "Start failed";
    throw new Error(msg);
  }

  runningMap.set(problemKey, {
    instance_id: data.instance_id,
    url: data.url
  });

  log(`Start OK: instance_id=${data.instance_id} url=${data.url}`);
  render();
}

async function stopInstance(problemKey) {
  const instance = runningMap.get(problemKey);
  if (!instance) return;

  log(`Stop 요청: ${problemKey} (instance_id=${instance.instance_id})`);

  // 네 서버가 /stop/{id} 형태라고 가정 (이전 대화 흐름 기준)
  const res = await fetch(`/stop/${instance.instance_id}`, {
    method: "POST",
    headers: { ...authHeaders() }
  });

  const data = await safeJson(res);

  if (!res.ok || data.status !== "ok") {
    const msg = data.error ? String(data.error) : "Stop failed";
    throw new Error(msg);
  }

  runningMap.delete(problemKey);
  log(`Stop OK: instance_id=${instance.instance_id}`);
  render();
}

async function copyText(text, logLabel) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    log(logLabel || `Copied: ${text}`);
  } catch {
    // clipboard 권한 안 될 때 fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    log(logLabel ? `${logLabel} (fallback)` : `Copied (fallback): ${text}`);
  }
}

async function copyUrl(problemKey) {
  const instance = runningMap.get(problemKey);
  if (!instance?.url) return;
  await copyText(instance.url, `Copied: ${instance.url}`);
}

async function copyConnect(problemKey) {
  const instance = runningMap.get(problemKey);
  const ch = allChallenges.find(c => c.key === problemKey);
  if (!instance?.url || !ch) return;
  const hint = buildConnectHint(ch, instance);
  if (!hint || hint === "-") return;
  await copyText(hint, `Copied: ${hint}`);
}

// 이벤트 위임
if (grid) {
  grid.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const card = e.target.closest(".card");
    if (!card) return;

    const key = card.dataset.key;
    const action = btn.dataset.action;

    try {
      if (action === "start") {
        btn.disabled = true;
        await startInstance(key);
      } else if (action === "stop") {
        btn.disabled = true;
        await stopInstance(key);
      } else if (action === "copy") {
        await copyUrl(key);
      } else if (action === "copy-connect") {
        await copyConnect(key);
      }
    } catch (err) {
      log(`ERROR: ${err.message}`);
      console.error(err);
    } finally {
      render(); // 버튼 상태 갱신
    }
  });
}

// 필터
if (filtersEl) {
  filtersEl.addEventListener("click", (e) => {
    const b = e.target.closest("button.filter");
    if (!b) return;

    [...filtersEl.querySelectorAll(".filter")].forEach(x => x.classList.remove("active"));
    b.classList.add("active");

    activeCat = b.dataset.cat;
    render();
  });
}

// 검색
if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    activeQuery = e.target.value || "";
    render();
  });
}

if (clearLogBtn) {
  clearLogBtn.addEventListener("click", () => {
    if (logEl) logEl.textContent = "";
  });
}

(navLinks || []).forEach(link => {
  link.addEventListener("click", (e) => {
    const page = link.dataset.page;
    if (!page) return;
    e.preventDefault();
    showPage(page);
  });
});

if (refreshScoreboardBtn) {
  refreshScoreboardBtn.addEventListener("click", () => {
    refreshScoreboard();
  });
}

authTabs.forEach(btn => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.auth;
    if (!tab) return;
    setAuthTab(tab);
  });
});

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(loginForm);
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

if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(registerForm);
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

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    clearAuth();
    setAuthTab("login");
  });
}

(async function boot() {
  log("Front boot...");
  loadAuth();
  showPage("challenges");
  allChallenges = await loadChallenges();
  render();
})();
