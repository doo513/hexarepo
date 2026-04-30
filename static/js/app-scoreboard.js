(() => {
  const { dom, state, log, fetchWithTimeout, setScoreboardStatus, escapeHtml } = window.HEXACTF;

  const TIMELINE_PALETTE = [
    "#3b82f6",
    "#22c55e",
    "#a16207",
    "#f97316",
    "#eab308",
    "#a8a29e",
    "#ef4444",
    "#a855f7",
    "#14b8a6",
    "#fb7185"
  ];
  const SCOREBOARD_TOP_LIMIT = 10;
  const MIN_WINDOW_MS = 5 * 60 * 1000;

  const timelineState = {
    rawTimeline: null,
    rangeStartMs: null,
    rangeEndMs: null,
    viewStartMs: null,
    viewEndMs: null
  };

  function setClosedState(closed, message = "") {
    if (dom.scoreboardClosedWrap) {
      dom.scoreboardClosedWrap.classList.toggle("hidden", !closed);
    }
    if (dom.scoreboardContentWrap) {
      dom.scoreboardContentWrap.classList.toggle("hidden", closed);
    }
    if (dom.scoreboardClosedMessage && message) {
      dom.scoreboardClosedMessage.textContent = message;
    }
  }

  function renderScoreboard(rows) {
    if (!dom.scoreboardBody) return;
    const sortedRows = [...rows].sort((a, b) => Number(a.rank || 0) - Number(b.rank || 0));
    if (!sortedRows.length) {
      dom.scoreboardBody.innerHTML = `
        <tr>
          <td class="px-6 py-8 text-slate-400 text-center" colspan="4">No data</td>
        </tr>
      `;
      return;
    }

    dom.scoreboardBody.innerHTML = sortedRows.map(row => {
      const rank = Number(row.rank || 0);
      const score = Number(row.score || 0);
      const solved = Number(row.solved_count || 0);
      const username = escapeHtml(String(row.username || "unknown"));
      const display = escapeHtml(String(row.display_name || row.username || "Unknown"));
      const userHtml = display !== username
        ? `<div class="font-bold text-sm">${display}</div><div class="text-xs text-slate-400">@${username}</div>`
        : `<div class="font-bold text-sm">${display}</div>`;
      const rankTone = rank === 1
        ? "bg-indigo-50 text-indigo-700"
        : rank === 2
          ? "bg-slate-100 text-slate-700"
          : rank === 3
            ? "bg-amber-50 text-amber-700"
            : "bg-transparent text-slate-600";

      return `
        <tr class="hover:bg-surface-container-low transition-colors duration-150">
          <td class="px-6 py-4">
            <span class="inline-flex min-w-10 items-center justify-center rounded-sm px-3 py-1 text-sm font-bold ${rankTone}">#${rank}</span>
          </td>
          <td class="px-6 py-4">${userHtml}</td>
          <td class="px-6 py-4 font-headline font-bold text-sm">${score}</td>
          <td class="px-6 py-4 text-sm text-slate-600">${solved}</td>
        </tr>
      `;
    }).join("");
  }

  function renderPodium(top3) {
    if (!dom.scoreboardPodium) return;
    const cards = [...dom.scoreboardPodium.querySelectorAll("[data-rank]")];
    const byRank = new Map((top3 || []).map(row => [Number(row.rank || 0), row]));
    cards.forEach(card => {
      const rank = Number(card.dataset.rank || 0);
      const row = byRank.get(rank);
      if (!row) return;
      const display = String(row.display_name || row.username || "Unknown");
      const username = String(row.username || "unknown");
      const score = Number(row.score || 0);
      const solved = Number(row.solved_count || 0);
      const displayEl = card.querySelector('[data-field="display_name"]');
      const scoreEl = card.querySelector('[data-field="score"]');
      const usernameEl = card.querySelector('[data-field="username"]');
      const solvedEl = card.querySelector('[data-field="solved_count"]');
      if (displayEl) displayEl.textContent = display;
      if (scoreEl) scoreEl.textContent = `${score} Point`;
      if (usernameEl) usernameEl.textContent = `@${username}`;
      if (solvedEl) solvedEl.textContent = `${solved} solves`;
    });
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function formatAxisTime(ms) {
    const date = new Date(ms);
    return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  }

  function formatUpdatedAt(date = new Date()) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    const sec = String(date.getSeconds()).padStart(2, "0");
    return `${yyyy}.${mm}.${dd}. ${hh}:${min}:${sec}`;
  }

  function buildSeriesPoints(series, rangeStartMs, rangeEndMs) {
    const rawPoints = Array.isArray(series.points) ? series.points : [];
    const filtered = rawPoints
      .map(point => ({ ts: Date.parse(point.ts), score: Number(point.score || 0) }))
      .filter(point => Number.isFinite(point.ts) && point.ts >= rangeStartMs && point.ts <= rangeEndMs)
      .sort((a, b) => a.ts - b.ts);

    let baseScore = 0;
    for (const point of rawPoints) {
      const ts = Date.parse(point.ts);
      if (Number.isFinite(ts) && ts <= rangeStartMs) {
        baseScore = Number(point.score || 0);
      }
    }

    const visible = [{ ts: rangeStartMs, score: baseScore }];
    filtered.forEach(point => {
      if (point.ts === rangeStartMs) {
        visible[0] = point;
      } else {
        visible.push(point);
      }
    });
    if (visible[visible.length - 1].ts !== rangeEndMs) {
      visible.push({ ts: rangeEndMs, score: visible[visible.length - 1].score });
    }
    return visible;
  }

  function renderTimeline(timeline) {
    if (!dom.scoreboardTimelineSvg) return;

    const series = Array.isArray(timeline?.series) ? timeline.series.slice(0, SCOREBOARD_TOP_LIMIT) : [];
    const startMs = timelineState.viewStartMs;
    const endMs = timelineState.viewEndMs;
    const labelsWrap = dom.scoreboardTimelineLabels;
    const legendWrap = dom.scoreboardTimelineLegend;
    const emptyWrap = dom.scoreboardTimelineEmpty;
    const width = 1000;
    const height = 400;
    const padding = { top: 16, right: 16, bottom: 24, left: 16 };

    if (!series.length || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      dom.scoreboardTimelineSvg.innerHTML = "";
      if (labelsWrap) labelsWrap.innerHTML = "";
      if (legendWrap) legendWrap.innerHTML = "";
      if (emptyWrap) emptyWrap.classList.remove("hidden");
      return;
    }

    if (emptyWrap) emptyWrap.classList.add("hidden");

    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const valueSets = series.map(item => buildSeriesPoints(item, startMs, endMs));
    const maxValue = Math.max(1, ...valueSets.flat().map(point => Number(point.score || 0)));

    const paths = valueSets.map((points, idx) => {
      const color = TIMELINE_PALETTE[idx % TIMELINE_PALETTE.length];
      const d = points.map((point, pointIdx) => {
        const x = padding.left + ((point.ts - startMs) / Math.max(endMs - startMs, 1)) * plotWidth;
        const y = padding.top + plotHeight - ((Number(point.score || 0) / maxValue) * plotHeight);
        return `${pointIdx === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      }).join(" ");
      const markers = points.map(point => {
        const x = padding.left + ((point.ts - startMs) / Math.max(endMs - startMs, 1)) * plotWidth;
        const y = padding.top + plotHeight - ((Number(point.score || 0) / maxValue) * plotHeight);
        return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="5" fill="${color}" stroke="#ffffff" stroke-width="2"></circle>`;
      }).join("");
      return `<path d="${d}" fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"></path>${markers}`;
    }).join("");

    dom.scoreboardTimelineSvg.innerHTML = paths;

    const tickCount = 6;
    if (labelsWrap) {
      const labels = [];
      for (let idx = 0; idx < tickCount; idx += 1) {
        const ratio = tickCount === 1 ? 0 : idx / (tickCount - 1);
        labels.push(formatAxisTime(startMs + ((endMs - startMs) * ratio)));
      }
      labelsWrap.innerHTML = labels.map(label => `<span>${escapeHtml(label)}</span>`).join("");
    }

    if (legendWrap) {
      legendWrap.innerHTML = series.map((item, idx) => {
        const color = TIMELINE_PALETTE[idx % TIMELINE_PALETTE.length];
        const rank = idx + 1;
        const display = escapeHtml(String(item.display_name || item.username || "Unknown"));
        return `
          <div class="inline-flex items-center gap-2">
            <span class="inline-block h-3 w-3 rounded-full" style="background:${color}"></span>
            <span class="font-semibold text-slate-700">${rank}. ${display}</span>
          </div>
        `;
      }).join("");
    }
  }

  function syncTimelineMeta(totalParticipants) {
    if (dom.scoreboardParticipants) {
      dom.scoreboardParticipants.textContent = `${Number(totalParticipants || 0)}명이 참여 중입니다.`;
    }
    if (dom.scoreboardUpdatedAt) {
      dom.scoreboardUpdatedAt.textContent = `Last updated: ${formatUpdatedAt(new Date())}`;
    }
  }

  function resetTimelineWindow(timeline) {
    timelineState.rawTimeline = timeline;
    timelineState.rangeStartMs = Date.parse(timeline?.start_at || "");
    timelineState.rangeEndMs = Date.parse(timeline?.end_at || "");
    if (!Number.isFinite(timelineState.rangeStartMs) || !Number.isFinite(timelineState.rangeEndMs) || timelineState.rangeEndMs <= timelineState.rangeStartMs) {
      const now = Date.now();
      timelineState.rangeStartMs = now - (24 * 60 * 60 * 1000);
      timelineState.rangeEndMs = now;
    }
    timelineState.viewStartMs = timelineState.rangeStartMs;
    timelineState.viewEndMs = timelineState.rangeEndMs;
  }

  function handleTimelineWheel(event) {
    if (!event.ctrlKey || !timelineState.rawTimeline) return;
    event.preventDefault();

    const currentWindow = timelineState.viewEndMs - timelineState.viewStartMs;
    const fullWindow = timelineState.rangeEndMs - timelineState.rangeStartMs;
    if (currentWindow <= 0 || fullWindow <= 0) return;

    const frame = dom.scoreboardTimelineSvg?.getBoundingClientRect();
    if (!frame || frame.width <= 0) return;
    const pointerRatio = clamp((event.clientX - frame.left) / frame.width, 0, 1);
    const anchor = timelineState.viewStartMs + currentWindow * pointerRatio;
    const zoomFactor = event.deltaY < 0 ? 0.8 : 1.25;
    const targetWindow = clamp(Math.round(currentWindow * zoomFactor), MIN_WINDOW_MS, fullWindow);

    let nextStart = Math.round(anchor - targetWindow * pointerRatio);
    let nextEnd = nextStart + targetWindow;
    if (nextStart < timelineState.rangeStartMs) {
      nextStart = timelineState.rangeStartMs;
      nextEnd = nextStart + targetWindow;
    }
    if (nextEnd > timelineState.rangeEndMs) {
      nextEnd = timelineState.rangeEndMs;
      nextStart = nextEnd - targetWindow;
    }
    timelineState.viewStartMs = clamp(nextStart, timelineState.rangeStartMs, timelineState.rangeEndMs - MIN_WINDOW_MS);
    timelineState.viewEndMs = clamp(nextEnd, timelineState.viewStartMs + MIN_WINDOW_MS, timelineState.rangeEndMs);
    renderTimeline(timelineState.rawTimeline);
  }

  async function loadScoreboard() {
    const fallback = [
      { rank: 1, username: "guest01", display_name: "Guest 01", score: 250, solved_count: 5 },
      { rank: 2, username: "guest02", display_name: "Guest 02", score: 180, solved_count: 4 },
      { rank: 3, username: "guest03", display_name: "Guest 03", score: 120, solved_count: 3 }
    ];

    try {
      const headers = window.HEXACTF.authHeaders ? window.HEXACTF.authHeaders() : {};
      const res = await fetchWithTimeout("/api/scoreboard", { headers }, 5000);
      const data = await res.json();
      if (res.status === 403) {
        const error = new Error(data.detail || "This page has been closed.");
        error.closedMessage = data.detail || "This page has been closed.";
        throw error;
      }
      if (!res.ok) throw new Error(`GET /api/scoreboard failed: ${res.status}`);
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
      setClosedState(false);
      log(`Loaded scoreboard: ${rows.length}`);
      return rows;
    } catch (e) {
      if (e.closedMessage) {
        setClosedState(true, e.closedMessage);
        setScoreboardStatus(false, "closed");
        log(`Scoreboard closed: ${e.closedMessage}`);
        return [];
      }
      const reason = e.name === "AbortError" ? "timeout" : e.message;
      setScoreboardStatus(false, reason);
      log(`Scoreboard load failed -> fallback 사용: ${reason}`);
      setClosedState(false);
      return fallback;
    }
  }

  async function loadSummary() {
    const headers = window.HEXACTF.authHeaders ? window.HEXACTF.authHeaders() : {};
    const res = await fetchWithTimeout("/api/scoreboard/summary", { headers }, 5000);
    const data = await res.json();
    if (res.status === 403) {
      const error = new Error(data.detail || "This page has been closed.");
      error.closedMessage = data.detail || "This page has been closed.";
      throw error;
    }
    return data.summary || {};
  }

  async function loadTimeline() {
    const headers = window.HEXACTF.authHeaders ? window.HEXACTF.authHeaders() : {};
    const res = await fetchWithTimeout(`/api/scoreboard/timeline?limit=${SCOREBOARD_TOP_LIMIT}&full=1`, { headers }, 5000);
    const data = await res.json();
    if (res.status === 403) {
      const error = new Error(data.detail || "This page has been closed.");
      error.closedMessage = data.detail || "This page has been closed.";
      throw error;
    }
    return data.timeline || null;
  }

  async function refreshScoreboard() {
    if (!dom.scoreboardBody) return;
    const rows = await loadScoreboard();
    if (dom.scoreboardContentWrap?.classList.contains("hidden")) return;
    renderScoreboard(rows);

    try {
      const [summary, timeline] = await Promise.all([loadSummary(), loadTimeline()]);
      renderPodium(summary.top_3 || rows.slice(0, 3));
      if (timeline) {
        resetTimelineWindow(timeline);
        renderTimeline(timeline);
      }
      syncTimelineMeta(summary.total_participants || rows.length);
    } catch (err) {
      log(`Scoreboard summary/timeline load failed: ${err.message}`);
      renderPodium(rows.slice(0, 3));
      syncTimelineMeta(rows.length);
    }
  }

  if (dom.refreshScoreboardBtn) {
    dom.refreshScoreboardBtn.addEventListener("click", () => {
      refreshScoreboard();
    });
  }

  if (dom.scoreboardTimelineSvg) {
    dom.scoreboardTimelineSvg.addEventListener("wheel", handleTimelineWheel, { passive: false });
  }

  window.HEXACTF = Object.assign(window.HEXACTF || {}, {
    scoreboard: {
      refreshScoreboard
    }
  });
})();
