/* ---- Online race (Firebase Realtime Database) ----
   One phone creates a room (a 5-letter code), friends join with the code or the link, the host starts, and
   everyone plays the same run at the same moment on their own phone. Each phone sends its progress (how many
   found) a couple of times a second; a live bar shows the standings, and the results show everyone.

   Data, in the database: rooms/CODE = { host, cfg, round, state: 'lobby' | 'play', startAt, createdAt,
     players: { uid: { name, joined, found, sec, done, time, correct, total, round } } }
   Players sign in anonymously (no account). Rules: database.rules.json (paste into the Firebase console).

   NET hides the backend: Firebase normally; with ?net=local a stand-in that keeps rooms in localStorage and
   works between tabs of one browser (used by the tests, which can't reach Firebase). */
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyC44-tG1wwY7dWpNCNe8_57eFpzWvPW0pg',
  authDomain: 'geography-speedrun.firebaseapp.com',
  databaseURL: 'https://geography-speedrun-default-rtdb.firebaseio.com',
  projectId: 'geography-speedrun',
  storageBucket: 'geography-speedrun.firebasestorage.app',
  messagingSenderId: '333346422677',
  appId: '1:333346422677:web:25962b0b04a1a87687c09c',
};
const ROOM_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const LOCAL_NET = new URLSearchParams(location.search).get('net') === 'local' || window.GS_NET === 'local';

const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); });

function firebaseNet() {
  let db, uid, offset = 0;
  return {
    async init() {
      if (uid) return uid;
      if (!window.firebase) {
        await loadScript('vendor/firebase/firebase-app-compat.js');
        await Promise.all([loadScript('vendor/firebase/firebase-auth-compat.js'), loadScript('vendor/firebase/firebase-database-compat.js')]);
      }
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      const cred = await firebase.auth().signInAnonymously();
      uid = cred.user.uid;
      db = firebase.database();
      db.ref('.info/serverTimeOffset').on('value', (s) => { offset = s.val() || 0; });
      return uid;
    },
    uid: () => uid,
    now: () => Date.now() + offset,
    async create(code, room) { const r = await db.ref('rooms/' + code).transaction((cur) => (cur === null ? room : undefined)); return r.committed; },
    async get(code) { return (await db.ref('rooms/' + code).get()).val(); },
    update(path, obj) { return db.ref(path).update(obj); },
    watch(code, cb) { const ref = db.ref('rooms/' + code); const f = (s) => cb(s.val()); ref.on('value', f); return () => ref.off('value', f); },
    onLeave(path) { db.ref(path).onDisconnect().update({ gone: true }); },
  };
}
function localNet() {
  const KEY = 'gs_net_local_v1';
  const all = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
  const save = (v) => { localStorage.setItem(KEY, JSON.stringify(v)); window.dispatchEvent(new Event('gs-local-net')); };
  const setPath = (obj, path, val) => { const ks = path.split('/'); let o = obj; ks.slice(0, -1).forEach((k) => { o[k] = o[k] || {}; o = o[k]; }); o[ks[ks.length - 1]] = val; };
  let uid = null;
  return {
    async init() { uid = uid || sessionStorage.getItem('gs_local_uid') || 'u' + Math.random().toString(36).slice(2, 10); sessionStorage.setItem('gs_local_uid', uid); return uid; },
    uid: () => uid,
    now: () => Date.now(),
    async create(code, room) { const v = all(); if (v.rooms && v.rooms[code]) return false; setPath(v, 'rooms/' + code, room); save(v); return true; },
    async get(code) { const v = all(); return (v.rooms && v.rooms[code]) || null; },
    async update(path, obj) { const v = all(); Object.entries(obj).forEach(([k, val]) => setPath(v, path + '/' + k, val)); save(v); },
    watch(code, cb) {
      const f = () => { const v = all(); cb((v.rooms && v.rooms[code]) || null); };
      window.addEventListener('storage', f); window.addEventListener('gs-local-net', f); setTimeout(f, 0);
      return () => { window.removeEventListener('storage', f); window.removeEventListener('gs-local-net', f); };
    },
    onLeave() {},
  };
}
const NET = LOCAL_NET ? localNet() : firebaseNet();

