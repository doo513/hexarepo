(() => {
  const { dom, state, log, safeJson, fetchWithTimeout, normalizeCat, formatBytes, escapeHtml, escapeAttr, buildConnectHint, normalizeInstanceUrl } = window.HEXACTF;

  let visibilityState = { visible: true, opens_at: null, server_time: null };
  let countdownInterval = null;

  async function fetchVisibility() {
    try {
      const res = await fetch('/api/visibility', { cache: 'no-store' });
      return await res.json();
    } catch { return visibilityState; }
  }

  function formatCountdown(ms) {
    if (ms <= 0) return '00:00:00';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  }

  function formatKstFromIso(isoStr) {
    if (!isoStr) return '';
    try {
      return new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
      }).format(new Date(isoStr));
    } catch { return isoStr; }
  }

  function showClosedOverlay(opensAt, closesAt) {
    const overlay = document.getElementById('challengesClosedOverlay');
    const contentWrap = document.getElementById('challengesContentWrap');
    const titleEl = document.getElementById('closedMessageTitle');
    const subEl = document.getElementById('closedMessageSub');
    const countdownWrap = document.getElementById('countdownWrap');
    const countdownTimer = document.getElementById('countdownTimer');
    const countdownTarget = document.getElementById('countdownTargetTime');

    if (overlay) overlay.classList.remove('hidden');
    if (contentWrap) contentWrap.classList.add('hidden');

    // Check if CTF has ended (close time has passed)
    var hasEnded = false;
    if (closesAt) {
      var closeMs = Date.parse(closesAt);
      if (Number.isFinite(closeMs) && closeMs <= Date.now()) {
        hasEnded = true;
      }
    }

    if (hasEnded) {
      // CTF ended - show completion message
      if (titleEl) titleEl.textContent = 'HackerLogin 30\uAE30 \uC120\uBC1C CTF\uAC00 \uC885\uB8CC \uB418\uC5C8\uC2B5\uB2C8\uB2E4';
      if (subEl) subEl.textContent = '\uACE0\uC0DD\uD558\uC168\uC2B5\uB2C8\uB2E4 :)';
      if (countdownWrap) countdownWrap.classList.add('hidden');
      stopCountdown();
    } else if (opensAt) {
      // Not yet opened - show countdown
      if (titleEl) titleEl.textContent = 'CTF \uBB38\uC81C\uAC00 \uC544\uC9C1 \uACF5\uAC1C\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4';
      if (subEl) subEl.textContent = '';
      if (countdownWrap) countdownWrap.classList.remove('hidden');
      if (countdownTarget) countdownTarget.textContent = formatKstFromIso(opensAt) + ' \uACF5\uAC1C \uC608\uC815';
      startCountdown(opensAt);
    } else {
      // Generic closed
      if (titleEl) titleEl.textContent = 'CTF \uBB38\uC81C\uB97C \uC544\uC9C1 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4';
      if (subEl) subEl.textContent = '';
      if (countdownWrap) countdownWrap.classList.add('hidden');
      stopCountdown();
    }
  }

  function hideClosedOverlay() {
    const overlay = document.getElementById('challengesClosedOverlay');
    const contentWrap = document.getElementById('challengesContentWrap');
    if (overlay) overlay.classList.add('hidden');
    if (contentWrap) contentWrap.classList.remove('hidden');
    stopCountdown();
  }

  function startCountdown(opensAtIso) {
    stopCountdown();
    const targetMs = Date.parse(opensAtIso);
    if (!Number.isFinite(targetMs)) return;
    function tick() {
      const remaining = targetMs - Date.now();
      const el = document.getElementById('countdownTimer');
      if (el) el.textContent = formatCountdown(remaining);
      if (remaining <= 0) { stopCountdown(); checkVisibilityAndRender(); }
    }
    tick();
    countdownInterval = setInterval(tick, 1000);
  }

  function stopCountdown() {
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
  }

  async function checkVisibilityAndRender() {
    const isAdmin = state.auth?.user?.role === 'admin';
    const vis = await fetchVisibility();
    visibilityState = vis;
    if (vis.challenges_visible || isAdmin) {
      hideClosedOverlay();
      const arr = await loadChallenges();
      state.allChallenges = arr;
      render();
      loadInstances();
    } else {
      showClosedOverlay(vis.challenges_opens_at, vis.challenges_closes_at);
    }
  }


  function categoryLabel(cat) {
    switch (cat) {
      case "pwn": return "PWNABLE";
      case "rev": return "REVERSING";
      case "crypto": return "CRYPTO";
      case "web": return "WEB";
      case "forensic": return "FORENSIC";
      default:
        return String(cat || "misc").replaceAll("_", " ").toUpperCase();
    }
  }

  function categoryIcon(cat) {
    switch (cat) {
      case "web": return "language";
      case "pwn": return "terminal";
      case "rev": return "settings_backup_restore";
      case "crypto": return "lock";
      case "forensic": return "search";
      default: return "category";
    }
  }

  function categoryTone(cat) {
    switch (cat) {
      case "web": return { chip: "bg-sky-100 text-sky-600", icon: "text-sky-600 bg-sky-50", score: "text-sky-600" };
      case "pwn": return { chip: "bg-rose-100 text-rose-600", icon: "text-rose-600 bg-rose-50", score: "text-rose-600" };
      case "rev": return { chip: "bg-violet-100 text-violet-600", icon: "text-violet-600 bg-violet-50", score: "text-violet-600" };
      case "crypto": return { chip: "bg-emerald-100 text-emerald-600", icon: "text-emerald-600 bg-emerald-50", score: "text-emerald-600" };
      case "forensic": return { chip: "bg-amber-100 text-amber-700", icon: "text-amber-700 bg-amber-50", score: "text-amber-700" };
      default: return { chip: "bg-slate-100 text-slate-600", icon: "text-slate-600 bg-slate-100", score: "text-indigo-700" };
    }
  }

  function detailDifficulty(ch) {
    return String(ch.difficulty || "Beginner").toUpperCase();
  }

  function isSolved(key) {
    const solved = state.auth?.user?.solved_problems;
    return Array.isArray(solved) && solved.includes(key);
  }


  function getCategoryOptions() {
    const seen = new Set();
    const order = ["web", "pwn", "rev", "crypto"];
    const categories = [];

    state.allChallenges.forEach(ch => {
      const cat = normalizeCat(ch.type ?? ch.category);
      if (!seen.has(cat)) {
        seen.add(cat);
        categories.push(cat);
      }
    });

    categories.sort((a, b) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      if (ai !== -1 || bi !== -1) {
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      }
      return a.localeCompare(b);
    });

    return categories;
  }

  function renderProgress() {
    const total = state.allChallenges.length;
    const solved = state.allChallenges.filter(ch => isSolved(ch.key)).length;
    const pct = total > 0 ? Math.round((solved / total) * 100) : 0;

    if (dom.challengeProgressLabel) dom.challengeProgressLabel.textContent = "문제 풀이 현황";
    if (dom.challengeProgressValue) dom.challengeProgressValue.textContent = `${solved}/${total}`;
    if (dom.challengeProgressBar) dom.challengeProgressBar.style.width = `${pct}%`;
  }

  function renderCategoryControls() {
    const categories = getCategoryOptions();

    if (dom.filtersEl) {
      dom.filtersEl.innerHTML = [
        `<button class="filter ${state.activeCat === "all" ? "active" : ""} px-4 py-1.5 rounded-full border border-slate-300 text-slate-500 text-[11px] font-bold uppercase tracking-wider" data-cat="all">ALL</button>`,
        ...categories.map(cat => `<button class="filter ${state.activeCat === cat ? "active" : ""} px-4 py-1.5 rounded-full border border-slate-300 text-slate-500 text-[11px] font-bold uppercase tracking-wider" data-cat="${escapeAttr(cat)}">${escapeHtml(categoryLabel(cat))}</button>`)
      ].join("");
    }

    if (dom.sidebarCategoryNav) {
      dom.sidebarCategoryNav.innerHTML = categories.map(cat => `
        <button class="side-link category-side-link ${state.activeCat === cat ? "active" : ""} flex items-center gap-3 py-2 px-4 text-slate-600 hover:bg-slate-100 transition-transform duration-200 hover:translate-x-1 rounded w-full text-left" type="button" data-cat="${escapeAttr(cat)}">
          <span class="material-symbols-outlined text-[20px]">${escapeHtml(categoryIcon(cat))}</span>
          <span class="side-link-label uppercase text-xs tracking-widest">${escapeHtml(categoryLabel(cat))}</span>
        </button>
      `).join("");
    }
  }

  function setActiveCategory(cat, { scrollToGrid = false } = {}) {
    state.activeCat = cat || "all";
    renderCategoryControls();
    render();
    if (scrollToGrid && dom.grid) {
      dom.grid.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function canOpenInstance(ch, instance) {
    const accessMode = String(instance?.access_mode || ch.access_mode || "").toLowerCase();
    if (accessMode) return accessMode !== "tcp";
    const cat = normalizeCat(ch.type ?? ch.category);
    return cat !== "pwn" && cat !== "crypto";
  }

  function runningBadge(ch) {
    const instance = state.runningMap.get(ch.key);
    if (!instance) return "";
    return `<div class="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-700"><span class="material-symbols-outlined text-[14px]">bolt</span><span>서버 실행중</span></div>`;
  }

  function renderCard(ch) {
    const cat = normalizeCat(ch.type ?? ch.category);
    const icon = categoryIcon(cat);
    const catLabel = categoryLabel(cat);
    const tone = categoryTone(cat);
    const solved = isSolved(ch.key);
    const solvedCardClass = solved ? "bg-emerald-50/60 border border-emerald-200/80" : "bg-surface-container-lowest";
    const solvedRibbon = solved
      ? `<div class="bg-emerald-500 text-white px-4 py-2 flex items-center gap-2 transform -rotate-12 absolute -top-2 -right-4 shadow-lg"><span class="material-symbols-outlined text-[16px]">check</span><span class="text-[10px] font-bold uppercase tracking-[0.18em]">Solved</span></div>`
      : "";

    const runningClass = state.runningMap.has(ch.key) ? "running-instance-card" : "";

    return `
      <article class="relative cursor-pointer ${solvedCardClass} shadow-[0_20px_40px_rgba(53,37,205,0.04)] p-6 flex flex-col gap-5 min-h-[280px] hover:-translate-y-1 transition-transform ${runningClass}" data-key="${escapeHtml(ch.key)}" data-cat="${cat}" id="challenge-${escapeHtml(ch.key)}">
        ${solvedRibbon}
        <div class="flex items-start justify-between gap-4">
          <span class="inline-flex items-center px-3 py-1 text-[10px] font-bold tracking-widest uppercase ${tone.chip}">${catLabel}</span>
          <span class="font-headline font-black italic text-xl ${tone.score}">${Number(ch.score || 0)} PTS</span>
        </div>
        ${runningBadge(ch)}
        <div class="space-y-3 flex-1">
          <div class="flex items-center gap-3 text-slate-400 text-[10px] font-bold uppercase tracking-[0.18em]">
            <span class="material-symbols-outlined text-sm p-1 rounded-sm ${tone.icon}">${icon}</span>
            <span>${detailDifficulty(ch)}</span>
          </div>
          <h3 class="font-headline text-[1.45rem] font-bold tracking-tight text-on-surface leading-none">${escapeHtml(ch.title || ch.key)}</h3>
          <p class="text-sm text-on-surface-variant line-clamp-3 leading-relaxed">${escapeHtml(ch.desc || ch.description || "No description.")}</p>
        </div>
        <div class="flex items-end justify-between pt-4 border-t border-surface-container-low text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
          <div class="flex flex-col gap-1">
            <span>SOLVE COUNT</span>
            <span class="font-headline text-lg font-black tracking-normal text-on-surface">${Number(ch.solve_count || ch.solves || 0)}</span>
          </div>
          <button class="inline-flex items-center gap-1 text-indigo-600" type="button" data-action="open-detail">
            <span>View</span>
            <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
          </button>
        </div>
      </article>
    `;
  }

  let _renderRaf = null;
  function render() {
    if (!dom.grid) return;
    if (_renderRaf) cancelAnimationFrame(_renderRaf);
    _renderRaf = requestAnimationFrame(_doRender);
  }

  function _doRender() {
    _renderRaf = null;
    const filtered = state.allChallenges.filter(ch => {
      const cat = normalizeCat(ch.type ?? ch.category);
      const okCat = state.activeCat === "all" ? true : cat === state.activeCat;
      const q = state.activeQuery.trim().toLowerCase();
      const okQ = !q ? true : (String(ch.key).toLowerCase().includes(q) || String(ch.title || "").toLowerCase().includes(q));
      return okCat && okQ;
    });

    renderProgress();

    if (!filtered.length) {
      dom.grid.innerHTML = '<div class="col-span-full bg-surface-container-lowest rounded-lg p-12 text-center shadow-[0_20px_40px_rgba(53,37,205,0.04)]"><div class="font-headline text-2xl font-bold tracking-tight text-slate-700">No matching challenges</div><p class="mt-3 text-sm text-slate-500">Adjust the current filters or search query.</p></div>';
      return;
    }

    dom.grid.innerHTML = filtered.map(renderCard).join("");
  }

  function setDetailFlagMessage(message, type) {
    if (!dom.detailFlagMessage) return;
    dom.detailFlagMessage.textContent = message || "";
    dom.detailFlagMessage.classList.remove("ok", "error");
    if (type) dom.detailFlagMessage.classList.add(type);
  }

  function syncDetailInstance() {
    if (!state.detailChallenge) return;
    const key = state.detailChallenge.key;
    const instance = state.runningMap.get(key);
    const connectHint = instance ? buildConnectHint(state.detailChallenge, instance) : "-";

    if (dom.detailInstanceId) dom.detailInstanceId.textContent = instance ? instance.instance_id : "-";
    if (dom.detailInstanceUrl) {
      dom.detailInstanceUrl.textContent = instance ? instance.url : "-";
      if (instance?.url) {
        dom.detailInstanceUrl.href = instance.url;
      } else {
        dom.detailInstanceUrl.removeAttribute("href");
      }
    }
    if (dom.detailConnectHint) dom.detailConnectHint.textContent = instance ? connectHint : "-";
    if (dom.detailCopyBtn) dom.detailCopyBtn.disabled = !instance?.url;
    if (dom.detailCopyConnectBtn) dom.detailCopyConnectBtn.disabled = !instance?.url;
    if (dom.detailStopBtn) dom.detailStopBtn.disabled = !instance;

      if (dom.detailStartBtn) {
        const locked = !!state.detailChallenge.locked;
        dom.detailStartBtn.disabled = locked || !!instance;
        const labelEl = dom.detailStartBtn.querySelector("span:last-child");
        if (labelEl) {
          labelEl.textContent = locked ? "Locked" : (instance ? "생성중 / 실행중" : "서버 생성하기");
      }
    }
  }

  function renderDetail(ch) {
    state.currentDetailKey = ch.key;
    state.detailChallenge = ch;

    if (dom.detailCategory) dom.detailCategory.textContent = categoryLabel(normalizeCat(ch.type ?? ch.category));
    if (dom.detailDifficulty) dom.detailDifficulty.textContent = detailDifficulty(ch);
    if (dom.detailPoints) dom.detailPoints.textContent = `${Number(ch.score || 0)} PTS`;
    if (dom.detailTitle) dom.detailTitle.textContent = ch.title || ch.key;
    if (dom.detailSolves) dom.detailSolves.textContent = `${Number(ch.solve_count || ch.solves || 0)} Solves`;
    if (dom.detailDescription) dom.detailDescription.textContent = ch.briefing || ch.desc || ch.description || "No description.";

    if (dom.detailDownloadsWrap && dom.detailDownloads) {
      const files = Array.isArray(ch.downloads) ? ch.downloads : [];
      dom.detailDownloads.innerHTML = files.map(file => {
        const label = escapeHtml(String(file.label ?? file.name ?? "file"));
        const sizeLabel = formatBytes(Number(file.size));
        return `
          <a class="w-full group flex items-center justify-between p-4 bg-surface-container-low border border-outline-variant/20 hover:border-primary/40 hover:bg-surface-container-high transition-all" href="${escapeAttr(String(file.url))}" download rel="noreferrer">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 bg-primary/5 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                <span class="material-symbols-outlined">download</span>
              </div>
              <div class="text-left">
                <p class="text-[11px] font-bold text-on-surface uppercase tracking-widest">문제 파일 받기</p>
                <p class="text-[10px] text-on-surface/40">${label}${sizeLabel ? ` (${escapeHtml(sizeLabel)})` : ""}</p>
              </div>
            </div>
            <span class="material-symbols-outlined text-on-surface/20 group-hover:text-primary">arrow_forward</span>
          </a>
        `;
      }).join("");
      dom.detailDownloadsWrap.classList.toggle("hidden", files.length === 0);
    }

    if (dom.challengeDetailModal) {
      dom.challengeDetailModal.classList.remove("hidden");
      dom.challengeDetailModal.setAttribute("aria-hidden", "false");
      document.body.classList.add("overflow-hidden");
    }
    if (dom.detailContent) {
      dom.detailContent.scrollTop = 0;
    }

    setDetailFlagMessage("", "");
    if (dom.detailFlagInput) dom.detailFlagInput.value = "";
    syncDetailInstance();
  }

  function closeDetail(pushState = true) {
    if (dom.challengeDetailModal) {
      dom.challengeDetailModal.classList.add("hidden");
      dom.challengeDetailModal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("overflow-hidden");
    }
    state.currentDetailKey = null;
    state.detailChallenge = null;
    if (pushState && window.location.pathname !== "/challenges") {
      window.history.pushState({}, "", "/challenges");
    }
  }

  async function openDetail(key, pushState = true) {
    const res = await fetchWithTimeout(`/api/challenges/${encodeURIComponent(key)}`, {}, 5000);
    const data = await safeJson(res);
    if (!res.ok || data.status !== "ok" || !data.challenge) {
      throw new Error(data.detail || data.error || "Failed to load challenge detail");
    }
    renderDetail(data.challenge);
    if (pushState && window.location.pathname !== `/challenges/${encodeURIComponent(key)}`) {
      window.history.pushState({}, "", `/challenges/${encodeURIComponent(key)}`);
    }
  }

  async function submitFlag(problemKey) {
    const input = dom.detailFlagInput;
    if (!input) return;
    const flag = String(input.value || "").trim();
    if (!flag) {
      setDetailFlagMessage("Flag를 입력하세요.", "error");
      return;
    }

    const csrf = window.HEXACTF.getCsrfToken ? window.HEXACTF.getCsrfToken() : "";
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        ...(window.HEXACTF.authHeaders ? window.HEXACTF.authHeaders() : {})
      },
      body: JSON.stringify({ problem: problemKey, flag })
    });
    const data = await safeJson(res);

    if (!res.ok || data.status !== "ok") {
      throw new Error(data.detail || data.error || "Submit failed");
    }

    if (data.correct) {
      const bonus = Number(data.score_awarded || 0);
      const msg = data.already_solved
        ? "정답입니다. (이미 해결됨)"
        : (Number.isFinite(bonus) && bonus > 0 ? `정답입니다! +${bonus}점` : "정답입니다!");
      setDetailFlagMessage(msg, "ok");
      input.value = "";
      if (state.auth?.user && Array.isArray(state.auth.user.solved_problems) && !state.auth.user.solved_problems.includes(problemKey)) {
        state.auth.user.solved_problems.push(problemKey);
      }
      const challenge = state.allChallenges.find(item => item.key === problemKey);
      if (challenge) {
        challenge.solve_count = Number(challenge.solve_count || challenge.solves || 0) + (data.already_solved ? 0 : 1);
        challenge.solves = challenge.solve_count;
      }
      if (state.detailChallenge?.key === problemKey) {
        state.detailChallenge.solve_count = Number(state.detailChallenge.solve_count || state.detailChallenge.solves || 0) + (data.already_solved ? 0 : 1);
        state.detailChallenge.solves = state.detailChallenge.solve_count;
        if (dom.detailSolves) dom.detailSolves.textContent = `${Number(state.detailChallenge.solve_count || 0)} Solves`;
      }
      render();
      await loadInstances();
    } else {
      setDetailFlagMessage("오답입니다.", "error");
    }
  }

  async function loadChallenges() {
    const fallback = [];
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
          access_mode: v.access_mode ?? null,
          score: v.score ?? 0,
          desc: v.desc ?? v.description ?? "No description.",
          briefing: v.briefing ?? null,
          difficulty: v.difficulty ?? null,
          author: v.author ?? null,
          solve_count: Number(v.solve_count ?? v.solves ?? 0),
          tags: v.tags ?? [],
          locked: v.locked ?? false,
          downloads: Array.isArray(v.downloads) ? v.downloads : []
        };
      });

      log(`Loaded challenges from API: ${arr.length}`);
      return arr;
    } catch (e) {
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
          access_mode: inst.access_mode || null,
          url: normalizeInstanceUrl ? normalizeInstanceUrl(inst.url) : inst.url
        });
      });
      syncDetailInstance();
      render();
      return instances;
    } catch (e) {
      const reason = e.name === "AbortError" ? "timeout" : e.message;
      log(`Instances load failed: ${reason}`);
      return [];
    }
  }

  async function startInstance(problemKey) {
    const csrf = window.HEXACTF.getCsrfToken ? window.HEXACTF.getCsrfToken() : "";
    const res = await fetch("/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        ...(window.HEXACTF.authHeaders ? window.HEXACTF.authHeaders() : {})
      },
      body: JSON.stringify({ problem: problemKey })
    });

    const data = await safeJson(res);
    if (!res.ok || data.status !== "ok") {
      throw new Error(data.detail || data.error || "Start failed");
    }

    state.runningMap.set(problemKey, {
      instance_id: data.instance_id,
      access_mode: data.access_mode || null,
      url: normalizeInstanceUrl ? normalizeInstanceUrl(data.url) : data.url
    });
    syncDetailInstance();
    render();
  }

  async function stopInstance(problemKey) {
    const instance = state.runningMap.get(problemKey);
    if (!instance) return;

    const csrf = window.HEXACTF.getCsrfToken ? window.HEXACTF.getCsrfToken() : "";
    const res = await fetch(`/stop/${instance.instance_id}`, {
      method: "POST",
      headers: {
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        ...(window.HEXACTF.authHeaders ? window.HEXACTF.authHeaders() : {})
      }
    });

    const data = await safeJson(res);
    if (!res.ok || data.status !== "ok") {
      throw new Error(data.detail || data.error || "Stop failed");
    }

    state.runningMap.delete(problemKey);
    syncDetailInstance();
    render();
  }

  async function copyText(text, label) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      log(label || `Copied: ${text}`);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      log(label ? `${label} (fallback)` : `Copied (fallback): ${text}`);
    }
  }

  async function openDetailFromEventTarget(target) {
    const card = target.closest("[data-key]");
    if (!card) return;
    try {
      await openDetail(card.dataset.key);
    } catch (err) {
      log(`ERROR: ${err.message}`);
    }
  }

  async function handleDetailAction(e) {
    const actionEl = e.target.closest("[data-action]");
    if (!actionEl || !state.currentDetailKey) return;
    const action = actionEl.dataset.action;
    try {
      if (action === "close-detail") {
        closeDetail();
      } else if (action === "start-detail") {
        actionEl.disabled = true;
        await startInstance(state.currentDetailKey);
      } else if (action === "stop-detail") {
        actionEl.disabled = true;
        await stopInstance(state.currentDetailKey);
      } else if (action === "copy-detail-url") {
        const instance = state.runningMap.get(state.currentDetailKey);
        await copyText(instance?.url, instance?.url ? `Copied: ${instance.url}` : undefined);
      } else if (action === "copy-detail-connect") {
        const instance = state.runningMap.get(state.currentDetailKey);
        if (!instance || !state.detailChallenge) return;
        const hint = buildConnectHint(state.detailChallenge, instance);
        await copyText(hint, `Copied: ${hint}`);
      } else if (action === "submit-detail-flag") {
        actionEl.disabled = true;
        setDetailFlagMessage("제출 중...", "");
        await submitFlag(state.currentDetailKey);
      }
    } catch (err) {
      log(`ERROR: ${err.message}`);
      setDetailFlagMessage(err.message || "요청 실패", "error");
      console.error(err);
    } finally {
      if (actionEl.tagName === "BUTTON") actionEl.disabled = false;
      syncDetailInstance();
    }
  }

  function maybeOpenFromPath() {
    const prefix = "/challenges/";
    const path = window.location.pathname || "";
    if (!path.startsWith(prefix) || path === "/challenges") return;
    const key = decodeURIComponent(path.slice(prefix.length));
    if (!key) return;
    openDetail(key, false).catch(err => {
      log(`ERROR: ${err.message}`);
      window.history.replaceState({}, "", "/challenges");
    });
  }

  if (dom.grid) {
    dom.grid.addEventListener("click", (e) => {
      if (e.target.closest("button[data-action='open-detail']")) {
        openDetailFromEventTarget(e.target);
        return;
      }
      if (e.target.closest("button")) return;
      openDetailFromEventTarget(e.target);
    });
  }

  if (dom.challengeDetailModal) {
    dom.challengeDetailModal.addEventListener("click", handleDetailAction);
  }

  if (dom.detailFlagInput) {
    dom.detailFlagInput.addEventListener("keydown", async (e) => {
      if (e.key !== "Enter" || !state.currentDetailKey) return;
      e.preventDefault();
      try {
        setDetailFlagMessage("제출 중...", "");
        await submitFlag(state.currentDetailKey);
      } catch (err) {
        log(`ERROR: ${err.message}`);
        setDetailFlagMessage(err.message || "요청 실패", "error");
      }
    });
  }

  if (dom.filtersEl) {
    dom.filtersEl.addEventListener("click", (e) => {
      const b = e.target.closest("button.filter");
      if (!b) return;
      setActiveCategory(b.dataset.cat || "all");
    });
  }

  if (dom.sidebarCategoryNav) {
    dom.sidebarCategoryNav.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-cat]");
      if (!b) return;
      setActiveCategory(b.dataset.cat || "all", { scrollToGrid: true });
    });
  }

  if (dom.searchInput) {
    dom.searchInput.addEventListener("input", (e) => {
      state.activeQuery = e.target.value || "";
      render();
    });
  }

  window.addEventListener("popstate", () => {
    if ((window.location.pathname || "") === "/challenges") {
      closeDetail(false);
      return;
    }
    maybeOpenFromPath();
  });

  state.allChallenges = [];
  renderCategoryControls();
  renderProgress();
  checkVisibilityAndRender();

  window.HEXACTF = Object.assign(window.HEXACTF || {}, {
    challenges: {
      loadChallenges,
      loadInstances,
      render,
      maybeOpenFromPath,
    }
  });
})();
