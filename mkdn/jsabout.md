# jsabout

이 문서는 `static/index.html` + `static/app.js`가 실제로 어떻게 동작하는지, **함수 단위로 이해하기 쉽게** 정리한 설명입니다.

---

## 전체 실행 흐름(한 줄 요약)
- 페이지 로드 → `boot()` 실행 → `loadChallenges()`로 문제 목록 로드 → `render()`로 카드 렌더 → 이후 클릭/필터/검색 이벤트마다 상태를 바꾸고 `render()`로 다시 그림.

---

## HTML에서 JS가 사용하는 요소들
`static/index.html`에는 “빈 뼈대”만 있고, 카드 내용은 JS가 `#grid`에 넣습니다.

- API 상태 표시: `.dot`, `#apiStatus`
- 필터 버튼 컨테이너: `#filters` (각 버튼에 `data-cat`)
- 검색 입력: `#searchInput`
- 카드 렌더 영역: `#grid`
- 로그/콘솔: `#log`
- 로그 Clear: `#clearLogBtn`

코드(주석 처리):
```html
<!--
<span class="dot"></span>
<span id="apiStatus">API: checking...</span>

<div class="filters" id="filters">
  <button class="filter active" data-cat="all">All</button>
  <button class="filter" data-cat="pwn">PWN</button>
  <button class="filter" data-cat="web">WEB</button>
  <button class="filter" data-cat="rev">REV</button>
  <button class="filter" data-cat="crypto">CRYPTO</button>
</div>

<input id="searchInput" type="text" placeholder="Search title / key..." />

<section class="grid" id="grid">
  <!-- JS가 카드 렌더 -->
</section>

<button class="btn btn-ghost" id="clearLogBtn">Clear</button>
<pre id="log" class="log"></pre>

<script src="/static/app.js"></script>
-->
```

---

## 전역 상태(데이터) 4개가 핵심
- `allChallenges`: 서버에서 받아온 “전체 문제 리스트(배열)”
- `activeCat`: 현재 필터(예: `all/pwn/web/...`)
- `activeQuery`: 검색창 내용
- `runningMap`: “지금 켜져 있는 인스턴스” 저장소. key는 challenge `key`, 값은 `{ instance_id, url }`

코드(주석 처리):
```js
// let allChallenges = [];
// let activeCat = "all";
// let activeQuery = "";
//
// // key -> { instance_id, url }
// const runningMap = new Map();
```

---

## 함수별로 동작 이해하기

### 1) `log(line)`
- 화면의 “Console”(HTML의 `#log`)에 시간 붙여서 로그를 누적합니다.
- `#log`가 없으면(혹은 DOM을 못 찾으면) 브라우저 콘솔(`console.log`)로 출력합니다.
- 로그가 쌓일 때 자동으로 맨 아래로 스크롤합니다.

코드(주석 처리):
```js
// function log(line) {
//   const ts = new Date().toLocaleTimeString();
//   if (!logEl) {
//     console.log(`[${ts}] ${line}`);
//     return;
//   }
//   logEl.textContent += `[${ts}] ${line}\n`;
//   logEl.scrollTop = logEl.scrollHeight;
// }
```

### 2) `setApiStatus(ok)`
- 상단 상태 배지(`.dot`, `#apiStatus`)를 online/offline로 바꿉니다.
- API가 정상일 때/아닐 때 색과 텍스트를 다르게 보여줍니다.

코드(주석 처리):
```js
// function setApiStatus(ok) {
//   const dot = document.querySelector(".dot");
//   if (!dot || !apiStatusEl) return;
//   if (ok) {
//     dot.style.background = "var(--ok)";
//     dot.style.boxShadow = "0 0 0 4px rgba(46,229,157,0.12)";
//     apiStatusEl.textContent = "API: online";
//   } else {
//     dot.style.background = "var(--danger)";
//     dot.style.boxShadow = "0 0 0 4px rgba(255,77,109,0.12)";
//     apiStatusEl.textContent = "API: offline (fallback data)";
//   }
// }
```

