(() => {
  const { dom, log, fetchWithTimeout, setScoreboardStatus, escapeHtml } = window.HEXACTF;

  function renderScoreboard(rows) {
    if (!dom.scoreboardBody) return;
    if (!rows.length) {
      dom.scoreboardBody.innerHTML = `
        <tr>
          <td class="scoreboard-empty" colspan="4">No data</td>
        </tr>
      `;
      return;
    }

    dom.scoreboardBody.innerHTML = rows.map(row => {
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
      const headers = window.HEXACTF.authHeaders ? window.HEXACTF.authHeaders() : {};
      const res = await fetchWithTimeout("/api/scoreboard", { headers }, 5000);
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
    if (!dom.scoreboardBody) return;
    const rows = await loadScoreboard();
    renderScoreboard(rows);
  }

  if (dom.refreshScoreboardBtn) {
    dom.refreshScoreboardBtn.addEventListener("click", () => {
      refreshScoreboard();
    });
  }

  window.HEXACTF = Object.assign(window.HEXACTF || {}, {
    scoreboard: {
      refreshScoreboard
    }
  });
})();
