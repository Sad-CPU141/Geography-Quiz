# Geography Speedrun

A Game Night game: name **flags**, **country shapes** or **capitals** (or a **mix**) as fast as you can.
The clock runs the whole time; skips (+10 s) and wrong taps (+5 s) add penalty time. Lowest time wins.

**Play:** https://sad-cpu141.github.io/Geography-Quiz/ · part of [Game Night](https://sad-cpu141.github.io/)

- Pick a region (World, Africa, Asia, Europe, North & Central America, South America, Oceania) and a length (10 up to all 197).
- Answer by typing (it moves on by itself as soon as the answer is right) or by picking from four.
- **Challenge a friend:** every run has an 8-character code. Send the link and your friend gets the exact same
  questions in the same order, with your time to beat. Or type the code on the home screen.
- **Pass the phone:** 2–8 players take turns on the same run, then see a leaderboard.
- Best times are kept on the device. Works offline once opened (service worker).

## Developing
Static site, plain JavaScript, no libraries at runtime.

```
npm install
npm run data    # rebuild src/data.js and flags/ from the data packages (only if the data changes)
npm run build   # src/ → index.html, app.js, data.js, styles.css, sw.js (stamps a version)
npm test        # logic checks (answer matching, challenge codes, runs)
npm run shots   # real-browser play-throughs + screenshots at phone/laptop/TV sizes (needs Playwright)
```

Credits: see [CREDITS.md](CREDITS.md).
