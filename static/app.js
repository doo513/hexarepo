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

let allChallenges = [];
let activeCat = "all";
let activeQuery = "";

// key -> { instance_id, url }
const runningMap = new Map();

function log(line) {
  const ts = new Date().toLocaleTimeString();
  logEl.textContent += `[${ts}] ${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function setApiStatus(ok) {
  const dot = document.querySelector(".dot");
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
    const res = await fetch("/api/challenges");
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
    log(`API load failed -> fallback 사용: ${e.message}`);
    return fallback;
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

async function startInstance(problemKey) {
  log(`Start 요청: ${problemKey}`);

  const res = await fetch("/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  const res = await fetch(`/stop/${instance.instance_id}`, { method: "POST" });

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

// 필터
filtersEl.addEventListener("click", (e) => {
  const b = e.target.closest("button.filter");
  if (!b) return;

  [...filtersEl.querySelectorAll(".filter")].forEach(x => x.classList.remove("active"));
  b.classList.add("active");

  activeCat = b.dataset.cat;
  render();
});

// 검색
searchInput.addEventListener("input", (e) => {
  activeQuery = e.target.value || "";
  render();
});

clearLogBtn.addEventListener("click", () => {
  logEl.textContent = "";
});

(async function boot() {
  log("Front boot...");
  allChallenges = await loadChallenges();
  render();
})();
