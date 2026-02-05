(() => {
  const { dom, state, log, safeJson, fetchWithTimeout, setApiStatus, normalizeCat, formatBytes, escapeHtml, escapeAttr, buildConnectHint } = window.HEXACTF;

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

  function cardHTML(ch) {
    const cat = normalizeCat(ch.type ?? ch.category);
    const tags = (ch.tags || []).map(t => `<span class="tag">${escapeHtml(String(t))}</span>`).join("");

    const isRunning = state.runningMap.has(ch.key);
    const locked = !!ch.locked;

    const startDisabled = locked || isRunning;
    const stopDisabled = locked || !isRunning;

    const instance = state.runningMap.get(ch.key);
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

  function render() {
    if (!dom.grid) return;
    const filtered = state.allChallenges.filter(ch => {
      const cat = normalizeCat(ch.type ?? ch.category);
      const okCat = (state.activeCat === "all") ? true : (cat === state.activeCat);
      const q = state.activeQuery.trim().toLowerCase();
      const okQ = !q
        ? true
        : (String(ch.key).toLowerCase().includes(q) || String(ch.title || "").toLowerCase().includes(q));
      return okCat && okQ;
    });

    dom.grid.innerHTML = filtered.map(cardHTML).join("");
  }

  async function loadChallenges() {
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

  async function loadInstances() {
    const headers = window.HEXACTF.authHeaders ? window.HEXACTF.authHeaders() : {};
    try {
      const res = await fetchWithTimeout("/api/instances", { headers }, 5000);
      const data = await safeJson(res);
      if (!res.ok || data.status !== "ok") {
        throw new Error(data.detail || data.error || "Failed to load instances");
      }

      const instances = Array.isArray(data.instances) ? data.instances : [];
      state.runningMap.clear();
      instances.forEach(inst => {
        if (!inst || !inst.problem) return;
        if (inst.status === "error") return;
        state.runningMap.set(String(inst.problem), {
          instance_id: inst.instance_id,
          url: inst.url
        });
      });
      return instances;
    } catch (e) {
      const reason = e.name === "AbortError" ? "timeout" : e.message;
      log(`Instances load failed: ${reason}`);
      return [];
    }
  }

  async function startInstance(problemKey) {
    log(`Start 요청: ${problemKey}`);

    const res = await fetch("/start", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(window.HEXACTF.authHeaders ? window.HEXACTF.authHeaders() : {}) },
      body: JSON.stringify({ problem: problemKey })
    });

    const data = await safeJson(res);

    if (!res.ok || data.status !== "ok") {
      const msg = data.detail || data.error || "Start failed";
      throw new Error(msg);
    }

    state.runningMap.set(problemKey, {
      instance_id: data.instance_id,
      url: data.url
    });

    log(`Start OK: instance_id=${data.instance_id} url=${data.url}`);
    render();
  }

  async function stopInstance(problemKey) {
    const instance = state.runningMap.get(problemKey);
    if (!instance) return;

    log(`Stop 요청: ${problemKey} (instance_id=${instance.instance_id})`);

    const res = await fetch(`/stop/${instance.instance_id}`, {
      method: "POST",
      headers: { ...(window.HEXACTF.authHeaders ? window.HEXACTF.authHeaders() : {}) }
    });

    const data = await safeJson(res);

    if (!res.ok || data.status !== "ok") {
      const msg = data.detail || data.error || "Stop failed";
      throw new Error(msg);
    }

    state.runningMap.delete(problemKey);
    log(`Stop OK: instance_id=${instance.instance_id}`);
    render();
  }

  async function copyText(text, logLabel) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      log(logLabel || `Copied: ${text}`);
    } catch {
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
    const instance = state.runningMap.get(problemKey);
    if (!instance?.url) return;
    await copyText(instance.url, `Copied: ${instance.url}`);
  }

  async function copyConnect(problemKey) {
    const instance = state.runningMap.get(problemKey);
    const ch = state.allChallenges.find(c => c.key === problemKey);
    if (!instance?.url || !ch) return;
    const hint = buildConnectHint(ch, instance);
    if (!hint || hint === "-") return;
    await copyText(hint, `Copied: ${hint}`);
  }

  if (dom.grid) {
    dom.grid.addEventListener("click", async (e) => {
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
        render();
      }
    });
  }

  if (dom.filtersEl) {
    dom.filtersEl.addEventListener("click", (e) => {
      const b = e.target.closest("button.filter");
      if (!b) return;

      [...dom.filtersEl.querySelectorAll(".filter")].forEach(x => x.classList.remove("active"));
      b.classList.add("active");

      state.activeCat = b.dataset.cat;
      render();
    });
  }

  if (dom.searchInput) {
    dom.searchInput.addEventListener("input", (e) => {
      state.activeQuery = e.target.value || "";
      render();
    });
  }

  if (dom.clearLogBtn) {
    dom.clearLogBtn.addEventListener("click", () => {
      if (dom.logEl) dom.logEl.textContent = "";
    });
  }

  window.HEXACTF = Object.assign(window.HEXACTF || {}, {
    challenges: {
      loadChallenges,
      loadInstances,
      render
    }
  });
})();
