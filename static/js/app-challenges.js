(() => {
  const { dom, state, log, safeJson, fetchWithTimeout, normalizeCat, formatBytes, escapeHtml, escapeAttr, buildConnectHint, normalizeInstanceUrl } = window.HEXACTF;

  function categoryLabel(cat) {
    switch (cat) {
      case "pwn": return "PWNABLE";
      case "rev": return "REVERSING";
      case "crypto": return "CRYPTO";
      case "forensic": return "FORENSIC";
      case "web": return "WEB";
      default: return "MISC";
    }
  }

  function categoryIcon(cat) {
    switch (cat) {
      case "web": return "language";
      case "pwn": return "terminal";
      case "rev": return "settings_backup_restore";
      case "crypto": return "lock";
      case "forensic": return "search_activity";
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

  function visibleCategories(ch) {
    const rawTags = ch.tags;
    if (Array.isArray(rawTags) && rawTags.length > 0) {
      return rawTags.slice(0, 2).map(t => normalizeCat(t));
    }
    return [normalizeCat(ch.type ?? ch.category ?? "misc")];
  }

  function markdownInline(text) {
    return String(text || "")
      .replace(/`([^`]+)`/g, '<code class="rounded bg-slate-100 px-1.5 py-0.5 text-[0.92em] text-slate-700">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
  }

  function renderMarkdown(text) {
    const safe = escapeHtml(String(text || "").replace(/\r/g, "")).trim();
    if (!safe) return '<p class="text-sm text-on-surface-variant">No description.</p>';

    const lines = safe.split("\n");
    const html = [];
    let paragraph = [];
    let listType = null;
    let listItems = [];

    function flushParagraph() {
      if (!paragraph.length) return;
      html.push(`<p class="my-4 text-sm leading-relaxed text-on-surface-variant">${markdownInline(paragraph.join("<br>"))}</p>`);
      paragraph = [];
    }

    function flushList() {
      if (!listType || !listItems.length) return;
      const tag = listType === "ol" ? "ol" : "ul";
      const listClass = listType === "ol"
        ? "list-decimal pl-6 space-y-2 my-4 text-sm leading-relaxed text-on-surface"
        : "list-disc pl-6 space-y-2 my-4 text-sm leading-relaxed text-on-surface";
      html.push(`<${tag} class="${listClass}">${listItems.map(item => `<li class="mb-1">${markdownInline(item)}</li>`).join("")}</${tag}>`);
      listType = null;
      listItems = [];
    }

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (!line) {
        flushParagraph();
        flushList();
        continue;
      }

      const heading3 = line.match(/^###\s+(.+)$/);
      if (heading3) {
        flushParagraph();
        flushList();
        html.push(`<h4 class="mt-6 mb-3 text-base font-bold text-on-surface">${markdownInline(heading3[1])}</h4>`);
        continue;
      }

      const heading2 = line.match(/^##\s+(.+)$/);
      if (heading2) {
        flushParagraph();
        flushList();
        html.push(`<h3 class="mt-6 mb-3 text-lg font-bold text-on-surface">${markdownInline(heading2[1])}</h3>`);
        continue;
      }

      const heading1 = line.match(/^#\s+(.+)$/);
      if (heading1) {
        flushParagraph();
        flushList();
        html.push(`<h2 class="mt-6 mb-3 text-xl font-bold text-on-surface">${markdownInline(heading1[1])}</h2>`);
        continue;
      }

      const unordered = line.match(/^[-*]\s+(.+)$/);
      if (unordered) {
        flushParagraph();
        if (listType !== "ul") {
          flushList();
          listType = "ul";
        }
        listItems.push(unordered[1]);
        continue;
      }

      const ordered = line.match(/^\d+\.\s+(.+)$/);
      if (ordered) {
        flushParagraph();
        if (listType !== "ol") {
          flushList();
          listType = "ol";
        }
        listItems.push(ordered[1]);
        continue;
      }

      flushList();
      paragraph.push(line);
    }

    flushParagraph();
    flushList();
    return html.join("");
  }

  function markdownPreview(text) {
    return String(text || "")
      .replace(/^#+\s+.+$/gm, "")
      .replace(/\*\*/g, "")
      .replace(/`/g, "")
      .replace(/\*/g, "")
      .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
      .replace(/\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function renderCategoryFilters(chs) {
    const topFilters = document.getElementById("filters");
    const sidebar = document.getElementById("sidebarCategories");
    const seen = new Set(["all"]);
    chs.forEach(c => {
      visibleCategories(c).forEach(cat => {
        seen.add(cat);
      });
    });
    const order = ["all", "web", "pwn", "rev", "crypto", "forensic", "misc"];
    const cats = order.filter(x => seen.has(x));

    if (topFilters) {
      topFilters.innerHTML = cats.map(cat => {
        const tone = categoryTone(cat);
        const label = cat === "all" ? "ALL" : categoryLabel(cat);
        const active = state.activeCat === cat;
        const base = "filter inline-flex items-center px-4 py-2 text-[11px] font-black tracking-[0.18em] uppercase transition-colors rounded-none";
        if (cat === "all") {
          const allClass = active
            ? "border-2 border-indigo-500 text-indigo-700 bg-white"
            : "border border-slate-200 text-slate-500 bg-white hover:border-indigo-300 hover:text-indigo-600";
          return `<button class="${base} ${allClass}" data-cat="${cat}" type="button">${label}</button>`;
        }
        const chipClass = active
          ? `${tone.chip} ring-2 ring-offset-1 ring-indigo-500`
          : `${tone.chip} hover:opacity-100`;
        return `<button class="${base} ${chipClass}" data-cat="${cat}" type="button">${label}</button>`;
      }).join("");
    }

    if (sidebar) {
      const icons = { all: "apps", web: "language", pwn: "terminal", rev: "settings_backup_restore", crypto: "lock", forensic: "search_activity", misc: "category" };
      sidebar.innerHTML = cats.map(cat => {
        const label = cat === "all" ? "ALL" : categoryLabel(cat);
        const active = state.activeCat === cat;
        const icon = icons[cat] || "category";
        const activeClass = active ? "bg-indigo-50 text-indigo-700 font-bold" : "text-slate-500 hover:bg-slate-100 hover:text-slate-700";
        return `<button class="sidebar-cat-btn flex items-center gap-3 py-2 px-4 rounded text-xs uppercase tracking-widest transition-colors ${activeClass}" data-cat="${cat}" type="button"><span class="material-symbols-outlined text-[16px]">${icon}</span>${label}</button>`;
      }).join("");
    }
  }


  function detailDifficulty(ch) {
    return String(ch.difficulty || "Beginner").toUpperCase();
  }

  function isSolved(key) {
    const solved = state.auth?.user?.solved_problems;
    return Array.isArray(solved) && solved.includes(key);
  }

  function updateProgress() {
    if (!dom.challengeProgressCount || !dom.challengeProgressBar) return;
    const total = Array.isArray(state.allChallenges) ? state.allChallenges.length : 0;
    const solved = Array.isArray(state.auth?.user?.solved_problems)
      ? state.auth.user.solved_problems.filter(key => state.allChallenges.some(ch => ch.key === key)).length
      : 0;
    const ratio = total > 0 ? Math.min(100, Math.max(0, (solved / total) * 100)) : 0;

    dom.challengeProgressCount.textContent = `${solved}/${total}`;
    dom.challengeProgressBar.style.width = `${ratio}%`;
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
    const cats = visibleCategories(ch);
    const primary = cats[0];
    const icon = categoryIcon(primary);
    const tone = categoryTone(primary);
    const chips = cats.map(cat => {
      const t = categoryTone(cat);
      return `<span class="inline-flex items-center px-3 py-1 text-[10px] font-bold tracking-widest uppercase ${t.chip}">${categoryLabel(cat)}</span>`;
    }).join("");
    const solved = isSolved(ch.key);
    const solvedCardClass = solved ? "bg-emerald-50/60 border border-emerald-200/80" : "bg-surface-container-lowest";
    const solvedRibbon = solved
      ? `<div class="bg-emerald-500 text-white px-4 py-2 flex items-center gap-2 transform -rotate-12 absolute -top-2 -right-4 shadow-lg"><span class="material-symbols-outlined text-[16px]">check</span><span class="text-[10px] font-bold uppercase tracking-[0.18em]">Solved</span></div>`
      : "";

    const runningClass = state.runningMap.has(ch.key) ? "running-instance-card" : "";

    return `
      <article class="relative cursor-pointer ${solvedCardClass} shadow-[0_20px_40px_rgba(53,37,205,0.04)] p-6 flex flex-col gap-5 min-h-[280px] hover:-translate-y-1 transition-transform ${runningClass}" data-key="${escapeHtml(ch.key)}" data-cat="${primary}" id="challenge-${escapeHtml(ch.key)}">
        ${solvedRibbon}
        <div class="flex items-start justify-between gap-4">
          <div class="flex flex-wrap gap-1">
            ${chips}
          </div>
          <span class="font-headline font-black italic text-xl ${tone.score}">${Number(ch.score || 0)} Point</span>
        </div>
        ${runningBadge(ch)}
        <div class="space-y-3 flex-1">
          <div class="flex items-center gap-3 text-slate-400 text-[10px] font-bold uppercase tracking-[0.18em]">
            <span class="material-symbols-outlined text-sm p-1 rounded-sm ${tone.icon}">${icon}</span>
            <span>${ch.author ? `출제자: ${escapeHtml(ch.author)}` : detailDifficulty(ch)}</span>
          </div>
          <h3 class="font-headline text-[1.45rem] font-bold tracking-tight text-on-surface leading-none">${escapeHtml(ch.title || ch.key)}</h3>
          <p class="text-sm text-on-surface-variant line-clamp-3 leading-relaxed">${escapeHtml(markdownPreview(ch.desc || ch.description || "No description."))}</p>
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

  function render() {
    if (!dom.grid) return;
    const filtered = state.allChallenges.filter(ch => {
      const cats = visibleCategories(ch);
      const okCat = state.activeCat === "all" ? true : cats.includes(state.activeCat);
      const q = state.activeQuery.trim().toLowerCase();
      const okQ = !q ? true : (String(ch.key).toLowerCase().includes(q) || String(ch.title || "").toLowerCase().includes(q));
      return okCat && okQ;
    }).sort((a, b) => {
      if (state.activeCat !== "all") return 0;
      const scoreDiff = Number(a.score || 0) - Number(b.score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return String(a.title || a.key).localeCompare(String(b.title || b.key));
    });

    if (!filtered.length) {
      dom.grid.innerHTML = `
        <div class="col-span-full bg-surface-container-lowest rounded-lg p-12 text-center shadow-[0_20px_40px_rgba(53,37,205,0.04)]">
          <div class="font-headline text-2xl font-bold tracking-tight text-slate-700">No matching challenges</div>
          <p class="mt-3 text-sm text-slate-500">Adjust the current filters or search query.</p>
        </div>
      `;
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

    const cats = visibleCategories(ch);
    if (dom.detailCategory) {
      if (cats.length > 1) {
        dom.detailCategory.textContent = cats.map(c => categoryLabel(c)).join(" / ");
      } else {
        dom.detailCategory.textContent = categoryLabel(cats[0] || "misc");
      }
    }
    if (dom.detailDifficulty) dom.detailDifficulty.textContent = ch.author ? `출제자: ${escapeHtml(ch.author)}` : detailDifficulty(ch);
    if (dom.detailPoints) dom.detailPoints.textContent = `${Number(ch.score || 0)} Point`;
    if (dom.detailTitle) dom.detailTitle.textContent = ch.title || ch.key;
    if (dom.detailSolves) dom.detailSolves.textContent = `${Number(ch.solve_count || ch.solves || 0)} Solves`;
    const detailMarkdown = ch.desc || ch.description || ch.briefing || "No description.";
    if (dom.detailDescription) dom.detailDescription.innerHTML = renderMarkdown(detailMarkdown);

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
      if (window.HEXACTF?.updateProgress) window.HEXACTF.updateProgress();
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
      // Persist and render dynamic UI elements
      state.allChallenges = arr;
      render();
      renderCategoryFilters(arr);
      if (window.HEXACTF?.updateProgress) window.HEXACTF.updateProgress();
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
    if (res.status === 429) {
      alert("생성 가능한 인스턴스 수를 초과했습니다\n사용 중인 인스턴스를 종료한 뒤 다시 시도해 주세요");
      throw new Error(data.detail || data.error || "Start failed");
    }
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
      state.activeCat = b.dataset.cat;
      render();
      renderCategoryFilters(state.allChallenges);
    });
  }

  const sidebarCategories = document.getElementById("sidebarCategories");
  if (sidebarCategories) {
    sidebarCategories.addEventListener("click", (e) => {
      const b = e.target.closest("button.sidebar-cat-btn");
      if (!b) return;
      state.activeCat = b.dataset.cat;
      render();
      renderCategoryFilters(state.allChallenges);
    });
  }

  document.querySelectorAll("[data-scroll-cat]").forEach(btn => {
    btn.addEventListener("click", () => {
      const targetCat = btn.getAttribute("data-scroll-cat");
      const target = document.querySelector(`[data-cat="${targetCat}"]`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  });

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

  window.HEXACTF = Object.assign(window.HEXACTF || {}, {
    updateProgress,
    challenges: {
      loadChallenges,
      loadInstances,
      render,
      maybeOpenFromPath,
    }
  });
})();
