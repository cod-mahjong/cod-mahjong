(() => {
  "use strict";

  const C = window.CONFIG || {};
  /** 프로필 사진 자리 (지금은 빈 칸 — 회색 원에 사람 실루엣) */
  const AVATAR = `<span class="avatar" aria-hidden="true"></span>`;
  const SEATS = ["東", "南", "西", "北"];
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const state = {
    entries: [], games: [], ranking: [], placing: [], all: [], roster: [],
    search: "", loadedAt: null, showAll: false,
    admin: false, extraNames: [],
  };
  const MIN_GAMES = Math.max(0, Number(C.placementGames) || 0);
  const TOP_N = 8;

  // ---------- 공통 ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // M리그 표기: 플러스는 +, 마이너스는 ▲
  const fmtPt = (n) => (n > 0 ? "+" : n < 0 ? "▲" : "±") + Math.abs(n).toFixed(1);
  const ptClass = (n) => (n > 0 ? "plus" : n < 0 ? "minus" : "");
  const fmtScore = (n) => n.toLocaleString("ko-KR");
  const round1 = (n) => Math.round(n * 10) / 10;
  const BASE = Number(C.basePoints) || 0;
  /** 랭킹 점수 = 시작 점수 + 누적 pt (예: 562.0) */
  const fmtTotal = (pt) => round1(BASE + pt).toFixed(1);

  function rules(over = {}) {
    return {
      start: over.start ?? C.startPoints ?? 25000,
      ret: over.ret ?? C.returnPoints ?? 30000,
      uma: over.uma ?? C.uma ?? [30, 10, -10, -30],
    };
  }

  /** 한 대국의 순위·pt 계산. players: [{name, score}] (동남서북 순서) */
  function scoreGame(players, r = rules()) {
    const oka = ((r.ret - r.start) * 4) / 1000;
    const order = players
      .map((p, seat) => ({ ...p, seat }))
      .sort((a, b) => b.score - a.score || a.seat - b.seat);
    order.forEach((p, i) => {
      p.rank = i + 1;
      p.pt = round1((p.score - r.ret) / 1000 + (r.uma[i] || 0) + (i === 0 ? oka : 0));
    });
    return players.map((_, seat) => order.find((p) => p.seat === seat));
  }

  // ---------- CSV ----------
  function parseCSV(text) {
    const rows = [];
    let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
        } else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  const toNum = (s) => {
    const n = Number(String(s ?? "").replace(/[,\s]/g, ""));
    return Number.isFinite(n) ? n : NaN;
  };

  // ---------- 날짜 ----------
  const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
  const pad = (n) => String(n).padStart(2, "0");
  /** "2026-11-14", "2026. 11. 14", "2026/11/14", "11/14", "11월 14일" 등을 Date로 */
  function parseDate(s) {
    const t = String(s || "").trim();
    let m = t.match(/(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = t.match(/^(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
    if (m) {
      const base = parseDate(C.startDate) || new Date();
      return new Date(base.getFullYear(), +m[1] - 1, +m[2]);
    }
    return null;
  }
  const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dateLabel = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})`;
  const shortDate = (d) => `${d.getMonth() + 1}/${d.getDate()}`;

  /** 한 판 식별용 문자열 (Apps Script와 같은 규칙) */
  const fingerprint = (players) => players.map((p) => `${p.name}:${p.score}`).join("|");

  /** CSV 행 → 대국 항목 (날짜, 4명 이름/점수, 시트 줄 번호) */
  function rowsToEntries(rows) {
    const entries = [];
    const problems = [];
    let lastDate = "";
    rows.forEach((r, idx) => {
      const cells = r.map((c) => c.trim());
      if (cells.every((c) => !c)) return;
      // 헤더 행 건너뛰기: 동 점수 칸이 숫자가 아니면 헤더로 간주
      if (idx === 0 && !Number.isFinite(toNum(cells[2]))) return;
      const players = [];
      for (let s = 0; s < 4; s++) {
        const name = cells[1 + s * 2];
        const score = toNum(cells[2 + s * 2]);
        if (!name || !Number.isFinite(score)) { players.length = 0; break; }
        players.push({ name, score });
      }
      if (players.length !== 4) {
        if (cells.slice(1).some(Boolean)) problems.push(idx + 1);
        return; // 아직 입력 중인 행은 무시
      }
      // 날짜 칸이 비어 있으면 바로 윗줄 날짜를 이어서 사용
      const rawDate = cells[0] || lastDate;
      lastDate = rawDate;
      entries.push({ rawDate, players, row: idx + 1, fp: fingerprint(players) });
    });
    return { entries, problems };
  }

  /** 대국 항목 → 화면용 대국 (순위·pt 계산, 날짜순 정렬, 날짜별 게임 번호) */
  function entriesToGames(entries) {
    const games = entries.map((e, i) => {
      const d = parseDate(e.rawDate);
      return {
        key: d ? dateKey(d) : e.rawDate || "날짜 미입력",
        label: d ? dateLabel(d) : e.rawDate || "날짜 미입력",
        short: d ? shortDate(d) : e.rawDate || "-",
        players: scoreGame(e.players),
        raw: e.players,
        sum: e.players.reduce((a, p) => a + p.score, 0),
        row: e.row,
        pending: !!e.pending,
        order: e.row ?? 1e9 + i, // 반영 대기 중인 새 기록은 그날의 맨 뒤
      };
    });
    // 날짜순 정렬(같은 날은 시트 순서 유지) 후 날짜별 게임 번호 매기기
    games.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.order - b.order));
    const count = {};
    games.forEach((g) => (g.no = count[g.key] = (count[g.key] || 0) + 1));
    return games;
  }

  // ---------- 방금 추가/삭제한 기록 즉시 반영 ----------
  // 구글 시트 CSV는 최대 5분 늦게 바뀌므로, 그동안은 이 브라우저에서 먼저 반영해 둠
  const OVERLAY_KEY = "mj-overlay";
  const OVERLAY_TTL = 15 * 60 * 1000;

  function loadOverlay() {
    try {
      const o = JSON.parse(localStorage.getItem(OVERLAY_KEY) || "{}");
      const fresh = (x) => Date.now() - x.t < OVERLAY_TTL;
      return { adds: (o.adds || []).filter(fresh), dels: (o.dels || []).filter(fresh) };
    } catch {
      return { adds: [], dels: [] };
    }
  }
  function saveOverlay(o) {
    try { localStorage.setItem(OVERLAY_KEY, JSON.stringify(o)); } catch {}
  }
  const countFp = (entries, fp) => entries.filter((e) => e.fp === fp).length;

  function applyOverlay(entries) {
    const o = loadOverlay();
    // CSV에 이미 반영된 것은 정리
    o.dels = o.dels.filter((d) => countFp(entries, d.fp) >= d.base);
    o.adds = o.adds.filter((a) => countFp(entries, a.fp) <= a.base);
    saveOverlay(o);

    let out = entries.slice();
    o.dels.forEach((d) => {
      const same = out.filter((e) => e.fp === d.fp);
      const victim = same.find((e) => e.row === d.row) || same[same.length - 1];
      if (victim) out = out.filter((e) => e !== victim);
    });
    o.adds.forEach((a) => out.push({ rawDate: a.date, players: a.players, row: null, fp: a.fp, pending: true }));
    return out;
  }

  /** 대회 기간 문구: "D-7", "D-DAY", "종료" */
  function periodTag() {
    const end = parseDate(C.endDate);
    if (!end) return "";
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((end - today) / 86400000);
    return diff > 0 ? `D-${diff}` : diff === 0 ? "D-DAY" : "종료";
  }

  // ---------- 랭킹 집계 ----------
  // 총 pt → 평균 순위 → 1위 횟수 → 최고 점수
  const cmpStanding = (a, b) =>
    b.pt - a.pt || a.avgRank - b.avgRank || b.ranks[0] - a.ranks[0] || b.best - a.best;

  /** 배치를 마친 선수들에게 순위(place) 부여 — 동률은 같은 순위 */
  function assignPlaces(list) {
    let prev = null;
    list.forEach((s, i) => {
      s.place = prev && prev.pt === s.pt && prev.avgRank === s.avgRank ? prev.place : i + 1;
      prev = s;
    });
  }

  function buildRanking(games) {
    const map = new Map();
    games.forEach((g, gi) => {
      // 이 판을 시작하기 직전의 랭킹을 각 선수에게 기록 (대국 기록에 표시)
      const before = [...map.values()]
        .filter((s) => s.games >= MIN_GAMES)
        .map((s) => ({ name: s.name, pt: s.pt, ranks: s.ranks, best: s.best, avgRank: s.rankSum / s.games }))
        .sort(cmpStanding);
      assignPlaces(before);
      const placeOf = new Map(before.map((s) => [s.name, s.place]));
      g.players.forEach((p) => {
        p.standing = placeOf.get(p.name) ?? null;
        p.playedBefore = map.has(p.name) ? map.get(p.name).games : 0;
      });

      g.players.forEach((p) => {
        if (!map.has(p.name)) {
          map.set(p.name, { name: p.name, pt: 0, games: 0, ranks: [0, 0, 0, 0], best: -Infinity, rankSum: 0, history: [] });
        }
        const s = map.get(p.name);
        s.pt = round1(s.pt + p.pt);
        s.games++;
        s.ranks[p.rank - 1]++;
        s.rankSum += p.rank;
        s.best = Math.max(s.best, p.score);
        s.history.push({ gi, short: g.short, no: g.no, seat: p.seat, rank: p.rank, score: p.score, pt: p.pt, cum: s.pt });
      });
    });
    // 참가자 명단에만 있고 아직 대국이 없는 선수도 '배치 중 0/5'로 포함
    state.roster.forEach((name) => {
      if (!map.has(name)) {
        map.set(name, { name, pt: 0, games: 0, ranks: [0, 0, 0, 0], best: -Infinity, rankSum: 0, history: [] });
      }
    });
    const all = [...map.values()].map((s) => ({ ...s, avgRank: s.games ? s.rankSum / s.games : 0 }));
    // 배치 판수를 채운 선수만 순위를 매김
    const ranked = all.filter((s) => s.games >= MIN_GAMES);
    ranked.sort(cmpStanding);
    assignPlaces(ranked);
    const placing = all
      .filter((s) => s.games < MIN_GAMES)
      .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name, "ko"));
    return { ranked, placing, all };
  }

  /** 참가자 명단 CSV: A열 이름 (첫 줄 '이름' 헤더는 건너뜀) */
  function parseRoster(text) {
    const names = parseCSV(text)
      .map((r) => (r[0] || "").trim())
      .filter((n, i) => n && !(i === 0 && /^(이름|선수|name)/i.test(n)));
    return [...new Set(names)];
  }

  // ---------- 데이터 로드 ----------
  async function load() {
    const updated = $("#updated");
    const notice = $("#notice");
    updated.textContent = "불러오는 중…";
    const usingSample = !C.gamesCsvUrl;
    const bust = (u) => u + (u.includes("?") ? "&" : "?") + "_=" + Date.now();
    const getCSV = async (u) => {
      const res = await fetch(u, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      if (/^\s*<(!doctype|html)/i.test(text)) throw new Error("CSV가 아닌 웹페이지가 왔어요. 시트를 'CSV'로 웹에 게시했는지 확인하세요.");
      return text;
    };
    try {
      const [text, rosterText] = await Promise.all([
        getCSV(usingSample ? "data/sample.csv" : bust(C.gamesCsvUrl)),
        // 참가자 명단은 없어도 동작 — 실패하면 빈 명단
        C.playersCsvUrl ? getCSV(bust(C.playersCsvUrl)).catch(() => null) : null,
      ]);
      if (rosterText !== null) state.roster = parseRoster(rosterText);
      const { entries, problems } = rowsToEntries(parseCSV(text));
      state.entries = entries;
      rebuild();
      state.loadedAt = new Date();
      const msgs = [];
      if (usingSample) msgs.push("지금은 <b>예시 데이터</b>가 표시되고 있어요. <code>config.js</code>에 구글 시트 CSV 주소를 넣으면 실제 기록으로 바뀝니다.");
      if (problems.length) msgs.push(`시트 ${problems.join(", ")}번째 줄은 이름/점수가 비어 있거나 숫자가 아니라서 제외했어요.`);
      notice.innerHTML = msgs.join("<br>");
      notice.className = "notice" + (msgs.length ? "" : " hidden");
      render();
    } catch (err) {
      notice.className = "notice error";
      notice.innerHTML = "기록을 불러오지 못했어요: " + esc(err.message || err);
      updated.textContent = "불러오기 실패";
      if (!state.games.length) render();
    }
  }

  /** 마지막으로 읽은 CSV + 이 브라우저의 추가/삭제 내역으로 다시 계산 */
  function rebuild() {
    state.games = entriesToGames(applyOverlay(state.entries));
    const built = buildRanking(state.games);
    state.ranking = built.ranked;
    state.placing = built.placing;
    state.all = built.all;
  }

  // ---------- 렌더링 ----------
  function render() {
    if (state.loadedAt) {
      const tag = periodTag();
      const time = state.loadedAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
      $("#updated").textContent = `${tag ? tag + " · " : ""}총 ${state.games.length}국 · ${time} 업데이트`;
    }
    renderPodium();
    renderRanking();
    renderBoards();
    renderGames();
    if ($(".name-sel")) fillCalcNames();
  }

  function renderPodium() {
    const top = state.ranking.slice(0, 3);
    const el = $("#podium");
    // 배치를 마친 선수가 3명이 안 되면 빈 자리는 빨간 X 카드로 표시
    const X = `<svg class="pcard-x" viewBox="0 0 100 100" aria-hidden="true"><path d="M20 20 L80 80 M80 20 L20 80" stroke="currentColor" stroke-width="14" stroke-linecap="round"/></svg>`;
    const empty = (n) => `
        <div class="pcard r${n} slot${n} is-empty" title="배치 ${MIN_GAMES}판을 마친 선수가 아직 없어요">
          <div class="pcard-body">${X}</div>
          <div class="pcard-foot">
            <div class="pcard-name">${n}위</div>
            <div class="pcard-pt">배치 완료자 없음</div>
          </div>
        </div>`;
    // slot1(가운데·크게) / slot2(왼쪽) / slot3(오른쪽) — 배치 순서는 CSS에서
    el.innerHTML = [0, 1, 2]
      .map((i) => top[i] || i + 1)
      .map((s, i) => typeof s === "number" ? empty(s) : `
        <div class="pcard r${s.place} slot${i + 1}" data-player="${esc(s.name)}">
          <div class="pcard-body"><div class="pcard-rank">${s.place}<small>위</small></div></div>
          <div class="pcard-foot">
            <div class="pcard-name">${esc(s.name)}</div>
            <div class="pcard-pt">${fmtTotal(s.pt)}pt <span class="pcard-delta">(${fmtPt(s.pt)})</span> · ${s.games}국</div>
          </div>
        </div>`)
      .join("");
  }

  function renderRanking() {
    const q = state.search.trim().toLowerCase();
    const match = (s) => !q || s.name.toLowerCase().includes(q);
    // 배치 중인 선수도 점수 순서대로 함께 보여줌 (순위 번호 없이 연한 회색)
    const full = [...state.ranking, ...state.placing].sort(cmpStanding);
    let list = full.filter(match);
    const body = $("#rank-body");
    const more = $("#more");
    renderPlacing(state.placing.filter(match));
    if (!list.length) {
      body.innerHTML = `<div class="empty">${q ? "검색 결과가 없어요." : "아직 기록된 대국이 없어요."}</div>`;
      more.classList.add("hidden");
      return;
    }
    const canFold = !q && list.length > TOP_N;
    more.classList.toggle("hidden", !canFold);
    more.classList.toggle("open", state.showAll);
    more.firstChild.textContent = state.showAll ? "접기 " : `전체 ${list.length}명 보기 `;
    if (canFold && !state.showAll) list = list.slice(0, TOP_N);

    const head = `
      <div class="rank-head">
        <span></span><span style="text-align:left"></span>
        <span>포인트</span><span>차</span><span class="hide-sm">대국</span>
      </div>`;
    body.innerHTML = head + list
      .map((s) => {
        if (!s.place) {
          const sub = s.games
            ? `배치 ${s.games}/${MIN_GAMES} · 평균 ${s.avgRank.toFixed(2)}위`
            : `배치 0/${MIN_GAMES} · 아직 대국 없음`;
          return `
        <div class="rank-row is-placing" data-player="${esc(s.name)}" title="배치 ${MIN_GAMES}판을 마치면 순위가 매겨져요">
          <span class="badge badge-placing">배치</span>
          <span class="rk-name">${AVATAR}<span class="rk-text">${esc(s.name)}<small>${sub}</small></span></span>
          <span class="rk-pt">${fmtTotal(s.pt)}pt<small>(${fmtPt(s.pt)})</small></span>
          <span class="rk-diff"></span>
          <span class="rk-games hide-sm">${s.games}</span>
        </div>`;
        }
        // '차'는 배치를 마친 선수끼리만 비교
        const idx = state.ranking.indexOf(s);
        const prev = idx > 0 ? state.ranking[idx - 1] : null;
        const diff = prev ? `${round1(prev.pt - s.pt).toFixed(1)}pt` : "—";
        const badge = s.place === 1 ? "b1" : s.place <= 6 ? "bg" : "";
        return `
        <div class="rank-row" data-player="${esc(s.name)}">
          <span class="badge ${badge}">${s.place}</span>
          <span class="rk-name">${AVATAR}<span class="rk-text">${esc(s.name)}<small>평균 ${s.avgRank.toFixed(2)}위 · ${s.ranks.join("-")}</small></span></span>
          <span class="rk-pt">${fmtTotal(s.pt)}pt<small>(${fmtPt(s.pt)})</small></span>
          <span class="rk-diff">${diff}</span>
          <span class="rk-games hide-sm">${s.games}</span>
        </div>`;
      })
      .join("");
  }

  /** 배치 중인 선수 (MIN_GAMES판 미만) */
  function renderPlacing(list) {
    const el = $("#placing");
    if (!list.length) { el.innerHTML = ""; return; }
    el.innerHTML = `
      <h3 class="placing-title">배치 중 <small>${MIN_GAMES}판을 치면 랭킹에 올라가요</small></h3>
      <div class="placing-grid">
        ${list
          .map((s) => `
          <div class="pl-chip" data-player="${esc(s.name)}">
            <div class="pl-top">
              <span class="pl-name">${esc(s.name)}</span>
              <span class="pl-count">${s.games}/${MIN_GAMES}판</span>
            </div>
            <div class="pl-slots" style="--n:${MIN_GAMES}">
              ${Array.from({ length: MIN_GAMES }, (_, i) => {
                const h = s.history[i];
                return h
                  ? `<span class="slot r${h.rank}" title="${esc(h.short)} ${h.no}게임 · ${fmtPt(h.pt)}">${h.rank}</span>`
                  : `<span class="slot open"></span>`;
              }).join("")}
            </div>
            <div class="pl-pt">${fmtPt(s.pt)}pt</div>
          </div>`)
          .join("")}
      </div>`;
  }

  function renderBoards() {
    const el = $("#boards");
    // 한 판이라도 친 선수는 모두 포함. 배치 중인 선수는 순위 번호 없이 회색으로 (종합 랭킹과 같은 규칙)
    const players = state.all.filter((s) => s.games > 0);
    if (!players.length) { el.innerHTML = `<div class="empty" style="grid-column:1/-1">아직 기록이 없어요.</div>`; return; }
    const rankBy = (arr, key) => {
      const sorted = [...arr].sort((a, b) => b[key] - a[key] || b.games - a.games);
      let prev = null;
      let n = 0;
      return sorted.map((s) => {
        if (s.placing) return { ...s, bPlace: null };
        n++;
        const place = prev && prev[key] === s[key] ? prev.place : n;
        prev = { [key]: s[key], place };
        return { ...s, bPlace: place };
      });
    };
    const base = players.map((s) => ({
      name: s.name,
      placing: s.games < MIN_GAMES,
      games: s.games,
      best: s.best,
      avoid: (s.games - s.ranks[3]) / s.games,
      tops: s.ranks[0],
      negAvg: -s.avgRank,
    }));
    const boards = [
      { title: "최고 점수", col: "점수", key: "best", fmt: (v) => fmtScore(v) },
      { title: "4위 회피율", col: "비율", key: "avoid", fmt: (v) => v.toFixed(4) },
      { title: "최다 1위", col: "횟수", key: "tops", fmt: (v) => v },
      { title: "평균 순위", col: "순위", key: "negAvg", fmt: (v) => (-v).toFixed(2) },
    ];
    el.innerHTML = boards
      .map((b) => {
        const rows = rankBy(base, b.key).slice(0, 7);
        return `
        <div class="board">
          <h3>${b.title}</h3>
          <div class="board-head"><span class="c">순위</span><span>선수</span><span>${b.col}</span></div>
          ${rows
            .map((s) => s.placing ? `
            <div class="board-row is-placing" data-player="${esc(s.name)}" title="배치 ${s.games}/${MIN_GAMES}">
              <span class="n">배치</span>
              <span class="b-name">${AVATAR}<span>${esc(s.name)}</span></span>
              <span class="v">${b.fmt(s[b.key])}</span>
            </div>` : `
            <div class="board-row ${s.bPlace <= 3 ? "p" + s.bPlace : ""}" data-player="${esc(s.name)}">
              <span class="n">${s.bPlace === 1 ? "<span>1</span>" : s.bPlace}</span>
              <span class="b-name">${AVATAR}<span>${esc(s.name)}</span></span>
              <span class="v">${b.fmt(s[b.key])}</span>
            </div>`)
            .join("")}
        </div>`;
      })
      .join("");
  }

  function renderGames() {
    const el = $("#games-list");
    if (!state.games.length) {
      el.innerHTML = `<div class="card empty">아직 기록된 대국이 없어요.</div>`;
      return;
    }
    const total = (C.startPoints ?? 25000) * 4;
    const byDay = new Map();
    state.games.forEach((g) => {
      if (!byDay.has(g.key)) byDay.set(g.key, []);
      byDay.get(g.key).push(g);
    });
    // 최근 날짜가 위로
    const days = [...byDay.keys()].reverse();
    el.innerHTML = days
      .map((day) => {
        const list = byDay.get(day);
        const label = `${esc(list[0].label)}<small>${list.length}게임</small>`;
        const cards = [...list]
          .reverse() // 같은 날 안에서도 최근 게임이 먼저
          .map((g) => {
            const sorted = [...g.players].sort((a, b) => a.rank - b.rank);
            const warn = g.sum !== total ? `<span class="warn" title="점수 합이 ${fmtScore(total)}이 아니에요 (공탁 잔여 등)">합계 ${fmtScore(g.sum)}</span>` : "";
            return `
              <div class="card game">
                <div class="game-head"><span>${g.no}게임</span>${warn}${
                  g.pending
                    ? `<span class="pending-tag" title="시트에는 저장됐고, 사이트 반영을 기다리는 중이에요">반영 대기</span>`
                    : `<button class="del-btn admin-only" data-del="${state.games.indexOf(g)}">삭제</button>`
                }</div>
                <div class="game-body">
                ${sorted
                  .map((p) => `
                  <div class="g-row r${p.rank}">
                    <span class="g-rank">${p.rank}</span>
                    <span class="g-seat">${SEATS[p.seat]}</span>
                    <span class="g-name" data-player="${esc(p.name)}">${esc(p.name)}${
                      p.standing
                        ? `<em class="g-standing" title="이 판 시작 전 종합 랭킹">${p.standing}위</em>`
                        : `<em class="g-standing placing-tag" title="이 판 시작 전 배치 진행도">배치 ${p.playedBefore}/${MIN_GAMES}</em>`
                    }</span>
                    <span class="g-score">${fmtScore(p.score)}</span>
                    <span class="g-pt ${ptClass(p.pt)}">${fmtPt(p.pt)}</span>
                  </div>`)
                  .join("")}
                </div>
              </div>`;
          })
          .join("");
        return `<div class="round"><h3 class="round-title">${label}</h3><div class="game-grid">${cards}</div></div>`;
      })
      .join("");
  }

  // ---------- 선수 상세 ----------
  function openPlayer(name) {
    const s = state.all.find((x) => x.name === name);
    if (!s) return;
    $("#pm-name").textContent = s.place
      ? `${s.place}위 · ${s.name}`
      : `배치 중 ${s.games}/${MIN_GAMES} · ${s.name}`;
    if (!s.games) {
      $("#pm-body").innerHTML = `<div class="empty">아직 대국 기록이 없어요.<br>${MIN_GAMES}판을 치면 랭킹에 올라가요.</div>`;
      return showDialog("#player-modal");
    }
    const top2 = ((s.ranks[0] + s.ranks[1]) / s.games) * 100;
    const fourth = (s.ranks[3] / s.games) * 100;
    $("#pm-body").innerHTML = `
      <div class="stat-grid">
        <div class="stat"><div class="v">${fmtTotal(s.pt)}</div><div class="k">현재 점수 (${fmtPt(s.pt)})</div></div>
        <div class="stat"><div class="v">${s.avgRank.toFixed(2)}</div><div class="k">평균 순위</div></div>
        <div class="stat"><div class="v">${top2.toFixed(0)}%</div><div class="k">연대율 (1·2위)</div></div>
        <div class="stat"><div class="v">${fourth.toFixed(0)}%</div><div class="k">4위율</div></div>
      </div>
      <h4 class="pm-sec">보유 점수 <small>최근 ${Math.min(RECENT_N, s.history.length)}국</small></h4>
      ${pointSVG(s.history)}
      <h4 class="pm-sec">최근 순위 <small>최근 ${Math.min(RECENT_N, s.history.length)}국</small></h4>
      ${rankSVG(s.history)}
      <h4 class="pm-sec">게임 기록 <small>총 ${s.games}국 · 최신순</small></h4>
      <div class="pm-scroll">
        <table class="pm-table">
          <thead><tr><th>날짜</th><th class="c hide-sm">자리</th><th class="c">순위</th><th class="r">점수</th><th class="r">pt</th><th class="r hide-sm">보유 점수</th></tr></thead>
          <tbody>
            ${[...s.history]
              .reverse()
              .map((h) => `
              <tr>
                <td>${esc(h.short)} · ${h.no}게임</td>
                <td class="c hide-sm">${SEATS[h.seat]}</td>
                <td class="c"><span class="rk-dot r${h.rank}">${h.rank}</span></td>
                <td class="r">${fmtScore(h.score)}</td>
                <td class="r ${ptClass(h.pt)}"><b>${fmtPt(h.pt)}</b></td>
                <td class="r hide-sm">${fmtTotal(h.cum)}</td>
              </tr>`)
              .join("")}
          </tbody>
        </table>
      </div>`;
    showDialog("#player-modal");
  }

  /**
   * 확인/입력 창. 브라우저 기본 confirm()·prompt()는 카카오톡 인앱 브라우저나
   * "대화상자 차단" 설정에서 아무것도 안 띄우고 바로 취소되므로, 페이지 안의 창을 씀.
   * 확인 → true(입력 모드면 입력값), 취소 → false(입력 모드면 null)
   */
  function ask({ title, message = "", okText = "확인", danger = false, input = false, placeholder = "" }) {
    return new Promise((resolve) => {
      const dlg = $("#ask-modal");
      const inp = $("#ask-input");
      const ok = $("#ask-ok");
      $("#ask-title").textContent = title;
      $("#ask-msg").textContent = message;
      ok.textContent = okText;
      ok.classList.toggle("danger", danger);
      inp.classList.toggle("hidden", !input);
      inp.value = "";
      inp.placeholder = placeholder;

      let done = false;
      const finish = (val) => {
        if (done) return;
        done = true;
        ok.onclick = $("#ask-cancel").onclick = inp.onkeydown = null;
        if (dlg.open) dlg.close();
        resolve(val);
      };
      const cancelVal = input ? null : false;
      ok.onclick = () => finish(input ? inp.value.trim() || null : true);
      $("#ask-cancel").onclick = () => finish(cancelVal);
      inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); ok.click(); } };
      dlg.addEventListener("close", () => finish(cancelVal), { once: true });

      showDialog("#ask-modal");
      (input ? inp : ok).focus();
    });
  }

  /** 다른 창은 닫고 해당 창만 띄우기 */
  function showDialog(sel) {
    $$("dialog[open]").forEach((d) => d.close());
    const dlg = $(sel);
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");
    dlg.scrollTop = 0;
  }

  // ---------- 선수 창 그래프 (최근 RECENT_N국) ----------
  const RECENT_N = 15;
  // 휴대폰에선 폭을 좁게 그려서 글자가 작아지지 않게
  const CH = { W: 560, L: 46, R: 16 };
  const fitChart = () => { CH.W = window.innerWidth < 600 ? 360 : 560; };
  // 점이 축 글자와 겹치지 않도록 양옆 14px 안쪽에서 시작
  const chartX = (n, i) => {
    const x0 = CH.L + 14, w = CH.W - CH.L - CH.R - 28;
    return x0 + (n > 1 ? (i * w) / (n - 1) : w / 2);
  };
  const chartXLabels = (list, H) => list
    .map((h, i) => (list.length <= 8 || i % 2 === (list.length - 1) % 2)
      ? `<text x="${chartX(list.length, i)}" y="${H - 6}" text-anchor="middle" font-size="10.5" fill="#aaa">${esc(h.short)}</text>` : "")
    .join("");

  /** 보유 점수 그래프: 초록 선 + 시작 점수 기준선 */
  function pointSVG(history) {
    fitChart();
    const list = history.slice(-RECENT_N);
    const n = list.length;
    const H = 170, T = 14, B = 26, ph = H - T - B;
    const vals = list.map((h) => BASE + h.cum);
    let lo = Math.min(BASE, ...vals), hi = Math.max(BASE, ...vals);
    const pad = Math.max(10, (hi - lo) * 0.12);
    lo -= pad; hi += pad;
    const y = (v) => T + ((hi - v) * ph) / (hi - lo);
    const x = (i) => chartX(n, i);
    const G = "var(--green)";
    const ticks = [hi - pad, (hi + lo) / 2, lo + pad].map((v) => Math.round(v));
    const grid = ticks
      .map((v) => `<line x1="${CH.L}" x2="${CH.W - CH.R}" y1="${y(v)}" y2="${y(v)}" stroke="#eee"/>
        <text x="${CH.L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" font-weight="700" fill="#999">${v}</text>`)
      .join("");
    const base = `<line x1="${CH.L}" x2="${CH.W - CH.R}" y1="${y(BASE)}" y2="${y(BASE)}" stroke="${G}" stroke-opacity=".4" stroke-width="1.5" stroke-dasharray="5 4"/>
      <text x="${CH.W - CH.R}" y="${y(BASE) - 5}" text-anchor="end" font-size="10.5" fill="${G}" fill-opacity=".7">시작 ${BASE}</text>`;
    const pts = list.map((h, i) => `${x(i)},${y(BASE + h.cum)}`).join(" ");
    const area = n > 1 ? `<polygon points="${x(0)},${T + ph} ${pts} ${x(n - 1)},${T + ph}" fill="${G}" fill-opacity=".08"/>` : "";
    const line = n > 1 ? `<polyline points="${pts}" fill="none" stroke="${G}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>` : "";
    const dots = list
      .map((h, i) => `<g><title>${esc(h.short)} ${h.no}게임 · ${fmtTotal(h.cum)}pt (${fmtPt(h.pt)})</title><circle cx="${x(i)}" cy="${y(BASE + h.cum)}" r="4.5" fill="#fff" stroke="${G}" stroke-width="3"/></g>`)
      .join("");
    return `<svg class="pm-chart" viewBox="0 0 ${CH.W} ${H}" role="img" aria-label="보유 점수 추이">${grid}${base}${area}${line}${dots}${chartXLabels(list, H)}</svg>`;
  }

  /** 최근 순위 그래프: 위가 1위, 아래가 4위. 점 색은 순위별, 안에 순위 숫자 */
  function rankSVG(history) {
    fitChart();
    const list = history.slice(-RECENT_N);
    const n = list.length;
    const H = 150, T = 16, B = 26;
    const y = (r) => T + ((r - 1) * (H - T - B)) / 3;
    const x = (i) => chartX(n, i);
    const color = ["var(--red)", "var(--green-dark)", "#6f9b7c", "var(--gray)"];
    const grid = [1, 2, 3, 4]
      .map((r) => `<line x1="${CH.L}" x2="${CH.W - CH.R}" y1="${y(r)}" y2="${y(r)}" stroke="#eee"/>
        <text x="${CH.L - 8}" y="${y(r) + 4}" text-anchor="end" font-size="11" font-weight="700" fill="#999">${r}위</text>`)
      .join("");
    const line = n > 1
      ? `<polyline points="${list.map((h, i) => `${x(i)},${y(h.rank)}`).join(" ")}" fill="none" stroke="#cfcfcf" stroke-width="2.5" stroke-linejoin="round"/>`
      : "";
    const dots = list
      .map((h, i) => `<g><title>${esc(h.short)} ${h.no}게임 · ${h.rank}위 · ${fmtPt(h.pt)}</title>
        <circle cx="${x(i)}" cy="${y(h.rank)}" r="10" fill="${color[h.rank - 1]}"/>
        <text x="${x(i)}" y="${y(h.rank) + 4}" text-anchor="middle" font-size="11.5" font-weight="900" fill="#fff">${h.rank}</text></g>`)
      .join("");
    return `<svg class="pm-chart" viewBox="0 0 ${CH.W} ${H}" role="img" aria-label="최근 순위">${grid}${line}${dots}${chartXLabels(list, H)}</svg>`;
  }

  // ---------- 계산기 ----------
  function initCalc() {
    const r = rules();
    $("#opt-start").value = r.start;
    $("#opt-return").value = r.ret;
    r.uma.forEach((u, i) => ($("#opt-u" + (i + 1)).value = u));

    $("#calc-rows").innerHTML = SEATS.map(
      (s, i) => `
      <div class="calc-row">
        <span class="g-seat">${s}</span>
        <select class="name-sel" aria-label="${s}가 선수"></select>
        <input type="text" inputmode="numeric" class="score-in" placeholder="점수" />
        <div class="calc-out" id="calc-out-${i}"><div class="pt">–</div><div class="rk">&nbsp;</div></div>
      </div>`
    ).join("");
    fillCalcNames();

    $$("#tab-calc input").forEach((inp) => inp.addEventListener("input", runCalc));
    $$(".name-sel").forEach((sel) =>
      sel.addEventListener("change", async () => {
        if (sel.value === NEW_PLAYER) {
          // 운영자 모드 전용: 아직 기록이 없는 새 선수 추가
          sel.value = "";
          const name = (await ask({
            title: "새 선수 추가",
            message: "이름을 입력하세요.\n대국 기록과 띄어쓰기까지 똑같이 써야 같은 사람으로 집계돼요.",
            okText: "추가",
            input: true,
            placeholder: "선수 이름",
          })) || "";
          if (name && !state.extraNames.includes(name) && !state.all.some((s) => s.name === name)) {
            state.extraNames.push(name);
          }
          sel.value = "";
          fillCalcNames();
          if (name) sel.value = name;
        }
        fillCalcNames();
        runCalc();
      })
    );
    $("#calc-reset").addEventListener("click", () => {
      $$(".calc-row input").forEach((i) => (i.value = ""));
      $$(".name-sel").forEach((s) => (s.value = ""));
      fillCalcNames();
      const d = rules();
      $("#opt-start").value = d.start;
      $("#opt-return").value = d.ret;
      d.uma.forEach((u, i) => ($("#opt-u" + (i + 1)).value = u));
      runCalc();
    });
    $("#calc-copy").addEventListener("click", copyCalc);
    runCalc();
  }

  const SEAT_KO = ["동가", "남가", "서가", "북가"];
  const NEW_PLAYER = "__new_player__";

  /** 계산기 선수 목록 채우기 — 기록에 있는 선수 이름(가나다순), 다른 자리에서 고른 이름은 비활성 */
  function fillCalcNames() {
    const sels = $$(".name-sel");
    const names = [...new Set([...state.all.map((s) => s.name), ...state.extraNames])]
      .sort((a, b) => a.localeCompare(b, "ko"));
    const picked = sels.map((s) => s.value);
    sels.forEach((sel, i) => {
      const cur = sel.value;
      const others = new Set(picked.filter((v, j) => j !== i && v));
      sel.innerHTML =
        `<option value="">${SEAT_KO[i]} (선수 선택)</option>` +
        names.map((n) => `<option value="${esc(n)}"${others.has(n) ? " disabled" : ""}>${esc(n)}</option>`).join("") +
        (state.admin ? `<option value="${NEW_PLAYER}">+ 새 선수 (운영자)</option>` : "");
      sel.value = cur && names.includes(cur) ? cur : "";
    });
  }

  const calcName = (row, i) => $(".name-sel", row).value || SEAT_KO[i];

  function calcRules() {
    return rules({
      start: toNum($("#opt-start").value) || 0,
      ret: toNum($("#opt-return").value) || 0,
      uma: [1, 2, 3, 4].map((i) => toNum($("#opt-u" + i).value) || 0),
    });
  }

  let lastCalc = null;
  function runCalc() {
    const r = calcRules();
    const rows = $$(".calc-row");
    const players = rows.map((row, i) => ({
      name: calcName(row, i),
      raw: $(".score-in", row).value,
      score: toNum($(".score-in", row).value),
    }));
    const filled = players.filter((p) => p.raw.trim() !== "");
    const sumEl = $("#calc-sum");

    // 3명 입력 시 나머지 1명 자동 추정 표시
    const total = r.start * 4;
    if (filled.length === 3 && filled.every((p) => Number.isFinite(p.score))) {
      const missing = players.find((p) => p.raw.trim() === "");
      const guess = total - filled.reduce((a, p) => a + p.score, 0);
      const idx = players.indexOf(missing);
      $(".score-in", rows[idx]).placeholder = String(guess);
    } else {
      rows.forEach((row) => ($(".score-in", row).placeholder = "점수"));
    }

    if (filled.length < 4 || players.some((p) => !Number.isFinite(p.score))) {
      players.forEach((_, i) => ($("#calc-out-" + i).innerHTML = `<div class="pt">–</div><div class="rk">&nbsp;</div>`));
      sumEl.className = "calc-sum";
      sumEl.textContent = players.some((p) => p.raw.trim() && !Number.isFinite(p.score))
        ? "점수는 숫자로 입력해 주세요."
        : `4명의 점수를 모두 입력하세요. (합계 기준 ${fmtScore(total)})`;
      lastCalc = null;
      return;
    }
    const res = scoreGame(players.map((p) => ({ name: p.name, score: p.score })), r);
    res.forEach((p, i) => {
      $("#calc-out-" + i).innerHTML = `<div class="pt ${ptClass(p.pt)}">${fmtPt(p.pt)}</div><div class="rk">${p.rank}위</div>`;
    });
    const sum = players.reduce((a, p) => a + p.score, 0);
    const ptSum = round1(res.reduce((a, p) => a + p.pt, 0));
    if (sum === total) {
      sumEl.className = "calc-sum ok";
      sumEl.textContent = `점수 합계 ${fmtScore(sum)} ✓  ·  pt 합계 ${fmtPt(ptSum)}`;
    } else {
      sumEl.className = "calc-sum bad";
      sumEl.textContent = `점수 합계 ${fmtScore(sum)} — ${fmtScore(total)}과 ${fmtScore(Math.abs(total - sum))}점 차이 (공탁 잔여가 아니라면 입력을 확인하세요)`;
    }
    lastCalc = res;
  }

  async function copyCalc() {
    if (!lastCalc) return;
    // 날짜: 운영자 저장칸의 날짜(기본값 오늘)를 사용
    const d = parseDate($("#save-date").value) || new Date();
    const text = [
      `[${dateLabel(d)}]`,
      ...[...lastCalc]
        .sort((a, b) => a.rank - b.rank)
        .map((p) => `${p.rank}위 ${SEATS[p.seat]} ${p.name} ${fmtScore(p.score)} (${fmtPt(p.pt)})`),
    ].join("\n");
    const btn = $("#calc-copy");
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "복사됨!";
    } catch {
      btn.textContent = "복사 실패";
    }
    setTimeout(() => (btn.textContent = "결과 복사"), 1400);
  }

  // ---------- 규칙 ----------
  function renderRules() {
    const r = rules();
    const oka = ((r.ret - r.start) * 4) / 1000;
    const s = parseDate(C.startDate), e = parseDate(C.endDate);
    const period = s && e
      ? `${s.getFullYear()}년 ${dateLabel(s)} ~ ${dateLabel(e)}`
      : "운영진 공지 참고";
    $("#rules-body").innerHTML = `
      <h3>대회 방식</h3>
      <table>
        <tbody>
          <tr><th>기간</th><td>${period}</td></tr>
          <tr><th>대국 수</th><td>제한 없음 — 기간 동안 자유롭게 대국</td></tr>
          ${MIN_GAMES ? `<tr><th>배치</th><td>${MIN_GAMES}판 이상 친 선수부터 랭킹·시상 대상</td></tr>` : ""}
          <tr><th>시작 점수</th><td>모두 ${BASE}점으로 시작 — 매 판의 pt만큼 더해지고 빠짐</td></tr>
          <tr><th>시상</th><td>마지막 날 종합 랭킹 점수 순으로 시상</td></tr>
        </tbody>
      </table>
      <h3>점수 설정</h3>
      <table>
        <tbody>
          <tr><th>배급 원점</th><td>${fmtScore(r.start)}점</td></tr>
          <tr><th>반환점</th><td>${fmtScore(r.ret)}점</td></tr>
          <tr><th>오카</th><td>+${oka}pt (1위에게)</td></tr>
          <tr><th>우마</th><td>${r.uma.map((u, i) => `${i + 1}위 ${u > 0 ? "+" : ""}${u}`).join(" / ")}</td></tr>
        </tbody>
      </table>
      <h3>pt 계산 방법</h3>
      <p class="muted">
        pt = (최종 점수 − ${fmtScore(r.ret)}) ÷ 1000 + 우마 (+ 1위는 오카 ${oka})<br>
        예) 1위 42,300점 → (42,300 − ${fmtScore(r.ret)}) ÷ 1000 + ${r.uma[0]} + ${oka} = <b>${fmtPt(round1((42300 - r.ret) / 1000 + r.uma[0] + oka))}</b>
      </p>
      <h3>순위 결정</h3>
      <p class="muted">
        대국 내 동점: 기가(起家) 기준 동 → 남 → 서 → 북 순으로 상위.<br>
        종합 랭킹 동률: 총 pt → 평균 순위 → 1위 횟수 → 최고 점수 순으로 비교.
      </p>
    `;
  }

  // ---------- 이벤트 ----------
  function initUI() {
    document.title = C.title || "마작 대회";
    // 헤더 제목은 단어마다 줄을 나눠 세로로 쌓음 (COD / Mahjong / League)
    $("#site-title").innerHTML = (C.title || "마작 대회").split(/\s+/).map((w) => `<span>${esc(w)}</span>`).join("");
    $("#site-subtitle").textContent = C.subtitle || "";
    $("#footer-title").textContent = C.title || "마작 대회";

    const showTab = (name) => {
      $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
      $$(".panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + name));
      if (location.hash !== "#" + name) history.replaceState(null, "", "#" + name);
      window.scrollTo(0, 0);
    };
    $$("[data-tab]").forEach((t) =>
      t.addEventListener("click", (e) => { e.preventDefault(); showTab(t.dataset.tab); })
    );
    $("#more").addEventListener("click", () => {
      state.showAll = !state.showAll;
      renderRanking();
    });
    const initial = location.hash.slice(1);
    if ($(`.tab[data-tab="${initial}"]`)) showTab(initial);

    $("#search").addEventListener("input", (e) => {
      state.search = e.target.value;
      renderRanking();
    });
    $("#refresh").addEventListener("click", load);

    document.addEventListener("click", (e) => {
      const del = e.target.closest("[data-del]");
      if (del) return deleteGame(Number(del.dataset.del));
      const p = e.target.closest("[data-player]");
      if (p) openPlayer(p.dataset.player);
    });
    $$("dialog").forEach((dlg) => {
      $(".modal-close", dlg).addEventListener("click", () => dlg.close());
      dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    });

    if (C.refreshSeconds > 0) {
      setInterval(() => { if (!document.hidden) load(); }, C.refreshSeconds * 1000);
    }
  }

  // ---------- 운영자 모드 (기록 추가/삭제) ----------
  const ADMIN_KEY = "mj-admin";
  let adminPw = "";

  function toast(msg, isError = false) {
    const el = $("#toast");
    el.textContent = msg;
    el.className = "toast show" + (isError ? " error" : "");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => (el.className = "toast"), 3200);
  }

  /** Apps Script 웹 앱 호출. text/plain으로 보내야 브라우저 사전 요청(CORS) 없이 동작 */
  async function api(action, payload = {}, pw = adminPw) {
    if (!C.adminApiUrl) throw new Error("config.js에 adminApiUrl이 설정되지 않았어요.");
    const res = await fetch(C.adminApiUrl, {
      method: "POST",
      body: JSON.stringify({ action, password: pw, ...payload }),
    });
    if (!res.ok) throw new Error("서버 응답 오류 (HTTP " + res.status + ")");
    const data = await res.json().catch(() => {
      throw new Error("Apps Script 응답을 읽지 못했어요. 배포 설정(액세스: 모든 사용자)을 확인하세요.");
    });
    if (!data.ok) throw new Error(data.error || "요청이 거절됐어요.");
    return data;
  }

  function setAdmin(on, pw = "") {
    state.admin = on;
    adminPw = on ? pw : "";
    document.body.classList.toggle("admin", on);
    try {
      if (on) sessionStorage.setItem(ADMIN_KEY, pw);
      else sessionStorage.removeItem(ADMIN_KEY);
    } catch {}
    fillCalcNames();
  }

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  async function saveGame() {
    const rows = $$(".calc-row");
    const players = rows.map((row) => ({
      name: $(".name-sel", row).value,
      score: toNum($(".score-in", row).value),
      raw: $(".score-in", row).value.trim(),
    }));
    const date = $("#save-date").value;
    if (!date) return toast("날짜를 골라주세요.", true);
    if (players.some((p) => !p.name || p.name === NEW_PLAYER)) return toast("4자리 모두 선수를 골라주세요.", true);
    if (new Set(players.map((p) => p.name)).size !== 4) return toast("같은 선수가 두 번 들어가 있어요.", true);
    if (players.some((p) => !p.raw || !Number.isFinite(p.score))) return toast("4명의 점수를 모두 숫자로 입력해 주세요.", true);

    const total = (C.startPoints ?? 25000) * 4;
    const sum = players.reduce((a, p) => a + p.score, 0);
    const d = parseDate(date);
    const lines = players.map((p, i) => `${SEATS[i]} ${p.name}  ${fmtScore(p.score)}`).join("\n");
    const warn = sum !== total ? `\n\n⚠ 점수 합계가 ${fmtScore(sum)}이에요 (기준 ${fmtScore(total)}).` : "";
    const okSave = await ask({
      title: "기록 저장",
      message: `${d ? dateLabel(d) : date} 기록을 시트에 저장할까요?\n\n${lines}${warn}`,
      okText: "저장",
    });
    if (!okSave) return;

    const btn = $("#save-game");
    btn.disabled = true;
    btn.textContent = "저장 중…";
    try {
      const clean = players.map(({ name, score }) => ({ name, score }));
      await api("add", { date, players: clean });
      const fp = fingerprint(clean);
      const o = loadOverlay();
      o.adds.push({ date, players: clean, fp, base: countFp(state.entries, fp), t: Date.now() });
      saveOverlay(o);
      rebuild();
      render();
      $$(".score-in").forEach((i) => (i.value = ""));
      $$(".name-sel").forEach((s) => (s.value = ""));
      fillCalcNames();
      runCalc();
      toast("저장했어요! 대국 기록에 바로 표시돼요.");
    } catch (err) {
      toast("저장 실패: " + err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "시트에 기록 저장";
    }
  }

  async function deleteGame(gi) {
    const g = state.games[gi];
    if (!g || g.pending || !state.admin) return;
    const names = [...g.players].sort((a, b) => a.rank - b.rank)
      .map((p) => `${p.rank}위 ${p.name} ${fmtScore(p.score)}`).join("\n");
    const okDel = await ask({
      title: "기록 삭제",
      message: `${g.label} ${g.no}게임 기록을 시트에서 삭제할까요?\n되돌릴 수 없어요.\n\n${names}`,
      okText: "삭제",
      danger: true,
    });
    if (!okDel) return;
    try {
      await api("delete", { row: g.row, players: g.raw });
      const fp = fingerprint(g.raw);
      const o = loadOverlay();
      o.dels.push({ fp, row: g.row, base: countFp(state.entries, fp), t: Date.now() });
      saveOverlay(o);
      rebuild();
      render();
      toast("삭제했어요.");
    } catch (err) {
      toast("삭제 실패: " + err.message, true);
    }
  }

  function initAdmin() {
    const dlg = $("#admin-modal");
    const form = $("#admin-form");
    const err = $("#admin-error");
    $("#save-date").value = todayStr();

    $("#admin-link").addEventListener("click", () => {
      if (state.admin) return setAdmin(false), toast("운영자 모드를 껐어요.");
      if (!C.adminApiUrl) return toast("config.js에 adminApiUrl을 먼저 설정해야 해요.", true);
      err.textContent = "";
      form.reset();
      showDialog("#admin-modal");
      $("#admin-pw").focus();
    });
    $("#admin-logout").addEventListener("click", () => { setAdmin(false); toast("운영자 모드를 껐어요."); });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const pw = $("#admin-pw").value;
      const btn = $("#admin-submit");
      btn.disabled = true;
      err.textContent = "";
      try {
        await api("check", {}, pw);
        setAdmin(true, pw);
        dlg.close();
        toast("운영자 모드가 켜졌어요.");
      } catch (ex) {
        err.textContent = ex.message;
      } finally {
        btn.disabled = false;
      }
    });
    $("#save-game").addEventListener("click", saveGame);

    // 같은 탭에서 새로고침해도 운영자 모드 유지 (탭을 닫으면 해제)
    try {
      const saved = sessionStorage.getItem(ADMIN_KEY);
      if (saved && C.adminApiUrl) setAdmin(true, saved);
    } catch {}
  }

  initUI();
  initCalc();
  initAdmin();
  renderRules();
  load();
})();
