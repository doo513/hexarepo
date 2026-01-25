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
      tags: ["#pwn", "#easy"]
    },
    {
      key: "web1",
      title: "반사형 XSS",
      category: "web",
      score: 150,
      desc: "Simple reflected XSS challenge.",
      tags: ["#web", "#xss"],
      locked: true
    }
  ];

  try {
    const res = await fetch("/api/challenges");
    if (!res.ok) throw new Error(`GET /api/challenges failed: ${res.status}`);
    const data = await res.json();

    // 기대 형태 예시:
    // { "pwn1": {title, dir, category, score, ...}, "web1": {...} }
    // -> 프론트에서 배열로 변환
    const arr = Object.entries(data).map(([key, v]) => ({
      key,
      title: v.title ?? key,
      category: (v.category ?? "misc").toLowerCase(),
      score: v.score ?? 0,
      desc: v.desc ?? v.description ?? "No description.",
      tags: v.tags ?? [`#${(v.category ?? "misc").toLowerCase()}`],
      locked: v.locked ?? false
    }));

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

function cardHTML(ch) {
  const cat = normalizeCat(ch.category);
  const tags = (ch.tags || []).map(t => `<span class="tag">${escapeHtml(String(t))}</span>`).join("");

  const isRunning = runningMap.has(ch.key);
  const locked = !!ch.locked;

  const startDisabled = locked || isRunning;
  const stopDisabled = locked || !isRunning;

  const instance = runningMap.get(ch.key);

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
    const cat = normalizeCat(ch.category);
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

async function copyUrl(problemKey) {
  const instance = runningMap.get(problemKey);
  if (!instance?.url) return;

  try {
    await navigator.clipboard.writeText(instance.url);
    log(`Copied: ${instance.url}`);
  } catch {
    // clipboard 권한 안 될 때 fallback
    const ta = document.createElement("textarea");
    ta.value = instance.url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    log(`Copied (fallback): ${instance.url}`);
  }
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
