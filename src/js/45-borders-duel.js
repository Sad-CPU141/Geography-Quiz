/* ---- Borders and Bigger country ---- */

// Shared header for the one-at-a-time board games.
function boardHead(api, extra) {
  const head = h('div', { class: 'bhead' },
    h('div', { class: 'hud' },
      h('button', { class: 'iconbtn', 'aria-label': 'Stop the run', onclick: api.quit }, '✕'),
      h('div', { class: 'secname' }, h('b', null, gameOf(api.sec.game).em + ' ' + api.label), api.part ? h('small', null, 'Game ' + api.part) : null),
      h('div', { class: 'timer num' }, fmtTime(api.R.clock.elapsed())),
      h('button', { class: 'btn ghost giveup', onclick: () => api.giveUp() }, 'Give up')),
    extra);
  return head;
}

/* Borders: a country is shown; name every country it shares a land border with (any order). Each neighbour is
   one point. Skip moves on and brings the country back later. */
function bordersGame(api) {
  const { sec, res } = api;
  const queue = sec.countries.slice();
  let revealed = false, ended = false;
  const done = new Set(); // "de>fr" keys found
  const foundEl = h('span', { class: 'found num' });
  const input = h('input', { class: 'input', type: 'text', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'go', placeholder: 'Type a neighbour…', 'aria-label': 'A neighbouring country' });
  const sugEl = h('div', { class: 'suggest', 'aria-live': 'polite', hidden: true });
  const skipBtn = h('button', { class: 'btn ghost giveup', onclick: () => skip() }, 'Skip');
  const showBtn = api.practice ? h('button', { class: 'btn ghost giveup', onclick: () => showAnswer() }, 'Show') : null;
  const card = h('div', { class: 'bcard' });
  const footer = h('div', { class: 'reveal-bar', hidden: true });
  const head = boardHead(api, [h('div', { class: 'typebar' }, input, showBtn, skipBtn), sugEl, h('div', { class: 'progress' }, foundEl)]);
  mount(h('div', { class: 'app wide grid-run' }, head, card, footer));
  const remaining = (id) => BY_ID[id].nb.filter((n) => !done.has(id + '>' + n));
  // Which still-missing neighbour of the current country does this text name?
  const match = (text) => { const cur = queue[0]; return cur ? remaining(cur).find((n) => isRight(n, 'country', text)) : null; };
  const help = spellingHelp(input, sugEl, 'country', () => queue[0], () => accept(), (text) => !!match(text));
  function count() { foundEl.textContent = done.size + ' / ' + sec.ids.length + ' borders'; }
  function draw() {
    const cur = queue[0];
    if (!cur) return;
    const c = BY_ID[cur];
    card.replaceChildren(
      h('div', { class: 'bcard-top' }, shapeSvg(cur, 'bshape'), h('div', null, h('p', { class: 'eyebrow' }, 'Countries bordering'), h('div', { class: 'big' }, c.name), h('p', { class: 'small muted' }, c.nb.length + (c.nb.length === 1 ? ' neighbour' : ' neighbours')))),
      h('div', { class: 'slots' }, c.nb.map((n) => { const got = done.has(cur + '>' + n); return h('span', { class: 'slot' + (got ? ' got' : '') }, got ? BY_ID[n].name : '?'); })));
  }
  function accept() {
    const n = match(input.value), cur = queue[0];
    if (!n) return;
    done.add(cur + '>' + n); res.found.push(cur + '>' + n);
    input.value = ''; help.clear(); count();
    if (!remaining(cur).length) {
      queue.shift();
      if (!queue.length) { ended = true; draw(); input.disabled = true; skipBtn.disabled = true; api.done(); return; }
    }
    draw(); input.focus({ preventScroll: true });
  }
  // Practice: show the neighbours you haven't named (they count as missed), then the next country.
  let showing = false;
  function showAnswer() {
    if (revealed || ended || showing || !queue[0]) return;
    showing = true;
    const cur = queue[0];
    card.querySelectorAll('.slot').forEach((el, k) => { const n = BY_ID[cur].nb[k]; if (!done.has(cur + '>' + n)) { el.classList.add('shown'); el.textContent = BY_ID[n].name; } });
    setTimeout(() => {
      showing = false; queue.shift(); input.value = ''; help.clear();
      if (!queue.length) { ended = true; input.disabled = true; skipBtn.disabled = true; api.done(); return; }
      draw(); input.focus({ preventScroll: true });
    }, 1400);
  }
  function skip() { if (revealed || ended || queue.length < 2) return; queue.push(queue.shift()); input.value = ''; help.clear(); draw(); input.focus({ preventScroll: true }); }
  input.addEventListener('input', () => { if (revealed || ended) return; if (match(input.value)) accept(); else help.update(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (!revealed && !ended) { if (match(input.value)) accept(); else help.enter(); } } });
  count(); draw(); input.focus({ preventScroll: true });
  return {
    completed() { head.classList.add('all-done'); },
    reveal(btn) {
      revealed = true; input.disabled = true; skipBtn.disabled = true; help.clear();
      head.classList.add('gave-up');
      const left = sec.countries.filter((id) => remaining(id).length);
      card.replaceChildren(h('p', { class: 'eyebrow' }, 'Borders you missed (in red)'), h('ul', { class: 'pairs' }, left.map((id) => h('li', null, h('span', null, BY_ID[id].name), h('b', null, remaining(id).map((n) => BY_ID[n].name).join(', '))))));
      footer.hidden = false; footer.replaceChildren(btn);
      window.scrollTo(0, 0);
    },
  };
}