/* ---------------- screens ---------------- */
const LIVE = { code: null, room: null, unwatch: null, startedRound: 0, reporter: null };
function liveStop() { if (LIVE.unwatch) LIVE.unwatch(); LIVE.unwatch = null; if (LIVE.reporter) clearInterval(LIVE.reporter); LIVE.reporter = null; document.querySelectorAll('.livebar').forEach((e) => e.remove()); }
const myName = () => S.myName || 'Player';
async function liveReady() {
  try { await NET.init(); return true; } catch (e) { toast('Couldn\'t connect. Check your internet.'); return false; }
}

// Host: make a room with this run, then wait in the lobby.
async function liveCreate(cfg) {
  if (!S.myName) return toast('Add your name first');
  mount(h('div', { class: 'app' }, h('div', { class: 'cover' }, h('p', { class: 'muted' }, 'Connecting…'))));
  if (!(await liveReady())) return setup();
  for (let tries = 0; tries < 6; tries++) {
    const code = Array.from({ length: 5 }, () => ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)]).join('');
    const room = { host: NET.uid(), cfg, round: 0, state: 'lobby', createdAt: NET.now(), players: { [NET.uid()]: { name: myName(), joined: NET.now() } } };
    try { if (await NET.create(code, room)) return liveLobby(code); } catch (e) { break; }
  }
  toast('Couldn\'t make a room. Try again.'); setup();
}