### 3) `safeJson(res)`
- `fetch()` 응답(`Response`)의 바디를 **텍스트로 먼저 읽어서** 일부를 로그에 남긴 뒤(JSON이 아닐 때 서버 에러 확인용), `JSON.parse`로 JSON을 파싱합니다.
- JSON 파싱이 실패하면 명확한 에러를 던집니다.
- 주의: 이 함수는 `res.text()`로 바디를 한 번 읽어서 “소모”하기 때문에, 이후에 같은 `res`에 `res.json()`을 다시 호출하면 안 됩니다.

코드(주석 처리):
```js
// async function safeJson(res) {
//   const text = await res.text();
//   // 디버깅에 매우 유용
//   log(`HTTP ${res.status} raw: ${text.slice(0, 200)}${text.length > 200 ? "..." : ""}`);
//
//   try {
//     return JSON.parse(text);
//   } catch (e) {
//     throw new Error("응답이 JSON이 아닙니다 (서버 에러/404 가능).");
//   }
// }
```

### 4) `fetchWithTimeout(url, options, timeoutMs)`
- `fetch()`에 타임아웃을 붙입니다.
- `AbortController`로 `timeoutMs`가 지나면 요청을 abort합니다.
- `finally`에서 타이머를 정리해서(메모리/중복 실행 방지) 안정적으로 동작하게 합니다.

코드(주석 처리):
```js
// async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
//   const controller = new AbortController();
//   const id = setTimeout(() => controller.abort(), timeoutMs);
//   try {
//     return await fetch(url, { ...options, signal: controller.signal });
//   } finally {
//     clearTimeout(id);
//   }
// }
```

### 5) `loadChallenges()`
- 먼저 서버에서 `GET /api/challenges`로 문제 목록을 가져오려고 시도합니다.
- 성공하면 서버 응답 형태(보통 `{ key: challengeObj }`)를 **프론트에서 쓰기 쉬운 배열 형태**로 변환/정규화합니다.
- 실패하면 fallback(하드코딩된 샘플 문제 2개)을 반환해서 UI가 죽지 않게 합니다.
- 성공/실패에 따라 `setApiStatus(true/false)`로 상단 API 상태 표시도 갱신합니다.

