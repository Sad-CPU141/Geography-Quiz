/* ---- board games on a grid (JetPunk style): flags, shapes, capitals ----
   Every country is a tile. One tile is selected; type its answer and it fills in and the next empty tile is
   selected. Tap any tile (or ◀ ▶) to switch. */
function tilePic(game, id) {
  // Flags keep their real proportions (Monaco 5:4, Indonesia 3:2, Qatar 28:11, Nepal's two pennants…), centred in
  // the same-size box.
  if (game === 'flags') return h('span', { class: 'pic flagbox' }, h('img', { src: BY_ID[id].flag, alt: 'A flag', loading: 'lazy', width: Math.round(BY_ID[id].ratio * 100), height: 100 }));
  if (game === 'shapes') return shapeSvg(id, 'pic');
  if (game === 'revcap') return h('span', { class: 'pic name' }, BY_ID[id].capital);
  return h('span', { class: 'pic name' }, BY_ID[id].name);
}
function gridGame(api) {
  const { sec, res } = api;
  const game = sec.game, kind = sec.kind, ids = sec.ids;
  const found = new Set();
  let active = 0, revealed = false;

  const foundEl = h('span', { class: 'found num', 'aria-live': 'polite' });
  const input = h('input', { class: 'input', type: 'text', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'next',
    placeholder: kind === 'capital' ? 'Type the capital…' : 'Type the country…', 'aria-label': 'Answer for the selected tile' });
  const preview = h('div', { class: 'preview' });
  const sugEl = h('div', { class: 'suggest', 'aria-live': 'polite', hidden: true });
  const help = spellingHelp(input, sugEl, kind, () => ids[active], () => accept());
  const tiles = ids.map((id, i) => h('button', { class: 'tile', 'data-id': id, 'aria-label': kind === 'capital' ? 'Capital of ' + BY_ID[id].name : game === 'revcap' ? 'Country with the capital ' + BY_ID[id].capital : 'Tile ' + (i + 1),
    onmousedown: (e) => e.preventDefault(), onclick: () => { if (!revealed) select(i, true); } },
  tilePic(game, id), h('span', { class: 'lbl' })));
  const grid = h('div', { class: 'tiles t-' + (game === 'revcap' ? 'capitals' : game) }, tiles);
  const footer = h('div', { class: 'reveal-bar', hidden: true });
  const head = h('div', { class: 'bhead' },
    h('div', { class: 'hud' },
      h('button', { class: 'iconbtn', 'aria-label': 'Stop the run', onclick: api.quit }, '✕'),
      h('div', { class: 'secname' }, h('b', null, gameOf(game).em + ' ' + api.label), api.part ? h('small', null, 'Game ' + api.part) : null),
      h('div', { class: 'timer num' }, fmtTime(api.R.clock.elapsed())),
      h('button', { class: 'btn ghost giveup', onclick: () => { if (!revealed) api.giveUp(); } }, 'Give up')),
    h('div', { class: 'typebar' },
      preview,
      h('button', { class: 'iconbtn', 'aria-label': 'Previous', onmousedown: (e) => e.preventDefault(), onclick: () => step(-1) }, '◀'),
      input,
      h('button', { class: 'iconbtn', 'aria-label': 'Next', onmousedown: (e) => e.preventDefault(), onclick: () => step(1) }, '▶')),
    sugEl,
    h('div', { class: 'progress' }, foundEl, api.practice ? h('button', { class: 'showbtn', onmousedown: (e) => e.preventDefault(), onclick: () => showAnswer() }, '👁 Show answer') : null));
  mount(h('div', { class: 'app wide grid-run' }, head, grid, footer));

  function count() { foundEl.textContent = found.size + ' / ' + ids.length + ' found'; }
  function select(i, focus) {
    tiles[active].classList.remove('active');
    active = i;
    const t = tiles[i];
    t.classList.add('active');
    preview.replaceChildren(tilePic(game, ids[i]));
    preview.classList.toggle('name', game === 'capitals' || game === 'revcap');
    input.value = ''; help.clear();
    t.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    if (focus) keepFocus(input, t);
  }
  // The next tile that isn't found yet, going forwards (d = 1) or backwards (d = -1) and wrapping round.
  function nextOpen(from, d) {
    for (let k = 1; k <= ids.length; k++) { const i = ((from + d * k) % ids.length + ids.length) % ids.length; if (!found.has(ids[i]) && !shown.has(ids[i])) return i; }
    return -1;
  }
  // Practice: show the answer for the selected tile (counts as missed) and go to the next one.
  const shown = new Set();
  function showAnswer() {
    const id = ids[active];
    if (revealed || found.has(id) || shown.has(id)) return;
    shown.add(id);
    const t = tiles[active];
    t.classList.remove('active'); t.classList.add('missed');
    t.querySelector('.lbl').textContent = answerText(id, kind);
    input.value = ''; help.clear();
    const n = nextOpen(active, 1);
    if (n < 0) { input.blur(); api.done(); return; }
    select(n, true);
  }
  function step(d) { if (revealed) return; const i = nextOpen(active, d); if (i >= 0) select(i, true); }
  function accept() {
    const id = ids[active];
    if (revealed || found.has(id)) return;
    found.add(id); res.found.push(id);
    const t = tiles[active];
    t.classList.remove('active'); t.classList.add('done');
    t.querySelector('.lbl').textContent = answerText(id, kind);
    count(); help.clear();
    const n = nextOpen(active, 1);
    if (n < 0) { input.value = ''; input.blur(); api.done(); return; }
    select(n, true);
  }
  // Right answer → accepted the moment it's typed. Enter on a wrong answer just shakes (it never skips).
  input.addEventListener('input', () => {
    if (revealed) return;
    if (isRight(ids[active], kind, input.value)) accept(); else help.update();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if (!revealed) help.enter(); }
    else if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) { e.preventDefault(); step(-1); }
  });
  count(); select(0, true);

  return {
    completed() { head.classList.add('all-done'); foundEl.textContent = 'All ' + ids.length + ' found!'; },
    reveal(btn) {
      revealed = true; help.clear();
      input.disabled = true; input.value = ''; input.placeholder = 'Gave up';
      tiles[active].classList.remove('active');
      ids.forEach((id, i) => { if (!found.has(id)) { tiles[i].classList.add('missed'); tiles[i].querySelector('.lbl').textContent = answerText(id, kind); } });
      head.classList.add('gave-up');
      foundEl.textContent = found.size + ' / ' + ids.length + ' found · missed ' + (ids.length - found.size) + ' (in red)';
      footer.hidden = false; footer.replaceChildren(btn);
      window.scrollTo(0, 0);
    },
  };
}

