/* ---- results, challenges, leaderboard ---- */
function shareUrl(cfg, score) {
  const p = new URLSearchParams({ c: encodeCode(cfg).replace('-', ''), n: score.name, t: String(score.time), s: String(score.correct) });
  return location.origin + location.pathname + '?' + p.toString();
}
async function share(cfg, score) {
  const url = shareUrl(cfg, score);
  const text = score.name + ' ran Geography Speedrun (' + cfgLabel(cfg) + (S.session && S.session.help ? ', with spelling help' : '') + '): ' + score.correct + '/' + score.total + ' in ' + fmtTime(score.time) + '. Beat it! Code: ' + encodeCode(cfg);
  if (navigator.share) { try { await navigator.share({ title: 'Geography Speedrun challenge', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text + '\n' + url); toast('Challenge link copied'); }
  catch (e) { prompt('Copy this link and send it:', url); }
}

// What you missed, per game.
function missedBoard(sec) {
  const G = gameOf(sec.game);
  const head = h('p', { class: 'eyebrow' }, G.em + ' ' + G.label + ' · ' + sec.found.length + '/' + sec.ids.length + (sec.skipped ? ' (not played)' : sec.gaveUp ? ' (gave up)' : ''));
  // Map: how many were right on the first tap.
  const first = (sec.game === 'map' || sec.game === 'flagmap') && sec.found.length ? sec.found.filter((id) => !(sec.tries && sec.tries[id])).length : null;
  const firstLine = first != null ? h('p', { class: 'small muted' }, '🎯 First tap right: ' + first + '/' + sec.ids.length + ' (' + Math.round(first / sec.ids.length * 100) + '%)') : null;
  if (!sec.missed.length) return h('div', { class: 'stack sm' }, head, firstLine, h('p', { class: 'small' }, h('span', { class: 'badge' }, 'All found 🎯')));
  let body;
  if (sec.game === 'flags' || sec.game === 'shapes') {
    body = h('div', { class: 'tiles small t-' + sec.game }, sec.missed.map((id) => h('div', { class: 'tile missed' }, tilePic(sec.game, id), h('span', { class: 'lbl' }, BY_ID[id].name))));
  } else if (sec.game === 'capitals') {
    body = h('ul', { class: 'pairs' }, sec.missed.map((id) => h('li', null, h('span', null, BY_ID[id].name), h('b', null, BY_ID[id].capital))));
  } else if (sec.game === 'revcap') {
    body = h('ul', { class: 'pairs' }, sec.missed.map((id) => h('li', null, h('span', null, BY_ID[id].capital), h('b', null, BY_ID[id].name))));
  } else if (sec.game === 'borders') {
    const by = {}; sec.missed.forEach((key) => { const [c, n] = key.split('>'); (by[c] = by[c] || []).push(BY_ID[n].name); });
    body = h('ul', { class: 'pairs' }, Object.entries(by).map(([c, ns]) => h('li', null, h('span', null, BY_ID[c].name), h('b', null, ns.join(', ')))));
  } else if (sec.game === 'duel') {
    body = h('ul', { class: 'pairs' }, sec.missed.map((key) => { const w = duelWinner(key), l = key.split('|').find((x) => x !== w); return h('li', null, h('span', null, BY_ID[w].name + ' > ' + BY_ID[l].name), h('b', null, BY_ID[w].area.toLocaleString('en-US') + ' km²')); }));
  } else {
    body = h('p', { class: 'namelist' }, sec.missed.map((id) => BY_ID[id].name).join(' · '));
  }
  return h('div', { class: 'stack sm' }, head, firstLine, body);
}
function missedQuick(score) {
  const miss = score.res.filter((x) => !x.ok);
  if (!miss.length) return h('p', { class: 'center' }, h('span', { class: 'badge' }, 'Perfect run! 🎯'));
  return [h('p', { class: 'eyebrow' }, 'Missed (' + miss.length + ')'), h('ul', { class: 'list' }, miss.map((x) => {
    const c = BY_ID[x.id];
    const pic = x.kind === 'flag' ? h('img', { class: 'mini', src: c.flag, alt: '' }) : x.kind === 'shape' ? shapeSvg(x.id, 'mini') : h('span', { class: 'mini', style: { background: 'none', fontSize: '24px', textAlign: 'center' } }, '🏛️');
    return h('li', null, pic, h('div', { class: 'q' }, answerText(x.id, x.kind), h('small', null, x.kind === 'capital' ? 'Capital of ' + c.name : x.kind === 'flag' ? 'Flag' : 'Outline')), h('span', { class: 'x' }, x.how === 'skip' ? 'SKIP +10s' : 'WRONG +5s'));
  }))];
}
function versus(score, ch, kind) {
  if (!ch || !ch.time) return null;
  const them = { time: ch.time, correct: ch.correct == null ? score.correct : ch.correct };
  const win = better(score, them, kind), lose = better(them, score, kind);
  let why = '';
  if (kind === 'board' && them.correct !== score.correct) why = ' (' + score.correct + ' vs ' + them.correct + ' found)';
  else why = ' by ' + fmtDiff(score.time - them.time);
  return h('p', { class: 'versus ' + (win ? 'win' : lose ? 'lose' : '') }, win ? 'You beat ' + ch.name + why + '! 🏆' : lose ? ch.name + ' wins' + why + '.' : 'Dead heat with ' + ch.name + '!');
}
function result(score) {
  const se = S.session, many = se.players.length > 1, last = se.idx >= se.players.length - 1, board = se.cfg.kind === 'board';
  mount(h('div', { class: 'app' },
    topbar(cfgLabel(se.cfg), null),
    h('div', { class: 'center stack', style: { gap: '6px' } },
      many ? h('p', { class: 'eyebrow' }, score.name) : null,
      h('div', { class: 'result-time' }, fmtTime(score.time)),
      score.best ? h('div', null, h('span', { class: 'badge' }, '★ New best on this device')) : null,
      se.help ? h('p', { class: 'small muted' }, '💡 With spelling help') : null,
      se.daily != null ? h('p', { class: 'small muted' }, '📅 Daily run · ' + dayLabel(se.daily) + (score.dailyFirst ? ' · this is your score for today' : ' · replay (your first go counts)')) : null),
    se.daily != null ? h('button', { class: 'btn gold small', onclick: () => shareDaily(se.daily, store.get('gs_daily_v1', {})[se.daily] || score) }, '📤 Share today\'s result') : null,
    versus(score, se.challenge, se.cfg.kind),
    h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('b', null, score.correct + '/' + score.total), h('span', null, board ? 'Found' : 'Right')),
      board ? h('div', { class: 'stat' }, h('b', null, Math.round(score.correct / score.total * 100) + '%'), h('span', null, 'Score')) : h('div', { class: 'stat' }, h('b', null, fmtTime(score.raw)), h('span', null, 'Clock')),
      board ? h('div', { class: 'stat' }, h('b', null, String(score.sections.length)), h('span', null, score.sections.length > 1 ? 'Games' : 'Game')) : h('div', { class: 'stat' }, h('b', null, '+' + score.pen / 1000 + 's'), h('span', null, 'Penalty'))),
    many && !last ? h('button', { class: 'btn primary', onclick: () => { se.idx++; cover(); } }, 'Next: ' + se.players[se.idx + 1] + ' →') : null,
    many && last ? h('button', { class: 'btn primary', onclick: leaderboard }, '🏁 See who won') : null,
    !many ? h('div', { class: 'card sky' },
      h('p', { class: 'eyebrow' }, 'Challenge a friend'),
      h('p', { class: 'small' }, board ? 'They get the exact same boards in the same order, and see your score to beat.' : 'They get the exact same questions in the same order, and see your time to beat.'),
      h('div', { class: 'code num' }, encodeCode(se.cfg)),
      !S.myName && score.name === 'You' ? nameField() : null,
      h('button', { class: 'btn primary small', onclick: () => { if (score.name === 'You' && S.myName) score.name = S.myName; share(se.cfg, score); } }, '📤 Send challenge')) : null,
    h('div', { class: 'stack' }, board ? score.sections.map(missedBoard) : missedQuick(score)),
    !many ? afterButtons() : null,
  ));
}
function afterButtons() {
  const se = S.session;
  return h('div', { class: 'stack' },
    h('div', { class: 'row' },
      h('button', { class: 'btn primary small', onclick: () => startSession(Object.assign({}, se.cfg, { seed: newSeed() }), se.players, null) }, '🎲 Play again'),
      h('button', { class: 'btn ghost small', onclick: () => startSession(se.cfg, se.players, se.challenge, se.daily) }, '↻ Same order')),
    h('div', { class: 'row' },
      h('button', { class: 'btn ghost small', onclick: setup }, '⚙ Change'),
      h('button', { class: 'btn ghost small', onclick: home }, '⌂ Home')));
}
function leaderboard() {
  const se = S.session;
  const ranked = se.scores.slice().sort(compare(se.cfg.kind));
  const resultText = 'Geography Speedrun (' + cfgLabel(se.cfg) + ')\n' + ranked.map((s, i) => (i + 1) + '. ' + s.name + ' ' + s.correct + '/' + s.total + ' in ' + fmtTime(s.time)).join('\n') + '\nCode: ' + encodeCode(se.cfg);
  mount(h('div', { class: 'app' },
    topbar('Results', null),
    h('div', { class: 'center' }, h('p', { class: 'eyebrow' }, 'Winner'), h('h2', { class: 'display', style: { fontSize: '56px', color: 'var(--gold)' } }, ranked[0].name)),
    h('ul', { class: 'list board' }, ranked.map((s, i) => h('li', { class: i === 0 ? 'first' : null },
      h('span', { class: 'rank' }, String(i + 1)),
      h('div', { class: 'q' }, s.name, h('small', null, s.correct + '/' + s.total + (se.cfg.kind === 'board' ? ' found' : ' right · +' + s.pen / 1000 + 's penalty'))),
      h('div', { class: 't' }, fmtTime(s.time), i && s.correct === ranked[0].correct ? h('small', null, '+' + fmtDiff(s.time - ranked[0].time)) : null)))),
    h('button', { class: 'btn ghost small', onclick: async () => { try { await navigator.clipboard.writeText(resultText); toast('Results copied'); } catch (e) { prompt('Copy the results:', resultText); } } }, '📋 Copy results'),
    afterButtons()));
}