코드(주석 처리):
```js
// async function loadChallenges() {
//   // fallback 데이터 (서버 엔드포인트 없을 때도 UI 확인 가능)
//   const fallback = [
//     {
//       key: "pwn1",
//       title: "기초 버퍼 오버플로우",
//       category: "pwn",
//       score: 100,
//       desc: "Basic buffer overflow challenge.",
//       tags: ["#pwn", "#easy"],
//       downloads: []
//     },
//     {
//       key: "web1",
//       title: "반사형 XSS",
//       category: "web",
//       score: 150,
//       desc: "Simple reflected XSS challenge.",
//       tags: ["#web", "#xss"],
//       locked: true,
//       downloads: []
//     }
//   ];
//
//   try {
//     const res = await fetchWithTimeout("/api/challenges", {}, 5000);
//     if (!res.ok) throw new Error(`GET /api/challenges failed: ${res.status}`);
//     const data = await res.json();
//
//     // 기대 형태 예시:
//     // { "pwn1": {title, dir, category, score, ...}, "web1": {...} }
//     // -> 프론트에서 배열로 변환
//     const arr = Object.entries(data).map(([key, v]) => {
//       const cat = (v.type ?? v.category ?? "misc").toLowerCase();
//       return {
//         key,
//         title: v.title ?? key,
//         category: cat,
//         type: v.type ?? null,
//         score: v.score ?? 0,
//         desc: v.desc ?? v.description ?? "No description.",
//         tags: v.tags ?? [`#${cat}`],
//         locked: v.locked ?? false,
//         downloads: Array.isArray(v.downloads) ? v.downloads : []
//       };
//     });
//
//     setApiStatus(true);
//     log(`Loaded challenges from API: ${arr.length}`);
//     return arr;
//   } catch (e) {
//     setApiStatus(false);
//     const reason = e.name === "AbortError" ? "timeout" : e.message;
//     log(`API load failed -> fallback 사용: ${reason}`);
//     return fallback;
//   }
// }
```

### 6) `normalizeCat(cat)`
- 문제의 `type`/`category`가 들쭉날쭉해도 UI는 일정하게 처리할 수 있게 카테고리를 정규화합니다.
- 허용된 값(`pwn/web/rev/crypto`)이 아니면 `misc`로 보냅니다.

코드(주석 처리):
```js
// function normalizeCat(cat) {
//   const c = (cat || "").toLowerCase();
//   if (["pwn","web","rev","crypto"].includes(c)) return c;
//   return "misc";
// }
```

### 7) `formatBytes(bytes)`
- 다운로드 파일 사이즈(바이트)를 사람이 보기 좋은 단위로 바꿉니다.
- 예: `1234` → `1.2 KB` 같은 형태.

코드(주석 처리):
```js
// function formatBytes(bytes) {
//   if (!Number.isFinite(bytes) || bytes <= 0) return "";
//   const units = ["B", "KB", "MB", "GB"];
//   let size = bytes;
//   let idx = 0;
//   while (size >= 1024 && idx < units.length - 1) {
//     size /= 1024;
//     idx += 1;
//   }
//   return `${size.toFixed(size >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
// }
```

### 8) `renderDownloads(ch)`
- `ch.downloads` 목록을 다운로드 링크 HTML로 만들어 카드에 삽입합니다.
- `{ url, label(name), size }` 같은 형태를 기대합니다.
- 링크에 `download` 속성을 넣어서 브라우저가 “다운로드”로 처리하도록 힌트를 줍니다.

코드(주석 처리):
```js
// function renderDownloads(ch) {
//   const files = Array.isArray(ch.downloads) ? ch.downloads : [];
//   if (!files.length) return "";
//
//   const items = files.filter(f => f && f.url).map(f => {
//     const label = escapeHtml(String(f.label ?? f.name ?? "file"));
//     const sizeLabel = formatBytes(Number(f.size));
//     const sizeHtml = sizeLabel ? `<span class="download-size">${escapeHtml(sizeLabel)}</span>` : "";
//     return `<a class="download-link" href="${escapeAttr(String(f.url))}" download rel="noreferrer">${label}${sizeHtml}</a>`;
//   }).join("");
//
//   if (!items) return "";
//
//   return `
//     <div class="downloads">
//       <div class="small">Downloads</div>
//       <div class="download-list">${items}</div>
//     </div>
//   `;
// }
```

### 9) `parseHostPort(url)`
- 인스턴스 URL에서 `host`와 `port`를 뽑아내서, `nc host port` 같은 힌트를 만들 때 사용합니다.
- `new URL(url)`이 실패할 수 있어서(프로토콜 없는 주소 등) fallback 파싱도 포함되어 있습니다.

코드(주석 처리):
```js
// function parseHostPort(url) {
//   try {
//     const u = new URL(url);
//     const port = u.port || (u.protocol === "https:" ? "443" : "80");
//     return { host: u.hostname, port };
//   } catch {
//     const raw = String(url);
//     const noProto = raw.replace(/^[a-z]+:\/\//i, "");
//     const hostPort = noProto.split("/")[0];
//     const [host, port] = hostPort.split(":");
//     return { host, port };
//   }
// }
```

### 10) `buildConnectHint(ch, instance)`
- 카테고리에 따라 “접속 방법 문자열”을 생성합니다.
- `pwn/crypto`는 `nc host port`.
- `web`은 URL 그대로.
- `rev`는 네트워크 서비스가 없다고 안내.

코드(주석 처리):
```js
// function buildConnectHint(ch, instance) {
//   if (!instance?.url) return "-";
//   const cat = normalizeCat(ch.type ?? ch.category);
//   const { host, port } = parseHostPort(instance.url);
//
//   if (cat === "pwn" || cat === "crypto") {
//     if (host && port) return `nc ${host} ${port}`;
//     return `nc ${instance.url}`;
//   }
//   if (cat === "web") {
//     return instance.url;
//   }
//   if (cat === "rev") {
//     return "No network service. Download files.";
//   }
//   return instance.url;
// }
```

### 11) `cardHTML(ch)`
- “문제 1개”를 카드 UI로 만들기 위한 HTML 문자열을 생성합니다.
- `runningMap`을 보고 실행 중인지(`isRunning`) 판단해서 UI를 바꿉니다.
- `locked`면 Start/Stop을 막고 `Locked`로 표시합니다.
- 실행 중이면 인스턴스 패널(Instance ID, URL, Connect, Copy)이 보이게(`show`) 만듭니다.
- 버튼에는 `data-action`을 붙여서 클릭 이벤트에서 어떤 동작인지 분기합니다.

코드(주석 처리):
```js
// function cardHTML(ch) {
//   const cat = normalizeCat(ch.type ?? ch.category);
//   const tags = (ch.tags || []).map(t => `<span class="tag">${escapeHtml(String(t))}</span>`).join("");
//
//   const isRunning = runningMap.has(ch.key);
//   const locked = !!ch.locked;
//
//   const startDisabled = locked || isRunning;
//   const stopDisabled = locked || !isRunning;
//
//   const instance = runningMap.get(ch.key);
//   const downloads = renderDownloads(ch);
//   const connectHint = instance ? buildConnectHint(ch, instance) : "-";
//
//   return `
//     <div class="card" data-key="${escapeHtml(ch.key)}" data-cat="${cat}">
//       <div class="card-top">
//         <span class="badge ${cat}">
//           <span class="chip"></span>
//           ${cat.toUpperCase()}
//         </span>
//         <span class="points">${Number(ch.score || 0)} pts</span>
//       </div>
//
//       <h3 class="title">${escapeHtml(ch.title || ch.key)}</h3>
//
//       <p class="desc">${escapeHtml(ch.desc || "No description.")}</p>
//
//       <div class="meta-row">
//         <span class="tag">#${escapeHtml(ch.key)}</span>
//         ${tags}
//       </div>
//
//       ${downloads}
//
//       <div class="actions">
//         <button class="btn" data-action="start" ${startDisabled ? "disabled" : ""}>
//           ${locked ? "Locked" : (isRunning ? "Running" : "Start Instance")}
//         </button>
//
//         <button class="btn btn-danger" data-action="stop" ${stopDisabled ? "disabled" : ""}>
//           Stop
//         </button>
//       </div>
//
//       <div class="instance ${isRunning ? "show" : ""}">
//         <div class="row">
//           <div>
//             <div class="small">Instance</div>
//             <div class="small">ID: <span data-field="instance_id">${instance ? instance.instance_id : "-"}</span></div>
//           </div>
//           <div>
//             ${instance ? `<a href="${escapeAttr(instance.url)}" target="_blank" rel="noreferrer">Open</a>` : ""}
//           </div>
//         </div>
//
//         <div class="row" style="margin-top:8px;">
//           <div style="flex:1; min-width:0;">
//             <div class="small">URL</div>
//             <div class="small" style="word-break:break-all;">
//               <span data-field="url">${instance ? escapeHtml(instance.url) : "-"}</span>
//             </div>
//           </div>
//           <div style="display:flex; gap:8px;">
//             <button class="btn btn-ghost" data-action="copy" ${instance ? "" : "disabled"}>Copy</button>
//           </div>
//         </div>
//
//         <div class="row" style="margin-top:8px;">
//           <div style="flex:1; min-width:0;">
//             <div class="small">Connect</div>
//             <div class="small" style="word-break:break-all;">
//               <span data-field="connect">${instance ? escapeHtml(connectHint) : "-"}</span>
//             </div>
//           </div>
//           <div style="display:flex; gap:8px;">
//             <button class="btn btn-ghost" data-action="copy-connect" ${instance ? "" : "disabled"}>Copy</button>
//           </div>
//         </div>
//       </div>
//     </div>
//   `;
// }
```

### 12) `escapeHtml(str)`, `escapeAttr(str)`
- 서버에서 받은 문자열이 그대로 HTML로 들어가면 XSS 같은 문제가 생길 수 있어요.
- 그래서 카드 렌더 시 최소한의 이스케이프를 적용합니다.
- `escapeHtml`은 텍스트 출력용, `escapeAttr`은 `href` 속성용 최소 처리입니다.

코드(주석 처리):
```js
// function escapeHtml(str) {
//   return str
//     .replaceAll("&", "&amp;")
//     .replaceAll("<", "&lt;")
//     .replaceAll(">", "&gt;")
//     .replaceAll('"', "&quot;")
//     .replaceAll("'", "&#039;");
// }
//
// function escapeAttr(str) {
//   // href attribute용 최소 처리
//   return String(str).replaceAll('"', "%22");
// }
```

### 13) `render()`
- `allChallenges`에서 현재 필터(`activeCat`)와 검색어(`activeQuery`)를 적용해 보여줄 목록을 만들고,
- 그 결과를 `#grid`에 `innerHTML`로 통째로 다시 그립니다.
- 즉, 상태가 바뀔 때마다 UI를 “전체 재생성”하는 구조입니다.