/* Focus the answer box without the page jumping. Some phone browsers (iOS Safari especially) scroll to the top
   when an input inside a sticky header gets focus, so: don't refocus if it already has focus, and if the page
   jumped anyway, put it back where it was (also once more after the keyboard has finished opening). */
function keepFocus(input, tile) {
  if (document.activeElement === input) return;
  const y = window.scrollY;
  input.focus({ preventScroll: true });
  const restore = () => { if (window.scrollY < y - 40) { window.scrollTo(0, y); if (tile) tile.scrollIntoView({ block: 'nearest' }); } };
  requestAnimationFrame(restore); setTimeout(restore, 350);
}

/* Spelling help ("Did you mean …?"), used by the boards and Quick fire. Only on when the player turned it on.
   Suggestions come from every country (or capital) in the world, not just the right answer. Tapping one (or
   Enter when there's only one) tries it: right → accepted; wrong → it shakes like any wrong answer. */
function shake(input) { input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake'); }
function spellingHelp(input, el, kindOf, currentId, onRight, matcher) {
  let list = [];
  const kind0 = () => (typeof kindOf === 'function' ? kindOf() : kindOf);
  const on = () => !!(S.session && S.session.help);
  const clear = () => { list = []; el.hidden = true; el.replaceChildren(); };
  const tryText = (text) => {
    if (matcher ? matcher(text) : isRight(currentId(), kind0(), text)) { input.value = text; onRight(); }
    else { input.value = text; clear(); shake(input); }
    input.focus({ preventScroll: true });
  };
  return {
    clear,
    update() {
      if (!on()) return;
      list = suggest(input.value, kind0());
      if (!list.length) return clear();
      el.hidden = false;
      el.replaceChildren(...[h('span', null, 'Did you mean'), list.map((x, i) => [i ? h('span', null, 'or') : null,
        h('button', { class: 'sug', onmousedown: (e) => e.preventDefault(), onclick: () => tryText(x.text) }, x.text)]), h('span', null, '?')].flat(2).filter(Boolean));
    },
    enter() {
      if (on() && list.length === 1) return tryText(list[0].text);
      shake(input);
    },
  };
}
