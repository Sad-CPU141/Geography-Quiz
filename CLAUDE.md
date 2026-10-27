# Geography Speedrun — notes for Claude

Read this first in every new chat about this repo.

## The owner's standing rules (same as the other Game Night games)
- Never claim a feature is implemented, tested or deployed unless it really is. Say which tests you ran and what wasn't tested (real phones, iOS Safari, real TVs).
- No backend or paid services without warning the owner first.
- No copyrighted artwork or characters. No invented facts.
- Check layouts with screenshots at phone (360px), laptop and TV (1920×1080) sizes (`npm run shots`).
- Work step by step; keep features that already work.
- English only.

## Key facts
- **Name:** the game is called **Geography Speedrun**; the repo (and so the web address) is **Geography-Quiz**.
- **Live site:** https://sad-cpu141.github.io/Geography-Quiz/ (GitHub Pages, `main` branch, root folder).
- **Repo:** Sad-CPU141/Geography-Quiz. **Hub:** Sad-CPU141/sad-cpu141.github.io has a card for it. **Siblings:** Draft Night, Khatfa, Jeopardy-Board, Barra Al-Salfa (it copies their look, loads nothing from them).
- **Look:** the family ink/purple palette with gold; this game's accent is sky blue `#5aa8ff`. Fonts self-hosted in `fonts/`.
- **Tech:** plain JavaScript, no React, no bundler. Edit `src/`, then `npm run build`. Never edit `index.html`, `app.js`, `data.js`, `map.js`, `styles.css` or `sw.js` at the root by hand.
- `src/js/*.js` are joined in name order into `app.js` inside one function: `00-core` (data, matching, runs, codes, ranking — no DOM; exposed as `window.GS`, tested by `tests/run.js`), `10-ui` (DOM helper, home, setup, code entry, best times), `20-session` (sessions, clock, board run flow, give up, Quick fire), `30-grid` (flags/shapes/capitals boards), `40-map` (map game), `50-results`, `90-start`.
- `src/data.js` + `flags/` come from `tools/data.js` (`npm run data`): world-countries (ODbL), world-atlas/Natural Earth, flag-icons. Accepted spellings (`NAME_ALIASES`), capitals (`CAPITALS`) and outline crops (`BOX`, `KEEP_ALL`) live there.
- `src/map.js` comes from `tools/map.js` (`npm run map`): Natural Earth projection, a world map and a Pacific-centred one (for Oceania), tap circles for tiny countries, region views. Loaded only when a run has the Map game.

## Game rules
- **Full board** (default): pick 1–4 games in any order — Flags, Map, Capitals, Shapes — and a region. One clock for the whole run; it ends after the last game.
  - Flags / Shapes / Capitals (JetPunk style): every country is a tile (flags and shapes shuffled, capitals A–Z by country). One tile is selected; typing its answer fills it in and selects the next empty tile. Tap a tile or ◀ ▶ to switch; Enter = next.
  - Map (Seterra style): it names a country, you tap it. Colour by attempt: green / yellow / orange; 3 wrong taps → shown red, counts as missed (clock paused 1.3 s while shown). Skip sends it to the back. Pinch/drag/wheel/+−/⤢. Grey = not in the game.
  - Give up: reveals the misses (red) with the clock paused; then next game, or "End the whole run" (later games count as all missed).
  - Ranking: most found, then fastest.
- **Quick fire**: one question at a time, type or pick from 4, penalties (skip +10 s, wrong +5 s), lowest time wins.
- Matching ignores case, accents, punctuation, spaces, a leading "the"; "Saint"="St"; "City" at the end / "City of" at the start is optional. An answer is accepted the moment it matches (e.g. "Bosnia").
- Challenge code: 8 chars Crockford base32 = K 15 bits (kind 1 + quick: mode 2, region 3, style 1, count 8 | board: game order 6 (index into 64 orders), region 3, zeros 5) scrambled with the seed, seed 21, check 4. Links: `?c=CODE&n=name&t=ms&s=found` (honour system).
- Pass the phone: 2–8 names, same run each, leaderboard.
- Best times are per kind of run, in `localStorage` key `gs_best_v2`.

## Not done yet / not tested
- Not tested on real phones, iOS Safari or a real TV (only Playwright Chromium at 360/1366/1920 widths).
- No online head-to-head (both players live at once); challenges are honour-system.
- Pinch-zoom on the map is only tested with mouse wheel / buttons in Playwright, not real touch.
- Codes from the very first version (before Full board) no longer work.