코드(주석 처리):
```js
// function render() {
//   if (!grid) return;
//   const filtered = allChallenges.filter(ch => {
//     const cat = normalizeCat(ch.type ?? ch.category);
//     const okCat = (activeCat === "all") ? true : (cat === activeCat);
//     const q = activeQuery.trim().toLowerCase();
//     const okQ = !q
//       ? true
//       : (String(ch.key).toLowerCase().includes(q) || String(ch.title || "").toLowerCase().includes(q));
//     return okCat && okQ;
//   });
//
//   grid.innerHTML = filtered.map(cardHTML).join("");
// }
```

### 14) `startInstance(problemKey)`
- 사용자가 Start 버튼을 누르면 `POST /start`를 호출합니다.
- 바디는 `{ problem: problemKey }` 형태로 보냅니다.
- 응답이 성공(`status: "ok"`)이면 `runningMap`에 `{instance_id, url}`을 저장하고 `render()`로 UI를 갱신합니다.

코드(주석 처리):
```js
// async function startInstance(problemKey) {
//   log(`Start 요청: ${problemKey}`);
//
//   const res = await fetch("/start", {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({ problem: problemKey })
//   });
//
//   const data = await safeJson(res);
//
//   if (!res.ok || data.status !== "ok") {
//     const msg = data.error ? String(data.error) : "Start failed";
//     throw new Error(msg);
//   }
//
//   runningMap.set(problemKey, {
//     instance_id: data.instance_id,
//     url: data.url
//   });
//
//   log(`Start OK: instance_id=${data.instance_id} url=${data.url}`);
//   render();
// }
```

