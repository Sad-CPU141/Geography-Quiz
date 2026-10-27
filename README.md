# Geography Speedrun

A Game Night game: geography against the clock.

**Play:** https://sad-cpu141.github.io/Geography-Quiz/ · part of [Game Night](https://sad-cpu141.github.io/)

- **Full board** (JetPunk & Seterra style): pick any of **Flags**, **Map**, **Capitals** and **Shapes**, in the order you want, and play them back to back on one clock.
  - Flags / Shapes / Capitals: every country on one board, in a random order. Tap a tile, type the answer, it fills in and jumps to the next.
  - Map: the whole map; it names a country and you tap it (3 tries, then you have to tap the right one). Small islands have rings to tap. Pinch or scroll to zoom.
  - Give up any time to see what you missed. Most found wins; the faster time breaks a tie.
- **More games** (in a fold-out): Reverse Capitals, Map: name it, Borders, Flag → Map, Bigger country. Mix them into any run.
- **Daily run** on the home page: the same run for everyone each day, with your score and streak.
- **Spelling help** (optional): "Did you mean …?" when you're close.
- **Quick fire**: one question at a time, type it or pick from 4, with time penalties.
- Regions: World (196), Africa, Asia, Europe, North & Central America, South America, Oceania.
- **Challenge a friend:** every run has an 8-character code. Send the link and your friend gets exactly the same run, with your score to beat.
- **Pass the phone:** 2–8 players take turns on the same run, then see a leaderboard.
- Best times are kept on the device. Works offline once opened.

## Developing
Static site, plain JavaScript, no libraries at runtime.

```
npm install
npm run data    # rebuild src/data.js and flags/ from the data packages (only if the data changes)
npm run map     # rebuild src/map.js (the clickable map) after npm run data
npm run build   # src/ → index.html, app.js, data.js, styles.css, sw.js (stamps a version)
npm test        # build + logic checks (answer matching, challenge codes, boards, map data)
npm run shots   # real-browser play-throughs + screenshots at phone/laptop/TV sizes (needs Playwright)
```

Credits: see [CREDITS.md](CREDITS.md).