/* Bigger country: two countries; tap the one with more land area (areas from the world-countries data).
   A wrong pick shows the right one and counts as missed; either way both areas are shown for a moment (the
   clock is stopped while they're on screen). On a keyboard: 1 / 2 or ← / →. */
function duelGame(api) {
  const { sec, res } = api;
  let i = 0, busy = false, revealed = false;
  const foundEl = h('span', { class: 'found num' });
  const arena = h('div', { class: 'duel' });
  const footer = h('div', { class: 'reveal-bar', hidden: true });
  const head = boardHead(api, h('div', { class: 'progress' }, foundEl));
  mount(h('div', { class: 'app grid-run' }, head, arena, footer));
  const fmtArea = (a) => a.toLocaleString('en-US') + ' km²';
  function count() { foundEl.textContent = res.found.length + ' / ' + sec.ids.length + ' right · round ' + Math.min(i + 1, sec.ids.length); }
  function draw() {
    const [a, b] = sec.ids[i].split('|');
    arena.replaceChildren(h('p', { class: 'eyebrow center' }, 'Which is bigger?'), h('div', { class: 'duel-row' }, [a, b].map((id, k) => h('button', { class: 'duel-pick', 'data-id': id, onclick: () => pick(id) },
      h('span', { class: 'pic flagbox' }, h('img', { src: BY_ID[id].flag, alt: '', width: Math.round(BY_ID[id].ratio * 100), height: 100 })),
      h('b', null, BY_ID[id].name), h('small', { class: 'area' }, ''), h('span', { class: 'key' }, String(k + 1))))));
  }
  function pick(id) {
    if (busy || revealed || i >= sec.ids.length) return;
    busy = true; api.R.clock.pause();
    const key = sec.ids[i], win = duelWinner(key);
    if (id === win) res.found.push(key); else try { navigator.vibrate && navigator.vibrate(40); } catch (e) { /* no vibration */ }
    arena.querySelectorAll('.duel-pick').forEach((btn) => {
      const bid = btn.getAttribute('data-id');
      btn.classList.add(bid === win ? 'right' : bid === id ? 'wrong' : 'other');
      btn.querySelector('.area').textContent = fmtArea(BY_ID[bid].area);
    });
    count();
    setTimeout(() => {
      busy = false; api.R.clock.resume(); i++;
      if (i >= sec.ids.length) { api.done(); return; }
      count(); draw();
    }, id === win ? 700 : 1300);
  }
  const onKey = (e) => {
    if (busy || revealed || i >= sec.ids.length) return;
    const [a, b] = sec.ids[i].split('|');
    if (e.key === '1' || e.key === 'ArrowLeft') pick(a); else if (e.key === '2' || e.key === 'ArrowRight') pick(b);
  };
  document.addEventListener('keydown', onKey); cleanup.push(() => document.removeEventListener('keydown', onKey));
  count(); draw();
  return {
    completed() { head.classList.add('all-done'); },
    reveal(btn) {
      revealed = true; head.classList.add('gave-up');
      arena.replaceChildren(h('p', { class: 'eyebrow' }, 'Rounds left (bigger one first)'), h('ul', { class: 'pairs' }, sec.ids.slice(i).map((key) => { const w = duelWinner(key), l = key.split('|').find((x) => x !== w); return h('li', null, h('span', null, BY_ID[w].name + ' > ' + BY_ID[l].name), h('b', null, fmtArea(BY_ID[w].area))); })));
      footer.hidden = false; footer.replaceChildren(btn);
    },
  };
}