### 15) `stopInstance(problemKey)`
- Stop 버튼을 누르면, 먼저 `runningMap`에서 해당 문제의 `{instance_id, url}`을 꺼냅니다.
- 그리고 `POST /stop/{instance_id}`를 호출합니다.
- 성공(`status: "ok"`)이면 `runningMap`에서 지우고 `render()`로 UI를 갱신합니다.

코드(주석 처리):
```js
// async function stopInstance(problemKey) {
//   const instance = runningMap.get(problemKey);
//   if (!instance) return;
//
//   log(`Stop 요청: ${problemKey} (instance_id=${instance.instance_id})`);
//
//   // 네 서버가 /stop/{id} 형태라고 가정 (이전 대화 흐름 기준)
//   const res = await fetch(`/stop/${instance.instance_id}`, { method: "POST" });
//
//   const data = await safeJson(res);
//
//   if (!res.ok || data.status !== "ok") {
//     const msg = data.error ? String(data.error) : "Stop failed";
//     throw new Error(msg);
//   }
//
//   runningMap.delete(problemKey);
//   log(`Stop OK: instance_id=${instance.instance_id}`);
//   render();
// }
```

### 16) `copyText(text, logLabel)`
- 클립보드에 텍스트를 복사합니다.
- 우선 `navigator.clipboard.writeText()`를 시도하고,
- 권한/환경 문제로 실패하면 `<textarea>`를 만들어 `document.execCommand("copy")`로 fallback 합니다.

코드(주석 처리):
```js
// async function copyText(text, logLabel) {
//   if (!text) return;
//   try {
//     await navigator.clipboard.writeText(text);
//     log(logLabel || `Copied: ${text}`);
//   } catch {
//     // clipboard 권한 안 될 때 fallback
//     const ta = document.createElement("textarea");
//     ta.value = text;
//     document.body.appendChild(ta);
//     ta.select();
//     document.execCommand("copy");
//     ta.remove();
//     log(logLabel ? `${logLabel} (fallback)` : `Copied (fallback): ${text}`);
//   }
// }
```

