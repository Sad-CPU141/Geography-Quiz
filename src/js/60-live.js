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

// Everyone else: type the code (or open the link).
function liveJoinScreen(prefill) {
  let inp;
  const go = async () => {
    const code = (inp.value || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (code.length !== 5) return toast('Codes are 5 letters');
    if (!S.myName) return toast('Add your name first');
    if (!(await liveReady())) return;
    let room;
    try { room = await NET.get(code); } catch (e) { return toast('Couldn\'t connect. Check your internet.'); }
    if (!room) return toast('Room not found');
    if (room.state === 'play' && !(room.players && room.players[NET.uid()])) return toast('That race has started');
    await NET.update('rooms/' + code + '/players/' + NET.uid(), { name: myName(), joined: NET.now(), gone: null });
    liveLobby(code);
  };
  mount(h('div', { class: 'app' }, topbar('Online race', home),
    h('div', { class: 'card' }, h('p', { class: 'eyebrow' }, 'Room code'),
      inp = h('input', { class: 'input code', style: { fontSize: '30px' }, placeholder: 'ABCDE', maxlength: 5, value: prefill || '', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', onkeydown: (e) => { if (e.key === 'Enter') go(); } }),
      nameField()),
    h('button', { class: 'btn primary', onclick: go }, '🌐 Join'),
    h('p', { class: 'small muted center' }, 'Making a room: New run → Online')));
  if (!prefill) inp.focus();
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
  mount(h('div', { class: 'app' }, topbar('Online race', () => { liveStop(); home(); }),
    h('div', { class: 'center stack', style: { gap: '4px' } }, h('p', { class: 'eyebrow' }, 'Room'), h('div', { class: 'code roomcode' }, code), what),
    h('button', { class: 'btn ghost small', onclick: () => shareRoom(code) }, '📤 Invite'),
    list, startBtn, wait));
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
  try { await navigator.clipboard.writeText(text + '\n' + url); toast('Invite copied'); } catch (e) { prompt('Send this link:', url); }
}
// Host: start (or restart) the race 4 seconds from now, for everyone. A new round gets a new order.
async function liveStartRound() {
  const room = LIVE.room; if (!room || room.host !== NET.uid()) return;
  const round = (room.round || 0) + 1;
  const reset = {};
  Object.keys(room.players || {}).forEach((id) => { reset['players/' + id + '/found'] = 0; reset['players/' + id + '/done'] = null; reset['players/' + id + '/time'] = null; reset['players/' + id + '/correct'] = null; reset['players/' + id + '/round'] = round; });
  const cfg = round === 1 ? room.cfg : Object.assign({}, room.cfg, { seed: newSeed() });
  await NET.update('rooms/' + LIVE.code, Object.assign(reset, { cfg, round, state: 'play', startAt: NET.now() + 4000 }));
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
// On the results screen: everyone's results, updating as they finish.
function liveResults() {
  const box = h('div', { class: 'card sky' });
  const draw = (room) => {
    if (!room) return;
    const st = liveStandings(room), host = room.host === NET.uid(), waiting = st.filter((p) => !p.done).length;
    box.replaceChildren(h('p', { class: 'eyebrow' }, '🌐 Room ' + LIVE.code + (waiting ? ' · ' + waiting + ' still playing' : '')),
      h('ul', { class: 'list board' }, st.map((p, i) => h('li', { class: i === 0 && p.done ? 'first' : null }, h('span', { class: 'rank' }, String(i + 1)),
        h('div', { class: 'q' }, p.name + (p.id === NET.uid() ? ' (you)' : ''), h('small', null, p.done ? p.correct + '/' + p.total + ' found' : 'playing · ' + p.found + '/' + p.total)),
        h('div', { class: 't' }, p.done ? fmtTime(p.time) : '…')))),
      host ? h('button', { class: 'btn primary small', onclick: () => liveStartRound() }, '🔁 Another round') : h('p', { class: 'small muted center' }, 'The host can start another round'));
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