// The Online screen (home → 🌐 Online): host a match, join one (code, link or QR), or play a challenge code.
async function liveJoin(code) {
  code = String(code || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (code.length !== 5) return toast('Room codes are 5 letters');
  if (!S.myName) return toast('Add your name first');
  if (!(await liveReady())) return;
  let room;
  try { room = await NET.get(code); } catch (e) { return toast('Couldn\'t connect. Check your internet.'); }
  if (!room) return toast('Room not found');
  if (room.state === 'play' && !(room.players && room.players[NET.uid()])) return toast('That race has started');
  await NET.update('rooms/' + code + '/players/' + NET.uid(), { name: myName(), joined: NET.now(), gone: null });
  liveLobby(code);
}
function onlineHub(prefill) {
  if (typeof prefill !== 'string') prefill = '';
  let room, chal, chalInfo;
  const playChallenge = () => {
    const cfg = decodeCode(chal.value);
    if (!cfg) return toast('Code not found');
    startSession(cfg, [S.myName || 'You'], null);
  };
  const checkChal = () => { const cfg = decodeCode(chal.value); chalInfo.textContent = cfg ? '✓ ' + cfgLabel(cfg) : ''; };
  mount(h('div', { class: 'app', 'data-screen': 'online' }, topbar('Online', home),
    nameField(),
    h('div', { class: 'card' }, h('p', { class: 'eyebrow' }, 'Host a match'),
      h('button', { class: 'btn primary', onclick: () => { if (!S.myName) return toast('Add your name first'); S.setup.kind = 'board'; S.setup.group = 'live'; store.set('gs_setup_v2', S.setup); setup(); } }, '🌐 Host match')),
    h('div', { class: 'card' }, h('p', { class: 'eyebrow' }, 'Join a match'),
      room = h('input', { class: 'input code', style: { fontSize: '30px' }, placeholder: 'ABCDE', maxlength: 5, value: prefill, autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Room code', onkeydown: (e) => { if (e.key === 'Enter') liveJoin(room.value); } }),
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost small', onclick: () => scanQR((code) => { room.value = code; liveJoin(code); }) }, '📷 Scan QR'),
        h('button', { class: 'btn primary small', onclick: () => liveJoin(room.value) }, 'Join'))),
    (() => { const c = h2hCard(); return c ? h('div', { class: 'card' }, c) : null; })(),
    h('div', { class: 'card' }, h('p', { class: 'eyebrow' }, 'Challenge code'),
      chal = h('input', { class: 'input code', style: { fontSize: '24px' }, placeholder: 'ABCD-1234', maxlength: 20, autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Challenge code', oninput: () => checkChal(), onkeydown: (e) => { if (e.key === 'Enter') playChallenge(); } }),
      chalInfo = h('p', { class: 'small muted' }),
      h('button', { class: 'btn ghost small', onclick: playChallenge }, '▶ Play'))));
}
// Kept for old links/buttons.
const liveJoinScreen = (code) => onlineHub(code);

/* ---------------- QR codes ---------------- */
// Draw a QR code (dark on white so any phone camera can read it).
async function qrSvg(text) {
  if (!window.qrcode) await loadScript('vendor/qr/qrcode.js');
  const qr = window.qrcode(0, 'M'); qr.addData(text); qr.make();
  const n = qr.getModuleCount(), m = 2;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += 'M' + (c + m) + ' ' + (r + m) + 'h1v1h-1z';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 ' + (n + 2 * m) + ' ' + (n + 2 * m)); svg.setAttribute('class', 'qr'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'QR code to join');
  svg.innerHTML = '<rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#0f0c21" shape-rendering="crispEdges"/>';
  return svg;
}
// Scan a QR code with the camera; calls back with the room code.
async function scanQR(onCode) {
  const video = h('video', { class: 'scan-video', playsinline: true, muted: true, autoplay: true });
  const msg = h('p', { class: 'small muted center' }, 'Point at the QR code');
  let stream = null, done = false;
  const stop = () => { done = true; if (stream) stream.getTracks().forEach((t) => t.stop()); bg.remove(); };
  const bg = modal(h('p', { class: 'eyebrow' }, 'Scan to join'), video, msg, h('button', { class: 'btn ghost small', onclick: stop }, 'Cancel'));
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); }
  catch (e) { msg.textContent = 'Camera not available. Type the code instead.'; return; }
  video.srcObject = stream; video.play().catch(() => {});
  const detector = 'BarcodeDetector' in window ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
  if (!detector && !window.jsQR) { try { await loadScript('vendor/qr/jsQR.js'); } catch (e) { msg.textContent = 'Scanner didn\'t load. Type the code instead.'; return; } }
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  const found = (text) => {
    const m = /[?&]room=([A-Za-z]{5})/.exec(text || '') || /^\s*([A-Za-z]{5})\s*$/.exec(text || '');
    if (!m) { msg.textContent = 'That QR code isn\'t a room'; return false; }
    stop(); onCode(m[1].toUpperCase()); return true;
  };
  const tick = async () => {
    if (!done && !document.body.contains(bg)) stop(); // closed by tapping outside
    if (done) return;
    if (video.readyState >= 2) {
      try {
        if (detector) { const r = await detector.detect(video); if (r[0] && found(r[0].rawValue)) return; }
        else {
          canvas.width = video.videoWidth; canvas.height = video.videoHeight; ctx.drawImage(video, 0, 0);
          const r = window.jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
          if (r && found(r.data)) return;
        }
      } catch (e) { /* try the next frame */ }
    }
    setTimeout(tick, 200);
  };
  tick();
}

function liveLink(code) { return location.origin + location.pathname + '?room=' + code; }
function liveLobby(code) {
  liveStop();
  LIVE.code = code;
  NET.onLeave('rooms/' + code + '/players/' + NET.uid());
  const list = h('ul', { class: 'list board' });
  const startBtn = h('button', { class: 'btn primary', onclick: () => liveStartRound() }, '▶ Start race');
  const wait = h('p', { class: 'muted center' }, 'Waiting for the host…');
  const what = h('p', { class: 'muted center' });
  const qrBox = h('div', { class: 'qrbox' });
  mount(h('div', { class: 'app' }, topbar('Online race', () => { liveStop(); home(); }),
    h('div', { class: 'center stack', style: { gap: '4px' } }, h('p', { class: 'eyebrow' }, 'Room'), h('div', { class: 'code roomcode' }, code), what),
    qrBox,
    h('div', { class: 'linkrow' }, h('input', { class: 'input', readonly: true, value: liveLink(code), 'aria-label': 'Join link', onfocus: (e) => e.target.select() }),
      h('button', { class: 'btn ghost small', onclick: async () => { try { await navigator.clipboard.writeText(liveLink(code)); toast('Link copied'); } catch (e) { copyBox('Copy the link', liveLink(code)); } } }, 'Copy')),
    h('button', { class: 'btn ghost small', onclick: () => shareRoom(code) }, '📤 Share'),
    list, startBtn, wait));
  qrSvg(liveLink(code)).then((svg) => qrBox.replaceChildren(svg)).catch(() => qrBox.remove());
  LIVE.unwatch = NET.watch(code, (room) => {
    if (!room) { toast('The room was closed'); liveStop(); home(); return; }
    LIVE.room = room;
    const host = room.host === NET.uid();
    what.textContent = cfgLabel(room.cfg);
    const ps = Object.entries(room.players || {}).filter(([, p]) => !p.gone);
    list.replaceChildren(...ps.map(([id, p]) => h('li', null, h('span', { class: 'rank' }, id === room.host ? '★' : '•'), h('div', { class: 'q' }, p.name + (id === NET.uid() ? ' (you)' : '')))));
    startBtn.hidden = !host; wait.hidden = host;
    if (room.state === 'play' && room.round > LIVE.startedRound) liveBegin(room);
  });
}
async function shareRoom(code) {
  const url = liveLink(code), text = 'Race me in Geography Speedrun! Room ' + code;
  if (navigator.share) { try { await navigator.share({ title: 'Geography Speedrun race', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text + '\n' + url); toast('Invite copied'); } catch (e) { copyBox('Send this link', url); }
}
// Host: start (or restart) the race 4 seconds from now, for everyone. A new round gets a new order.
async function liveStartRound(next) {
  const room = LIVE.room; if (!room || room.host !== NET.uid()) return;
  S.liveNext = null;
  const round = (room.round || 0) + 1;
  const reset = {};
  Object.keys(room.players || {}).forEach((id) => { reset['players/' + id + '/found'] = 0; reset['players/' + id + '/done'] = null; reset['players/' + id + '/time'] = null; reset['players/' + id + '/correct'] = null; reset['players/' + id + '/round'] = round; });
  // The host's new choice from the setup screen, or the same games with a new order.
  const cfg = next || (round === 1 ? room.cfg : Object.assign({}, room.cfg, { seed: newSeed() }));
  await NET.update('rooms/' + LIVE.code, Object.assign(reset, { cfg, round, state: 'play', picking: null, startAt: NET.now() + 4000 }));
}
// Everyone: the countdown runs to the shared start time, then the same run starts on every phone.
function liveBegin(room) {
  LIVE.startedRound = room.round;
  const code = LIVE.code;
  startSession(room.cfg, [myName()], null, null, false);
  S.session.live = { code, round: room.round };
  const el = h('div', { class: 'cd', 'aria-live': 'assertive' }, '');
  mount(h('div', { class: 'app' }, h('div', { class: 'cover' }, h('p', { class: 'eyebrow' }, 'Room ' + code + ' · round ' + room.round), el, h('p', { class: 'muted' }, howTo(room.cfg)))));
  const go = () => {
    const left = room.startAt - NET.now();
    if (left <= 0) {
      const begin = () => { boardRun(); liveBar(); };
      if (room.cfg.games.some((g) => MAP_GAMES.has(g)) && !window.GS_MAP) loadMap().then(begin, () => toast('The map didn\'t load'));
      else begin();
      return;
    }
    el.textContent = String(Math.ceil(left / 1000));
    setTimeout(go, Math.min(250, left));
  };
  go();
}
// While playing: send my progress whenever it changes (at most twice a second).
function liveReporter(R) {
  const se = S.session, path = 'rooms/' + se.live.code + '/players/' + NET.uid();
  let last = -1, lastAt = 0;
  // Send when it changes, and again every few seconds anyway (in case an update got lost on a bad connection).
  const flush = () => {
    if (S.session !== se || R.clock.over) return;
    const found = R.results.reduce((n, r) => n + (r ? r.found.length : 0), 0);
    if (found !== last || Date.now() - lastAt > 3000) { last = found; lastAt = Date.now(); NET.update(path, { found, sec: R.sec }).catch(() => {}); }
  };
  if (LIVE.reporter) clearInterval(LIVE.reporter);
  LIVE.reporter = setInterval(() => { if (S.session !== se || R.clock.over) { clearInterval(LIVE.reporter); LIVE.reporter = null; return; } flush(); }, 500);
  // Send straight away when the app goes to the background (switching apps, locking the phone).
  const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
  document.addEventListener('visibilitychange', onHide); cleanup.push(() => document.removeEventListener('visibilitychange', onHide));
  window.addEventListener('pagehide', flush);
}
function liveFinished(score) {
  const se = S.session;
  if (LIVE.reporter) { clearInterval(LIVE.reporter); LIVE.reporter = null; }
  NET.update('rooms/' + se.live.code + '/players/' + NET.uid(), { found: score.correct, correct: score.correct, total: score.total, time: score.time, done: true }).catch(() => {});
}
// Standings, best first: finished players by score then time, then everyone else by how many they've found.
function liveStandings(room) {
  const total = cfgTotal(room.cfg);
  return Object.entries(room.players || {}).filter(([, p]) => !p.gone || p.done).map(([id, p]) => ({ id, name: p.name, found: p.found || 0, done: !!p.done, time: p.time, correct: p.correct, total }))
    .sort((a, b) => (b.done && a.done) ? (b.correct - a.correct || a.time - b.time) : (b.found - a.found || (b.done ? 1 : 0) - (a.done ? 1 : 0)));
}
// The little bar of standings at the bottom of the screen during a race.
function liveBar() {
  document.querySelectorAll('.livebar').forEach((e) => e.remove());
  const bar = h('div', { class: 'livebar', 'aria-live': 'off' });
  document.body.appendChild(bar);
  const draw = (room) => {
    if (!room || !S.session || !S.session.live) return bar.remove();
    const st = liveStandings(room), total = cfgTotal(room.cfg);
    bar.replaceChildren(...st.slice(0, 5).map((p, i) => h('span', { class: 'lb' + (p.id === NET.uid() ? ' me' : '') + (p.done ? ' done' : '') },
      h('b', null, (i + 1) + '. ' + p.name), ' ' + (p.done ? '✓ ' + p.correct : p.found) + '/' + total)));
  };
  if (LIVE.room) draw(LIVE.room);
  const prev = LIVE.unwatch;
  if (prev) prev();
  LIVE.unwatch = NET.watch(LIVE.code, (room) => { LIVE.room = room; draw(room); if (room && room.state === 'play' && room.round > LIVE.startedRound) liveBegin(room); });
}
/* Head-to-head: once everyone in a round has finished, each rival you raced counts a win, loss or tie for you
   (on this device, by their player id, so a new name keeps the record). gs_h2h_v1 = { uid: { name, w, l, t } }. */
function h2hRecord(room) {
  const me = room.players && room.players[NET.uid()];
  if (!me || !me.done || !room.round) return;
  const st = liveStandings(room);
  if (st.some((p) => !p.done)) return;
  const seen = store.get('gs_h2h_seen_v1', []), key = LIVE.code + ':' + room.round + ':' + room.createdAt;
  if (seen.includes(key)) return;
  const book = store.get('gs_h2h_v1', {}), mine = { correct: me.correct, time: me.time };
  st.forEach((p) => {
    if (p.id === NET.uid()) return;
    const r = book[p.id] = book[p.id] || { name: p.name, w: 0, l: 0, t: 0 };
    r.name = p.name; r.at = Date.now();
    if (better(mine, p, 'board')) r.w++; else if (better(p, mine, 'board')) r.l++; else r.t++;
  });
  store.set('gs_h2h_v1', book);
  store.set('gs_h2h_seen_v1', seen.concat([key]).slice(-200));
}
function h2hCard(ids) {
  const book = store.get('gs_h2h_v1', {});
  const rows = Object.entries(book).filter(([id]) => !ids || ids.includes(id)).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, ids ? 8 : 6);
  if (!rows.length) return null;
  return h('div', { class: 'h2h' }, h('p', { class: 'eyebrow' }, '⚔️ Head to head'),
    h('ul', { class: 'pairs' }, rows.map(([, r]) => h('li', null, h('span', null, 'You vs ' + r.name), h('b', { class: 'num ' + (r.w > r.l ? 'up' : r.w < r.l ? 'down' : '') }, r.w + ' – ' + r.l + (r.t ? ' · ' + r.t + 'T' : ''))))));
}
// Host, "Another round": back to the game list to change anything, then Start round (setup's button).
function liveNextRound() {
  NET.update('rooms/' + LIVE.code, { picking: true }).catch(() => {});
  if (LIVE.room && LIVE.room.cfg) {
    const c = LIVE.room.cfg; Object.assign(S.setup, { kind: 'board', games: c.games.slice(), help: !!c.help, hard: !!c.hard, langType: !!c.langType });
    if (c.regions) Object.assign(S.setup, { multi: true, regions: c.regions.slice() });
    else Object.assign(S.setup, { multi: false, region: c.limit ? 'mixed' : c.region }, c.limit ? { mixN: c.limit } : {});
  }
  S.liveNext = LIVE.code; setup();
}
// Back out of picking: to the room's lobby (where the host can also just start the same games again).
function liveBackToRoom() {
  const code = S.liveNext; S.liveNext = null;
  NET.update('rooms/' + code, { picking: null }).catch(() => {});
  liveLobby(code);
}
// On the results screen: everyone's results, updating as they finish. Players still playing show no score
// (you only see how they did once they've finished).
function liveResults() {
  const box = h('div', { class: 'card sky' });
  const draw = (room) => {
    if (!room) return;
    const all = liveStandings(room), host = room.host === NET.uid(), waiting = all.filter((p) => !p.done).length;
    const st = all.filter((p) => p.done).concat(all.filter((p) => !p.done).sort((a, b) => a.name.localeCompare(b.name)));
    box.replaceChildren(h('p', { class: 'eyebrow' }, '🌐 Room ' + LIVE.code + (waiting ? ' · ' + waiting + ' still playing' : '')),
      h('ul', { class: 'list board' }, st.map((p, i) => h('li', { class: i === 0 && p.done ? 'first' : null }, h('span', { class: 'rank' }, p.done ? String(i + 1) : '–'),
        h('div', { class: 'q' }, p.name + (p.id === NET.uid() ? ' (you)' : ''), h('small', null, p.done ? p.correct + '/' + p.total + ' found' : 'still playing…')),
        h('div', { class: 't' }, p.done ? fmtTime(p.time) : '…')))),
      ...[(h2hRecord(room), h2hCard(st.map((p) => p.id)))].filter(Boolean),
      host ? h('button', { class: 'btn primary small', onclick: liveNextRound }, '🔁 Another round')
        : h('p', { class: 'small muted center' }, room.picking ? 'The host is picking the next round…' : 'The host can start another round'));
  };
  if (LIVE.room) draw(LIVE.room);
  if (LIVE.unwatch) LIVE.unwatch();
  LIVE.unwatch = NET.watch(LIVE.code, (room) => { LIVE.room = room; draw(room); if (room && room.state === 'play' && room.round > LIVE.startedRound) liveBegin(room); });
  return box;
}

// A ?room=CODE link opens the join screen.
(function () {
  const q = new URLSearchParams(location.search), code = (q.get('room') || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (code.length === 5) S.joinRoom = code;
})();