### 17) `copyUrl(problemKey)` / `copyConnect(problemKey)`
- `copyUrl`: 현재 실행 중인 인스턴스의 `url`을 클립보드로 복사합니다.
- `copyConnect`: 카테고리에 따라 `nc host port` 또는 URL을 만들어 복사합니다.

코드(주석 처리):
```js
// async function copyUrl(problemKey) {
//   const instance = runningMap.get(problemKey);
//   if (!instance?.url) return;
//   await copyText(instance.url, `Copied: ${instance.url}`);
// }
//
// async function copyConnect(problemKey) {
//   const instance = runningMap.get(problemKey);
//   const ch = allChallenges.find(c => c.key === problemKey);
//   if (!instance?.url || !ch) return;
//   const hint = buildConnectHint(ch, instance);
//   if (!hint || hint === "-") return;
//   await copyText(hint, `Copied: ${hint}`);
// }
```

### 18) 카드 클릭 이벤트: “이벤트 위임”
- `render()`가 `innerHTML`로 그리드 전체를 갈아엎기 때문에, 카드마다 이벤트를 붙이면 렌더마다 이벤트가 날아갑니다.
- 그래서 `#grid` 한 군데에만 클릭 이벤트를 붙여서, 클릭된 요소의 `data-action`으로 분기하는 구조입니다.

코드(주석 처리):
```js
// // 이벤트 위임
// if (grid) {
//   grid.addEventListener("click", async (e) => {
//     const btn = e.target.closest("button");
//     if (!btn) return;
//
//     const card = e.target.closest(".card");
//     if (!card) return;
//
//     const key = card.dataset.key;
//     const action = btn.dataset.action;
//
//     try {
//       if (action === "start") {
//         btn.disabled = true;
//         await startInstance(key);
//       } else if (action === "stop") {
//         btn.disabled = true;
//         await stopInstance(key);
//       } else if (action === "copy") {
//         await copyUrl(key);
//       } else if (action === "copy-connect") {
//         await copyConnect(key);
//       }
//     } catch (err) {
//       log(`ERROR: ${err.message}`);
//       console.error(err);
//     } finally {
//       render(); // 버튼 상태 갱신
//     }
//   });
// }
```

### 19) 필터/검색/로그 클리어 이벤트
- 필터 클릭: `activeCat`을 바꾸고 `render()`로 재렌더.
- 검색 입력: `activeQuery`를 바꾸고 `render()`로 재렌더.
- Clear 클릭: `#log` 내용을 비움.

코드(주석 처리):
```js
// // 필터
// if (filtersEl) {
//   filtersEl.addEventListener("click", (e) => {
//     const b = e.target.closest("button.filter");
//     if (!b) return;
//
//     [...filtersEl.querySelectorAll(".filter")].forEach(x => x.classList.remove("active"));
//     b.classList.add("active");
//
//     activeCat = b.dataset.cat;
//     render();
//   });
// }
//
// // 검색
// if (searchInput) {
//   searchInput.addEventListener("input", (e) => {
//     activeQuery = e.target.value || "";
//     render();
//   });
// }
//
// if (clearLogBtn) {
//   clearLogBtn.addEventListener("click", () => {
//     if (logEl) logEl.textContent = "";
//   });
// }
```

### 20) `boot()` (즉시 실행 함수, IIFE)
- 페이지 로드 직후 한 번 실행됩니다.
- `loadChallenges()`로 목록을 받아 `allChallenges`에 저장하고, `render()`로 최초 화면을 그립니다.

코드(주석 처리):
```js
// (async function boot() {
//   log("Front boot...");
//   allChallenges = await loadChallenges();
//   render();
// })();
```

---

## API 기대 형태(프론트 기준)
- `GET /api/challenges`: 객체 형태(키가 challenge key), 프론트에서 배열로 변환.
- `POST /start`: `{ status: "ok", instance_id, url }`
- `POST /stop/{instance_id}`: `{ status: "ok" }`
