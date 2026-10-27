// Builds the static site from src/ and stamps a version into index.html, the styles and the service worker.
// Run: node build.js   (run `npm run data` first if the country data changed)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const src = path.join(__dirname, 'src');
const read = (f) => fs.readFileSync(path.join(src, f), 'utf8');
const app = read('app.js'), data = read('data.js'), css = read('styles.css');
const flags = fs.readdirSync(path.join(__dirname, 'flags')).filter((f) => f.endsWith('.svg')).sort().map((f) => './flags/' + f);
const version = crypto.createHash('sha1').update(app + data + css + flags.join()).digest('hex').slice(0, 10);
const w = (f, s) => fs.writeFileSync(path.join(__dirname, f), s);
w('app.js', '/* Geography Speedrun ' + version + ' — built from src/app.js by build.js. Edit src/, not this file. */\n' + app);
w('data.js', data);
w('styles.css', '/* Geography Speedrun ' + version + ' — built from src/styles.css */\n' + css);
w('index.html', read('index.template.html').replace(/__VERSION__/g, version));
w('sw.js', read('sw.template.js').replace(/__VERSION__/g, version).replace('__FLAGS__', JSON.stringify(flags)));
w('version.json', JSON.stringify({ version, builtAt: new Date().toISOString() }) + '\n');
console.log('Built Geography Speedrun ' + version + ' (' + flags.length + ' flags)');
