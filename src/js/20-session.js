/* ---- a session: one run, played by one or more players (pass the phone) ---- */
const imgCache = {};
function preloadFlags(ids) {
  ids.forEach((id) => { if (!imgCache[id]) { const im = new Image(); im.decoding = 'async'; im.src = BY_ID[id].flag; imgCache[id] = im; } });
}
// The map data is a separate file, loaded only when a run has the Map game.
let mapLoading = null;
// Guess the language's sentences: loaded the first time a run needs them.
let langsLoading = null;
function needLangs() {
  if (langsReady()) return Promise.resolve();
  if (!langsLoading) langsLoading = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'langs.js?v=' + APP_VERSION;
    s.onload = () => { langsReady(); res(); }; s.onerror = () => { langsLoading = null; rej(new Error('langs')); };
    document.head.appendChild(s);
  });
  return langsLoading;
}
function loadMap() {
  if (window.GS_MAP) return Promise.resolve(window.GS_MAP);
  if (!mapLoading) mapLoading = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'map.js?v=' + APP_VERSION;
    s.onload = () => res(window.GS_MAP); s.onerror = () => { mapLoading = null; rej(new Error('map')); };
    document.head.appendChild(s);
  });
  return mapLoading;
}

function startSession(cfg, players, challenge, daily, practice) {
  if (usesLangs(cfg) && !langsReady()) {
    mount(h('div', { class: 'app' }, h('div', { class: 'cover' }, h('p', { class: 'muted' }, 'Loading…'))));
    needLangs().then(() => startSession(cfg, players, challenge, daily, practice), () => { toast('Couldn\'t load the languages. Check your connection.'); home(); });
    return;
  }
  // One go at the daily run per day on this device.
  if (daily != null && store.get('gs_daily_v1', {})[daily]) { dailyResult(daily); return; }
  S.challenge = null;
  // Practice: board runs you started yourself (never a daily or a friend's challenge), or a misses drill.
  const pr = practice != null ? practice : !!S.setup.practice && cfg.kind === 'board' && daily == null && !challenge;
  // Spelling help: an online room's setting (cfg.help) is the same for everyone in it; otherwise your own switch.
  S.session = { cfg, players, idx: 0, scores: [], challenge, help: cfg.help != null ? !!cfg.help : !!S.setup.help, daily: daily != null ? daily : null, practice: pr };
  if (cfg.kind === 'board') {
    S.session.board = makeBoard(cfg);
    if (cfg.games.some((g) => g === 'flags' || g === 'flagmap' || g === 'duel')) preloadFlags(cfgPool(cfg));
    if (cfg.games.some((g) => MAP_GAMES.has(g))) loadMap().catch(() => toast('The map didn\'t load. Check your connection.'));
  } else {
    S.session.questions = makeRun(cfg);
    preloadFlags(S.session.questions.filter((q) => q.kind === 'flag').map((q) => q.id));
  }
  cover();
}
function howTo(cfg) {
  if (cfg.kind === 'quick') return cfg.count + ' ' + modeOf(cfg.mode).label.toLowerCase() + ' · ' + (cfg.style === 'type' ? 'type it' : 'pick from 4');
  return makeBoard(cfg).map((sec) => gameOf(sec.game).em + ' ' + gameOf(sec.game).label + ' ' + sec.ids.length).join('  →  ');
}
function cover() {
  const se = S.session, name = se.players[se.idx], many = se.players.length > 1;
  mount(h('div', { class: 'app' }, topbar(cfgLabel(se.cfg), () => { if (se.scores.length) ask('Leave?', 'Leave', home, 'The scores so far will be lost.'); else home(); }),
    h('div', { class: 'cover' },
      many ? h('p', { class: 'eyebrow' }, 'Player ' + (se.idx + 1) + ' of ' + se.players.length) : null,
      h('h2', { class: 'display', style: { fontSize: many ? '54px' : '42px' } }, many ? (se.idx ? 'Pass to ' : '') + name : 'Ready?'),
      h('p', { class: 'muted', style: { maxWidth: '34ch' } }, howTo(se.cfg)),
      se.help ? h('p', { class: 'small muted' }, '💡 Spelling help is on') : null,
      se.challenge && se.challenge.time ? h('p', { class: 'badge' }, 'To beat: ' + (se.cfg.kind === 'board' && se.challenge.correct != null ? se.challenge.correct + '/' + cfgTotal(se.cfg) + ' in ' : '') + fmtTime(se.challenge.time)) : null,
      h('button', { class: 'btn primary', style: { maxWidth: '320px' }, onclick: countdown }, '▶ Go')),
  ));
}
// ✕ in a run: the site's own "are you sure?" box.
function quitRun(leave) {
  if (S.session && S.session.daily != null) ask('Leave today\'s run?', 'Leave', leave, 'You can\'t play it again today.');
  else ask('Stop this run?', 'Stop', leave, 'It won\'t count.');
}
function countdown() {
  // Pressing Go uses up today's daily run (leaving early still counts as your go).
  const se = S.session;
  if (se.daily != null && se.idx === 0) { const d = store.get('gs_daily_v1', {}); if (!d[se.daily]) { d[se.daily] = { left: true }; store.set('gs_daily_v1', d); } }
  const go = () => {
    let n = 3; const el = h('div', { class: 'cd', 'aria-live': 'assertive' }, '3');
    mount(h('div', { class: 'app' }, h('div', { class: 'cover' }, el)));
    const tick = () => { n--; if (n > 0) { el.textContent = String(n); setTimeout(tick, 700); } else (S.session.cfg.kind === 'board' ? boardRun() : quickRun()); };
    setTimeout(tick, 700);
  };
  // Don't start the clock before the map has arrived.
  if (S.session.cfg.kind === 'board' && S.session.cfg.games.some((g) => MAP_GAMES.has(g)) && !window.GS_MAP) {
    mount(h('div', { class: 'app' }, h('div', { class: 'cover' }, h('p', { class: 'muted' }, 'Loading the map…'))));
    loadMap().then(go, () => { toast('The map didn\'t load. Check your connection and try again.'); cover(); });
  } else go();
}