/* Guess the language: a sentence (Article 1 of the Universal Declaration of Human Rights, a real official translation)
   in one of the region's official languages; pick it from 4. A wrong pick shows the right one and counts as missed;
   the clock is stopped while the answer is on screen. On a keyboard: 1–4. */
const LANG_TAG = { zho: 'zh-Hans', jpn: 'ja', kor: 'ko' }; // so Chinese / Japanese characters get the right font
function langQuote(id, cls) {
  const l = langOf(id);
  return h('blockquote', { class: cls || 'lang-text', dir: l.dir, lang: LANG_TAG[l.k] || null }, langText(id));
}
function langGame(api) {
  const { sec, res } = api;
  let i = 0, busy = false, revealed = false;
  const foundEl = h('span', { class: 'found num' });
  const arena = h('div', { class: 'duel langq' });
  const footer = h('div', { class: 'reveal-bar', hidden: true });
  const head = boardHead(api, h('div', { class: 'progress' }, foundEl));
  mount(h('div', { class: 'app grid-run' }, head, arena, footer));
  function count() { foundEl.textContent = res.found.length + ' / ' + sec.ids.length + ' right · round ' + Math.min(i + 1, sec.ids.length); }
  function draw() {
    const k = sec.ids[i];
    arena.replaceChildren(h('p', { class: 'eyebrow center' }, 'Which language?'), langQuote(k),
      h('div', { class: 'lang-opts' }, sec.opts[k].map((o, n) => h('button', { class: 'duel-pick lang-pick', 'data-id': o, onclick: () => pick(o) },
        h('b', null, LANG_BY[o].name), h('span', { class: 'key' }, String(n + 1))))));
  }
  function pick(o) {
    if (busy || revealed || i >= sec.ids.length) return;
    busy = true; api.R.clock.pause();
    const id = sec.ids[i], k = langOf(id).k;
    if (o === k) res.found.push(id); else try { navigator.vibrate && navigator.vibrate(40); } catch (e) { /* no vibration */ }
    arena.querySelectorAll('.lang-pick').forEach((btn) => {
      const b = btn.getAttribute('data-id');
      btn.classList.add(b === k ? 'right' : b === o ? 'wrong' : 'other');
    });
    count();
    setTimeout(() => {
      busy = false; api.R.clock.resume(); i++;
      if (i >= sec.ids.length) { api.done(); return; }
      count(); draw();
    }, o === k ? 700 : 1400);
  }
  const onKey = (e) => {
    if (busy || revealed || i >= sec.ids.length || e.ctrlKey || e.metaKey || e.altKey) return;
    const n = '1234'.indexOf(e.key);
    if (n >= 0 && sec.opts[sec.ids[i]][n]) pick(sec.opts[sec.ids[i]][n]);
  };
  document.addEventListener('keydown', onKey); cleanup.push(() => document.removeEventListener('keydown', onKey));
  count(); draw();
  return {
    completed() { head.classList.add('all-done'); },
    reveal(btn) {
      revealed = true; head.classList.add('gave-up');
      arena.replaceChildren(h('p', { class: 'eyebrow' }, 'Rounds left'), langList(sec.ids.slice(i)));
      footer.hidden = false; footer.replaceChildren(btn);
    },
  };
}
// Language name + its sentence (results and give up).
function langList(keys) {
  return h('ul', { class: 'langlist' }, keys.map((id) => h('li', null, h('b', null, langOf(id).name), langQuote(id, 'lang-small'))));
}