/* ---------------- the clock ---------------- */
function makeClock() {
  const c = { start: performance.now(), paused: 0, pauseAt: null, over: false };
  c.elapsed = () => (c.pauseAt != null ? c.pauseAt : performance.now()) - c.start - c.paused;
  c.pause = () => { if (c.pauseAt == null) c.pauseAt = performance.now(); };
  c.resume = () => { if (c.pauseAt != null) { c.paused += performance.now() - c.pauseAt; c.pauseAt = null; } };
  // Every element with class "timer" on screen shows this clock (plus any penalty).
  c.extra = () => 0;
  const loop = () => {
    if (c.over) return;
    const practice = S.session && S.session.practice;
    document.querySelectorAll('.timer').forEach((t) => { t.textContent = practice ? 'Practice' : fmtTime(c.elapsed() + c.extra()); t.classList.toggle('paused', c.pauseAt != null); t.classList.toggle('practice', !!practice); });
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return c;
}

function finishRun(score) {
  const se = S.session;
  score.kind = se.cfg.kind;
  se.scores.push(score);
  if (se.live) liveFinished(score);
  store.set('gs_misses_v1', recordMisses(store.get('gs_misses_v1', {}), score));
  if (se.practice) { result(score); return; } // practice: no best times, no daily score
  // Daily run: the first finished go of the day is the one that counts.
  if (se.daily != null && se.idx === 0) {
    const d = store.get('gs_daily_v1', {});
    if (!d[se.daily] || d[se.daily].time == null) {
      d[se.daily] = { time: score.time, correct: score.correct, total: score.total,
        sections: (score.sections || []).map((s) => ({ game: s.game, kind: s.kind, ids: s.ids, found: s.found, missed: s.missed, gaveUp: !!s.gaveUp, skipped: !!s.skipped, tries: s.tries || {} })) };
      store.set('gs_daily_v1', d); score.dailyFirst = true;
    }
  }
  const k = bestKey(se.cfg), b = store.get('gs_best_v2', {});
  score.best = !b[k] || better(score, b[k], se.cfg.kind);
  if (score.best) { b[k] = { label: cfgLabel(se.cfg), time: score.time, correct: score.correct, total: score.total, name: score.name, at: Date.now() }; store.set('gs_best_v2', b); }
  result(score);
}

/* ---------------- board runs: one or more games back to back ---------------- */
function boardRun() {
  const se = S.session;
  const R = { clock: makeClock(), sec: 0, results: [] };
  se.run = R;
  if (se.live) liveReporter(R);
  playSection(R);
}
function playSection(R) {
  const se = S.session, sec = se.board[R.sec];
  const res = { game: sec.game, kind: sec.kind, ids: sec.ids, found: [], missed: [], gaveUp: false, tries: {} };
  R.results[R.sec] = res;
  const api = {
    R, sec, res, practice: !!se.practice, label: gameOf(sec.game).label, part: se.board.length > 1 ? (R.sec + 1) + '/' + se.board.length : '',
    // Called by the game when every country is found.
    done() { R.clock.pause(); api.ui && api.ui.completed && api.ui.completed(); setTimeout(() => { R.clock.resume(); nextSection(R); }, 700); },
    giveUp: () => giveUpDialog(R, api),
    quit: () => quitRun(() => { R.clock.over = true; home(); }),
  };
  api.ui = MAP_GAMES.has(sec.game) ? mapGame(api) : sec.game === 'borders' ? bordersGame(api) : sec.game === 'duel' ? duelGame(api) : sec.game === 'lang' ? langGame(api) : gridGame(api);
}
function giveUpDialog(R, api) {
  const se = S.session, more = R.sec < se.board.length - 1;
  const bg = modal(
    h('h2', { class: 'display' }, 'Give up?'),
    h('button', { class: 'btn primary small', onclick: () => { bg.remove(); reveal(R, api, false); } }, more ? 'Give up on ' + api.label + ', go on' : 'Give up and show me'),
    more ? h('button', { class: 'btn ghost small', onclick: () => { bg.remove(); reveal(R, api, true); } }, 'End the whole run') : null,
    h('button', { class: 'btn ghost small', onclick: () => bg.remove() }, 'Keep playing'));
}
// Give up: show what was missed (the clock is stopped while you look), then carry on.
function reveal(R, api, endAll) {
  const se = S.session, res = api.res;
  R.clock.pause();
  res.gaveUp = true;
  res.missed = res.ids.filter((id) => !res.found.includes(id));
  if (endAll) {
    for (let i = R.sec + 1; i < se.board.length; i++) { const s = se.board[i]; R.results[i] = { game: s.game, kind: s.kind, ids: s.ids, found: [], missed: s.ids.slice(), gaveUp: true, skipped: true, tries: {} }; }
  }
  const last = endAll || R.sec >= se.board.length - 1;
  api.ui.reveal(h('button', { class: 'btn primary small', onclick: () => { R.clock.resume(); if (last) finishBoard(R); else { R.sec++; playSection(R); } } },
    last ? 'See results →' : 'Next: ' + gameOf(se.board[R.sec + 1].game).label + ' →'));
}
function nextSection(R) {
  const se = S.session;
  R.results[R.sec].missed = R.results[R.sec].ids.filter((id) => !R.results[R.sec].found.includes(id));
  if (R.sec >= se.board.length - 1) return finishBoard(R);
  R.sec++; playSection(R);
}
function finishBoard(R) {
  const se = S.session;
  R.clock.over = true;
  const time = Math.round(R.clock.elapsed());
  const correct = R.results.reduce((s, r) => s + r.found.length, 0), total = R.results.reduce((s, r) => s + r.ids.length, 0);
  finishRun({ name: se.players[se.idx], raw: time, pen: 0, time, correct, total, sections: R.results });
}

/* ---------------- quick fire: one question at a time ---------------- */
function quickRun() {
  const se = S.session, cfg = se.cfg, Q = se.questions;
  const clock = makeClock();
  const R = { i: 0, pen: 0, res: [], busy: false };
  clock.extra = () => R.pen;

  const timerEl = h('div', { class: 'timer num' }, '0.0');
  const countEl = h('div', { class: 'count num' });
  const penEl = h('div', { class: 'pen num' });
  const barEl = h('i');
  const stage = h('div', { class: 'stage' });
  const revealEl = h('div', { class: 'reveal', 'aria-live': 'polite' });
  let input, choicesEl, help;
  const answerArea = h('div');
  if (cfg.style === 'type') {
    input = h('input', { class: 'input', type: 'text', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'go', 'aria-label': 'Your answer' });
    const skipBtn = h('button', { class: 'btn ghost skip' }, 'Skip +10s');
    const sugEl = h('div', { class: 'suggest', 'aria-live': 'polite', hidden: true });
    help = spellingHelp(input, sugEl, () => Q[R.i].kind, () => Q[R.i].id, () => done(true, 'typed'));
    answerArea.append(h('div', { class: 'answer' }, input, skipBtn), sugEl);
    input.addEventListener('input', () => { if (R.busy) return; if (isRight(Q[R.i].id, Q[R.i].kind, input.value)) done(true, 'typed'); else help.update(); });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return; e.preventDefault();
      if (R.busy) return;
      if (isRight(Q[R.i].id, Q[R.i].kind, input.value)) return done(true, 'typed');
      help.enter();
    });
    skipBtn.addEventListener('click', () => { if (!R.busy) { done(false, 'skip'); input.focus(); } });
  } else {
    choicesEl = h('div', { class: 'choices' });
    answerArea.append(choicesEl);
  }
  const quit = h('button', { class: 'iconbtn', 'aria-label': 'Stop the run', onclick: () => quitRun(() => { clock.over = true; home(); }) }, '✕');
  mount(h('div', { class: 'app run' },
    h('div', { class: 'hud' }, quit, countEl, timerEl, penEl),
    h('div', { class: 'bar' }, barEl),
    stage, revealEl, answerArea));
  cleanup.push(() => { clock.over = true; });

  function show() {
    const q = Q[R.i], c = BY_ID[q.id];
    countEl.replaceChildren(String(R.i + 1) + '/' + Q.length, h('small', null, 'DONE ' + R.res.filter((x) => x.ok).length));
    penEl.replaceChildren(R.pen ? '+' + R.pen / 1000 + 's' : '+0s', h('small', null, 'PENALTY'));
    barEl.style.width = (R.i / Q.length * 100) + '%';
    stage.className = 'stage';
    revealEl.textContent = '';
    const kindChip = cfg.mode === 'mix' ? h('span', { class: 'eyebrow kind' }, q.kind === 'flag' ? '🏳️ Flag' : q.kind === 'shape' ? '🗺️ Shape' : '🏛️ Capital') : null;
    if (q.kind === 'flag') {
      const im = imgCache[q.id] && imgCache[q.id].complete ? imgCache[q.id].cloneNode() : h('img', { src: c.flag });
      im.className = 'flag'; im.alt = 'A flag'; im.width = Math.round(c.ratio * 480); im.height = 480;
      stage.replaceChildren(...[kindChip, im].filter(Boolean));
    } else if (q.kind === 'shape') {
      stage.replaceChildren(...[kindChip, h('span', { class: 'reg' }, regionLabel(c.region)), shapeSvg(q.id, 'shape')].filter(Boolean));
    } else {
      stage.replaceChildren(...[kindChip, h('div', { class: 'ask' }, 'Capital of'), h('div', { class: 'big' }, c.name)].filter(Boolean));
    }
    if (input) {
      input.value = ''; help.clear();
      input.placeholder = q.kind === 'capital' ? 'Type the capital…' : 'Type the country…';
      input.focus({ preventScroll: true });
    } else {
      choicesEl.replaceChildren(...q.opts.map((id) => h('button', { class: 'choice', 'data-id': id, onclick: () => pick(id) }, answerText(id, q.kind))));
    }
  }
  function pick(id) {
    if (R.busy) return;
    const q = Q[R.i];
    const btn = choicesEl.querySelector('[data-id="' + id + '"]');
    if (id === q.id) { btn.classList.add('right'); done(true, 'pick'); }
    else { btn.classList.add('wrong'); choicesEl.querySelector('[data-id="' + q.id + '"]').classList.add('right'); done(false, 'wrong'); }
  }
  function done(ok, how) {
    R.busy = true; clock.pause(); if (help) help.clear();
    const q = Q[R.i];
    if (!ok) { R.pen += how === 'skip' ? SKIP_MS : WRONG_MS; try { navigator.vibrate && navigator.vibrate(60); } catch (e) { /* no vibration */ } }
    R.res.push({ id: q.id, kind: q.kind, ok, how });
    stage.classList.add(ok ? 'ok' : 'bad');
    if (!ok) revealEl.textContent = '→ ' + answerText(q.id, q.kind);
    // The clock is stopped while the answer is on screen, so the pause costs nobody anything.
    setTimeout(() => {
      R.i++; R.busy = false;
      if (R.i >= Q.length) return finish();
      clock.resume(); show();
    }, ok ? 180 : 1000);
  }
  function finish() {
    clock.over = true;
    const raw = clock.elapsed();
    finishRun({ name: se.players[se.idx], raw, pen: R.pen, time: Math.round(raw + R.pen), correct: R.res.filter((x) => x.ok).length, total: Q.length, res: R.res });
  }
  if (choicesEl) {
    const onKey = (e) => { const k = parseInt(e.key, 10); if (k >= 1 && k <= 4) { const q = Q[R.i]; if (q && q.opts[k - 1]) pick(q.opts[k - 1]); } };
    document.addEventListener('keydown', onKey);
    cleanup.push(() => document.removeEventListener('keydown', onKey));
  }
  show();
}
